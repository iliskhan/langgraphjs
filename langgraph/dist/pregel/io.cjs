"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.single = exports.mapOutputUpdates = exports.mapOutputValues = exports.mapDebugTaskResults = exports.mapDebugTasks = exports.mapInput = exports.readChannels = exports.readChannel = void 0;
const uuid_1 = require("uuid");
const constants_js_1 = require("../constants.cjs");
const errors_js_1 = require("../errors.cjs");
function readChannel(channels, chan, catch_ = true, returnException = false) {
    try {
        return channels[chan].get();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
    catch (e) {
        if (e.name === errors_js_1.EmptyChannelError.unminifiable_name) {
            if (returnException) {
                return e;
            }
            else if (catch_) {
                return null;
            }
        }
        throw e;
    }
}
exports.readChannel = readChannel;
function readChannels(channels, select, skipEmpty = true
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
    if (Array.isArray(select)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const values = {};
        for (const k of select) {
            try {
                values[k] = readChannel(channels, k, !skipEmpty);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }
            catch (e) {
                if (e.name === errors_js_1.EmptyChannelError.unminifiable_name) {
                    continue;
                }
            }
        }
        return values;
    }
    else {
        return readChannel(channels, select);
    }
}
exports.readChannels = readChannels;
/**
 * Map input chunk to a sequence of pending writes in the form [channel, value].
 */
function* mapInput(inputChannels, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
chunk
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
    if (chunk !== undefined && chunk !== null) {
        if (Array.isArray(inputChannels) &&
            typeof chunk === "object" &&
            !Array.isArray(chunk)) {
            for (const k in chunk) {
                if (inputChannels.includes(k)) {
                    yield [k, chunk[k]];
                }
            }
        }
        else if (Array.isArray(inputChannels)) {
            throw new Error("Input chunk must be an object when inputChannels is an array");
        }
        else {
            yield [inputChannels, chunk];
        }
    }
}
exports.mapInput = mapInput;
function* mapDebugTasks(step, tasks) {
    const ts = new Date().toISOString();
    for (const { name, input, config, triggers } of tasks) {
        if (config?.tags?.includes(constants_js_1.TAG_HIDDEN))
            continue;
        const metadata = { ...config?.metadata };
        delete metadata.checkpoint_id;
        yield {
            type: "task",
            timestamp: ts,
            step,
            payload: {
                id: (0, uuid_1.v5)(JSON.stringify([name, step, metadata]), constants_js_1.TASK_NAMESPACE),
                name,
                input,
                triggers,
            },
        };
    }
}
exports.mapDebugTasks = mapDebugTasks;
function* mapDebugTaskResults(step, tasks, streamChannelsList) {
    const ts = new Date().toISOString();
    for (const { name, writes, config } of tasks) {
        if (config?.tags?.includes(constants_js_1.TAG_HIDDEN))
            continue;
        const metadata = { ...config?.metadata };
        delete metadata.checkpoint_id;
        yield {
            type: "task_result",
            timestamp: ts,
            step,
            payload: {
                id: (0, uuid_1.v5)(JSON.stringify([name, step, metadata]), constants_js_1.TASK_NAMESPACE),
                name,
                result: writes.filter(([channel]) => streamChannelsList.includes(channel)),
            },
        };
    }
}
exports.mapDebugTaskResults = mapDebugTaskResults;
/**
 * Map pending writes (a sequence of tuples (channel, value)) to output chunk.
 */
function* mapOutputValues(outputChannels, pendingWrites, channels
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
    if (Array.isArray(outputChannels)) {
        if (pendingWrites.find(([chan, _]) => outputChannels.includes(chan))) {
            yield readChannels(channels, outputChannels);
        }
    }
    else {
        if (pendingWrites.some(([chan, _]) => chan === outputChannels)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            yield readChannel(channels, outputChannels);
        }
    }
}
exports.mapOutputValues = mapOutputValues;
/**
 * Map pending writes (a sequence of tuples (channel, value)) to output chunk.
 */
function* mapOutputUpdates(outputChannels, tasks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
    const outputTasks = tasks.filter((task) => task.config === undefined || !task.config.tags?.includes(constants_js_1.TAG_HIDDEN));
    if (!outputTasks.length) {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updated;
    if (!Array.isArray(outputChannels)) {
        updated = outputTasks.flatMap((task) => task.writes
            .filter(([chan, _]) => chan === outputChannels)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map(([_, value]) => [task.name, value]));
    }
    else {
        updated = outputTasks
            .filter((task) => task.writes.some(([chan]) => outputChannels.includes(chan)))
            .map((task) => [
            task.name,
            Object.fromEntries(task.writes.filter(([chan]) => outputChannels.includes(chan))),
        ]);
    }
    const grouped = Object.fromEntries(outputTasks.map((t) => [t.name, []])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    );
    for (const [node, value] of updated) {
        grouped[node].push(value);
    }
    for (const [node, value] of Object.entries(grouped)) {
        if (value.length === 0) {
            delete grouped[node];
        }
        else if (value.length === 1) {
            // TODO: Fix incorrect cast here
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            grouped[node] = value[0];
        }
    }
    yield grouped;
}
exports.mapOutputUpdates = mapOutputUpdates;
function single(iter) {
    // eslint-disable-next-line no-unreachable-loop
    for (const value of iter) {
        return value;
    }
    return null;
}
exports.single = single;
