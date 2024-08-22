/* eslint-disable no-param-reassign */
import { mergeConfigs, patchConfig } from "@langchain/core/runnables";
import { createCheckpoint, emptyChannels, } from "../channels/base.js";
import { copyCheckpoint, getChannelVersion, getVersionSeen, } from "../checkpoint/base.js";
import { readChannel, readChannels } from "./io.js";
import { _isSend, _isSendInterface, CONFIG_KEY_READ, CONFIG_KEY_SEND, INTERRUPT, TAG_HIDDEN, TASKS, } from "../constants.js";
import { EmptyChannelError, InvalidUpdateError } from "../errors.js";
export async function executeTasks(tasks, stepTimeout, signal) {
    if (stepTimeout && signal) {
        if ("any" in AbortSignal) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            signal = AbortSignal.any([
                signal,
                AbortSignal.timeout(stepTimeout),
            ]);
        }
    }
    else if (stepTimeout) {
        signal = AbortSignal.timeout(stepTimeout);
    }
    // Abort if signal is aborted
    signal?.throwIfAborted();
    // Start all tasks
    const started = tasks.map((task) => task());
    // Wait for all tasks to settle
    // If any tasks fail, or signal is aborted, the promise will reject
    await Promise.all(signal
        ? [
            ...started,
            new Promise((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(new Error("Abort")));
            }),
        ]
        : started);
}
export function _shouldInterrupt(checkpoint, interruptNodes, snapshotChannels, tasks) {
    const anySnapshotChannelUpdated = snapshotChannels.some((chan) => getChannelVersion(checkpoint, chan) >
        getVersionSeen(checkpoint, INTERRUPT, chan));
    const anyTaskNodeInInterruptNodes = tasks.some((task) => interruptNodes === "*"
        ? !task.config?.tags?.includes(TAG_HIDDEN)
        : interruptNodes.includes(task.name));
    return anySnapshotChannelUpdated && anyTaskNodeInInterruptNodes;
}
export function _localRead(checkpoint, channels, writes, select, fresh = false) {
    if (fresh) {
        const newCheckpoint = createCheckpoint(checkpoint, channels, -1);
        // create a new copy of channels
        const newChannels = emptyChannels(channels, newCheckpoint);
        // Note: _applyWrites contains side effects
        _applyWrites(copyCheckpoint(newCheckpoint), newChannels, writes);
        return readChannels(newChannels, select);
    }
    else {
        return readChannels(channels, select);
    }
}
export function _localWrite(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
commit, processes, channels, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
writes) {
    for (const [chan, value] of writes) {
        if (chan === TASKS) {
            if (!_isSend(value)) {
                throw new InvalidUpdateError(`Invalid packet type, expected SendProtocol, got ${JSON.stringify(value)}`);
            }
            if (!(value.node in processes)) {
                throw new InvalidUpdateError(`Invalid node name ${value.node} in packet`);
            }
        }
        else if (!(chan in channels)) {
            console.warn(`Skipping write for channel '${chan}' which has no readers`);
        }
    }
    commit(writes);
}
export function _applyWrites(checkpoint, channels, pendingWrites) {
    if (checkpoint.pending_sends) {
        checkpoint.pending_sends = [];
    }
    const pendingWritesByChannel = {};
    // Group writes by channel
    for (const [chan, val] of pendingWrites) {
        if (chan === TASKS) {
            checkpoint.pending_sends.push({
                node: val.node,
                args: val.args,
            });
        }
        else {
            if (chan in pendingWritesByChannel) {
                pendingWritesByChannel[chan].push(val);
            }
            else {
                pendingWritesByChannel[chan] = [val];
            }
        }
    }
    // find the highest version of all channels
    let maxVersion = 0;
    if (Object.keys(checkpoint.channel_versions).length > 0) {
        maxVersion = Math.max(...Object.values(checkpoint.channel_versions));
    }
    const updatedChannels = new Set();
    // Apply writes to channels
    for (const [chan, vals] of Object.entries(pendingWritesByChannel)) {
        if (chan in channels) {
            // side effect: update channels
            try {
                channels[chan].update(vals);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }
            catch (e) {
                if (e.name === InvalidUpdateError.unminifiable_name) {
                    throw new InvalidUpdateError(`Invalid update for channel ${chan}. Values: ${vals}\n\nError: ${e.message}`);
                }
            }
            // side effect: update checkpoint channel versions
            checkpoint.channel_versions[chan] = maxVersion + 1;
            updatedChannels.add(chan);
        }
        else {
            console.warn(`Skipping write for channel ${chan} which has no readers`);
        }
    }
    // Channels that weren't updated in this step are notified of a new step
    for (const chan in channels) {
        if (!updatedChannels.has(chan)) {
            // side effect: update channels
            channels[chan].update([]);
        }
    }
}
export function _prepareNextTasks(checkpoint, processes, channels, forExecution, extra) {
    const newCheckpoint = copyCheckpoint(checkpoint);
    const tasks = [];
    const taskDescriptions = [];
    for (const packet of checkpoint.pending_sends) {
        if (!_isSendInterface(packet)) {
            console.warn(`Ignoring invalid packet ${JSON.stringify(packet)} in pending sends.`);
            continue;
        }
        if (!(packet.node in processes)) {
            console.warn(`Ignoring unknown node name ${packet.node} in pending sends.`);
            continue;
        }
        if (forExecution) {
            const proc = processes[packet.node];
            const node = proc.getNode();
            if (node !== undefined) {
                const triggers = [TASKS];
                const metadata = {
                    langgraph_step: extra.step,
                    langgraph_node: packet.node,
                    langgraph_triggers: triggers,
                    langgraph_task_idx: tasks.length,
                };
                const writes = [];
                tasks.push({
                    name: packet.node,
                    input: packet.args,
                    proc: node,
                    writes,
                    triggers,
                    config: patchConfig(mergeConfigs(proc.config, processes[packet.node].config, {
                        metadata,
                    }), {
                        runName: packet.node,
                        // callbacks:
                        configurable: {
                            [CONFIG_KEY_SEND]: _localWrite.bind(undefined, (items) => writes.push(...items), processes, channels),
                            [CONFIG_KEY_READ]: _localRead.bind(undefined, checkpoint, channels, writes),
                        },
                    }),
                });
            }
        }
        else {
            taskDescriptions.push({
                name: packet.node,
                input: packet.args,
            });
        }
    }
    // Check if any processes should be run in next step
    // If so, prepare the values to be passed to them
    for (const [name, proc] of Object.entries(processes)) {
        const hasUpdatedChannels = proc.triggers
            .filter((chan) => {
            try {
                readChannel(channels, chan, false);
                return true;
            }
            catch (e) {
                return false;
            }
        })
            .some((chan) => getChannelVersion(newCheckpoint, chan) >
            getVersionSeen(newCheckpoint, name, chan));
        // If any of the channels read by this process were updated
        if (hasUpdatedChannels) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let val;
            // If all trigger channels subscribed by this process are not empty
            // then invoke the process with the values of all non-empty channels
            if (Array.isArray(proc.channels)) {
                let emptyChannels = 0;
                for (const chan of proc.channels) {
                    try {
                        val = readChannel(channels, chan, false);
                        break;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    }
                    catch (e) {
                        if (e.name === EmptyChannelError.unminifiable_name) {
                            emptyChannels += 1;
                            continue;
                        }
                        else {
                            throw e;
                        }
                    }
                }
                if (emptyChannels === proc.channels.length) {
                    continue;
                }
            }
            else if (typeof proc.channels === "object") {
                val = {};
                try {
                    for (const [k, chan] of Object.entries(proc.channels)) {
                        val[k] = readChannel(channels, chan, !proc.triggers.includes(chan));
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }
                catch (e) {
                    if (e.name === EmptyChannelError.unminifiable_name) {
                        continue;
                    }
                    else {
                        throw e;
                    }
                }
            }
            else {
                throw new Error(`Invalid channels type, expected list or dict, got ${proc.channels}`);
            }
            // If the process has a mapper, apply it to the value
            if (proc.mapper !== undefined) {
                val = proc.mapper(val);
            }
            if (forExecution) {
                // Update seen versions
                if (!newCheckpoint.versions_seen[name]) {
                    newCheckpoint.versions_seen[name] = {};
                }
                proc.triggers.forEach((chan) => {
                    const version = newCheckpoint.channel_versions[chan];
                    if (version !== undefined) {
                        // side effect: updates newCheckpoint
                        newCheckpoint.versions_seen[name][chan] = version;
                    }
                });
                const node = proc.getNode();
                if (node !== undefined) {
                    const metadata = {
                        langgraph_step: extra.step,
                        langgraph_node: name,
                        langgraph_triggers: proc.triggers,
                        langgraph_task_idx: tasks.length,
                    };
                    const writes = [];
                    tasks.push({
                        name,
                        input: val,
                        proc: node,
                        writes,
                        triggers: proc.triggers,
                        config: patchConfig(mergeConfigs(proc.config, { metadata }), {
                            runName: name,
                            configurable: {
                                [CONFIG_KEY_SEND]: _localWrite.bind(undefined, (items) => writes.push(...items), processes, channels),
                                [CONFIG_KEY_READ]: _localRead.bind(undefined, checkpoint, channels, writes),
                            },
                        }),
                    });
                }
            }
            else {
                taskDescriptions.push({
                    name,
                    input: val,
                });
            }
        }
    }
    return [newCheckpoint, forExecution ? tasks : taskDescriptions];
}
