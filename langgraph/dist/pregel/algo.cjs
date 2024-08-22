"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._prepareNextTasks = exports._applyWrites = exports._localWrite = exports._localRead = exports._shouldInterrupt = exports.executeTasks = void 0;
/* eslint-disable no-param-reassign */
const runnables_1 = require("@langchain/core/runnables");
const base_js_1 = require("../channels/base.cjs");
const base_js_2 = require("../checkpoint/base.cjs");
const io_js_1 = require("./io.cjs");
const constants_js_1 = require("../constants.cjs");
const errors_js_1 = require("../errors.cjs");
async function executeTasks(tasks, stepTimeout, signal) {
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
exports.executeTasks = executeTasks;
function _shouldInterrupt(checkpoint, interruptNodes, snapshotChannels, tasks) {
    const anySnapshotChannelUpdated = snapshotChannels.some((chan) => (0, base_js_2.getChannelVersion)(checkpoint, chan) >
        (0, base_js_2.getVersionSeen)(checkpoint, constants_js_1.INTERRUPT, chan));
    const anyTaskNodeInInterruptNodes = tasks.some((task) => interruptNodes === "*"
        ? !task.config?.tags?.includes(constants_js_1.TAG_HIDDEN)
        : interruptNodes.includes(task.name));
    return anySnapshotChannelUpdated && anyTaskNodeInInterruptNodes;
}
exports._shouldInterrupt = _shouldInterrupt;
function _localRead(checkpoint, channels, writes, select, fresh = false) {
    if (fresh) {
        const newCheckpoint = (0, base_js_1.createCheckpoint)(checkpoint, channels, -1);
        // create a new copy of channels
        const newChannels = (0, base_js_1.emptyChannels)(channels, newCheckpoint);
        // Note: _applyWrites contains side effects
        _applyWrites((0, base_js_2.copyCheckpoint)(newCheckpoint), newChannels, writes);
        return (0, io_js_1.readChannels)(newChannels, select);
    }
    else {
        return (0, io_js_1.readChannels)(channels, select);
    }
}
exports._localRead = _localRead;
function _localWrite(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
commit, processes, channels, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
writes) {
    for (const [chan, value] of writes) {
        if (chan === constants_js_1.TASKS) {
            if (!(0, constants_js_1._isSend)(value)) {
                throw new errors_js_1.InvalidUpdateError(`Invalid packet type, expected SendProtocol, got ${JSON.stringify(value)}`);
            }
            if (!(value.node in processes)) {
                throw new errors_js_1.InvalidUpdateError(`Invalid node name ${value.node} in packet`);
            }
        }
        else if (!(chan in channels)) {
            console.warn(`Skipping write for channel '${chan}' which has no readers`);
        }
    }
    commit(writes);
}
exports._localWrite = _localWrite;
function _applyWrites(checkpoint, channels, pendingWrites) {
    if (checkpoint.pending_sends) {
        checkpoint.pending_sends = [];
    }
    const pendingWritesByChannel = {};
    // Group writes by channel
    for (const [chan, val] of pendingWrites) {
        if (chan === constants_js_1.TASKS) {
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
                if (e.name === errors_js_1.InvalidUpdateError.unminifiable_name) {
                    throw new errors_js_1.InvalidUpdateError(`Invalid update for channel ${chan}. Values: ${vals}\n\nError: ${e.message}`);
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
exports._applyWrites = _applyWrites;
function _prepareNextTasks(checkpoint, processes, channels, forExecution, extra) {
    const newCheckpoint = (0, base_js_2.copyCheckpoint)(checkpoint);
    const tasks = [];
    const taskDescriptions = [];
    for (const packet of checkpoint.pending_sends) {
        if (!(0, constants_js_1._isSendInterface)(packet)) {
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
                const triggers = [constants_js_1.TASKS];
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
                    config: (0, runnables_1.patchConfig)((0, runnables_1.mergeConfigs)(proc.config, processes[packet.node].config, {
                        metadata,
                    }), {
                        runName: packet.node,
                        // callbacks:
                        configurable: {
                            [constants_js_1.CONFIG_KEY_SEND]: _localWrite.bind(undefined, (items) => writes.push(...items), processes, channels),
                            [constants_js_1.CONFIG_KEY_READ]: _localRead.bind(undefined, checkpoint, channels, writes),
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
                (0, io_js_1.readChannel)(channels, chan, false);
                return true;
            }
            catch (e) {
                return false;
            }
        })
            .some((chan) => (0, base_js_2.getChannelVersion)(newCheckpoint, chan) >
            (0, base_js_2.getVersionSeen)(newCheckpoint, name, chan));
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
                        val = (0, io_js_1.readChannel)(channels, chan, false);
                        break;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    }
                    catch (e) {
                        if (e.name === errors_js_1.EmptyChannelError.unminifiable_name) {
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
                        val[k] = (0, io_js_1.readChannel)(channels, chan, !proc.triggers.includes(chan));
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }
                catch (e) {
                    if (e.name === errors_js_1.EmptyChannelError.unminifiable_name) {
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
                        config: (0, runnables_1.patchConfig)((0, runnables_1.mergeConfigs)(proc.config, { metadata }), {
                            runName: name,
                            configurable: {
                                [constants_js_1.CONFIG_KEY_SEND]: _localWrite.bind(undefined, (items) => writes.push(...items), processes, channels),
                                [constants_js_1.CONFIG_KEY_READ]: _localRead.bind(undefined, checkpoint, channels, writes),
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
exports._prepareNextTasks = _prepareNextTasks;
