"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pregel = exports.Channel = void 0;
/* eslint-disable no-param-reassign */
const runnables_1 = require("@langchain/core/runnables");
const stream_1 = require("@langchain/core/utils/stream");
const base_js_1 = require("../channels/base.cjs");
const base_js_2 = require("../checkpoint/base.cjs");
const read_js_1 = require("./read.cjs");
const validate_js_1 = require("./validate.cjs");
const io_js_1 = require("./io.cjs");
const write_js_1 = require("./write.cjs");
const constants_js_1 = require("../constants.cjs");
const errors_js_1 = require("../errors.cjs");
const algo_js_1 = require("./algo.cjs");
const DEFAULT_LOOP_LIMIT = 25;
function isString(value) {
    return typeof value === "string";
}
function* prefixGenerator(generator, prefix) {
    if (!prefix)
        yield* generator;
    for (const value of generator)
        yield [prefix, value];
}
class Channel {
    static subscribeTo(channels, options) {
        const { key, tags } = options ?? {};
        if (Array.isArray(channels) && key !== undefined) {
            throw new Error("Can't specify a key when subscribing to multiple channels");
        }
        let channelMappingOrArray;
        if (isString(channels)) {
            if (key) {
                channelMappingOrArray = { [key]: channels };
            }
            else {
                channelMappingOrArray = [channels];
            }
        }
        else {
            channelMappingOrArray = Object.fromEntries(channels.map((chan) => [chan, chan]));
        }
        const triggers = Array.isArray(channels) ? channels : [channels];
        return new read_js_1.PregelNode({
            channels: channelMappingOrArray,
            triggers,
            tags,
        });
    }
    static writeTo(channels, kwargs) {
        const channelWriteEntries = [];
        for (const channel of channels) {
            channelWriteEntries.push({
                channel,
                value: write_js_1.PASSTHROUGH,
                skipNone: false,
            });
        }
        for (const [key, value] of Object.entries(kwargs ?? {})) {
            if (runnables_1.Runnable.isRunnable(value) || typeof value === "function") {
                channelWriteEntries.push({
                    channel: key,
                    value: write_js_1.PASSTHROUGH,
                    skipNone: true,
                    mapper: (0, runnables_1._coerceToRunnable)(value),
                });
            }
            else {
                channelWriteEntries.push({
                    channel: key,
                    value,
                    skipNone: false,
                });
            }
        }
        return new write_js_1.ChannelWrite(channelWriteEntries);
    }
}
exports.Channel = Channel;
class Pregel extends runnables_1.Runnable {
    static lc_name() {
        return "LangGraph";
    }
    constructor(fields) {
        super(fields);
        // Because Pregel extends `Runnable`.
        Object.defineProperty(this, "lc_namespace", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ["langgraph", "pregel"]
        });
        Object.defineProperty(this, "nodes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "channels", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "inputs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "outputs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "autoValidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "streamMode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ["values"]
        });
        Object.defineProperty(this, "streamChannels", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "interruptAfter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "interruptBefore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "stepTimeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "debug", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "checkpointer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        let { streamMode } = fields;
        if (streamMode != null && !Array.isArray(streamMode)) {
            streamMode = [streamMode];
        }
        this.nodes = fields.nodes;
        this.channels = fields.channels;
        this.autoValidate = fields.autoValidate ?? this.autoValidate;
        this.streamMode = streamMode ?? this.streamMode;
        this.outputs = fields.outputs;
        this.streamChannels = fields.streamChannels ?? this.streamChannels;
        this.interruptAfter = fields.interruptAfter;
        this.interruptBefore = fields.interruptBefore;
        this.inputs = fields.inputs;
        this.stepTimeout = fields.stepTimeout ?? this.stepTimeout;
        this.debug = fields.debug ?? this.debug;
        this.checkpointer = fields.checkpointer;
        // Bind the method to the instance
        this._transform = this._transform.bind(this);
        if (this.autoValidate) {
            this.validate();
        }
    }
    validate() {
        (0, validate_js_1.validateGraph)({
            nodes: this.nodes,
            channels: this.channels,
            outputChannels: this.outputs,
            inputChannels: this.inputs,
            streamChannels: this.streamChannels,
            interruptAfterNodes: this.interruptAfter,
            interruptBeforeNodes: this.interruptBefore,
        });
        return this;
    }
    get streamChannelsList() {
        if (Array.isArray(this.streamChannels)) {
            return this.streamChannels;
        }
        else if (this.streamChannels) {
            return [this.streamChannels];
        }
        else {
            return Object.keys(this.channels);
        }
    }
    get streamChannelsAsIs() {
        if (this.streamChannels) {
            return this.streamChannels;
        }
        else {
            return Object.keys(this.channels);
        }
    }
    async getState(config) {
        if (!this.checkpointer) {
            throw new errors_js_1.GraphValueError("No checkpointer set");
        }
        const saved = await this.checkpointer.getTuple(config);
        const checkpoint = saved ? saved.checkpoint : (0, base_js_2.emptyCheckpoint)();
        const channels = (0, base_js_1.emptyChannels)(this.channels, checkpoint);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, nextTasks] = (0, algo_js_1._prepareNextTasks)(checkpoint, this.nodes, channels, false, { step: -1 });
        return {
            values: (0, io_js_1.readChannels)(channels, this.streamChannelsAsIs),
            next: nextTasks.map((task) => task.name),
            metadata: saved?.metadata,
            config: saved ? saved.config : config,
            createdAt: saved?.checkpoint.ts,
            parentConfig: saved?.parentConfig,
        };
    }
    async *getStateHistory(config, limit, before) {
        if (!this.checkpointer) {
            throw new errors_js_1.GraphValueError("No checkpointer set");
        }
        for await (const saved of this.checkpointer.list(config, limit, before)) {
            const channels = (0, base_js_1.emptyChannels)(this.channels, saved.checkpoint);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const [_, nextTasks] = (0, algo_js_1._prepareNextTasks)(saved.checkpoint, this.nodes, channels, false, { step: -1 });
            yield {
                values: (0, io_js_1.readChannels)(channels, this.streamChannelsAsIs),
                next: nextTasks.map((task) => task.name),
                metadata: saved.metadata,
                config: saved.config,
                createdAt: saved.checkpoint.ts,
                parentConfig: saved.parentConfig,
            };
        }
    }
    async updateState(config, values, asNode) {
        if (!this.checkpointer) {
            throw new errors_js_1.GraphValueError("No checkpointer set");
        }
        // Get the latest checkpoint
        const saved = await this.checkpointer.getTuple(config);
        const checkpoint = saved
            ? (0, base_js_2.copyCheckpoint)(saved.checkpoint)
            : (0, base_js_2.emptyCheckpoint)();
        // Find last that updated the state, if not provided
        const maxSeens = Object.entries(checkpoint.versions_seen).reduce((acc, [node, versions]) => {
            const maxSeen = Math.max(...Object.values(versions));
            if (maxSeen) {
                if (!acc[maxSeen]) {
                    acc[maxSeen] = [];
                }
                acc[maxSeen].push(node);
            }
            return acc;
        }, {});
        if (!asNode && !Object.keys(maxSeens).length) {
            if (!Array.isArray(this.inputs) && this.inputs in this.nodes) {
                asNode = this.inputs;
            }
        }
        else if (!asNode) {
            const maxSeen = Math.max(...Object.keys(maxSeens).map(Number));
            const nodes = maxSeens[maxSeen];
            if (nodes.length === 1) {
                asNode = nodes[0];
            }
        }
        if (!asNode) {
            throw new errors_js_1.InvalidUpdateError("Ambiguous update, specify as_node");
        }
        // update channels
        const channels = (0, base_js_1.emptyChannels)(this.channels, checkpoint);
        // create task to run all writers of the chosen node
        const writers = this.nodes[asNode].getWriters();
        if (!writers.length) {
            throw new errors_js_1.InvalidUpdateError(`No writers found for node ${asNode}`);
        }
        const task = {
            name: asNode,
            input: values,
            proc: 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            writers.length > 1 ? runnables_1.RunnableSequence.from(writers) : writers[0],
            writes: [],
            triggers: [constants_js_1.INTERRUPT],
            config: undefined,
        };
        // execute task
        await task.proc.invoke(task.input, (0, runnables_1.patchConfig)(config, {
            runName: `${this.name}UpdateState`,
            configurable: {
                [constants_js_1.CONFIG_KEY_SEND]: (items) => task.writes.push(...items),
                [constants_js_1.CONFIG_KEY_READ]: algo_js_1._localRead.bind(undefined, checkpoint, channels, task.writes),
            },
        }));
        // apply to checkpoint and save
        (0, algo_js_1._applyWrites)(checkpoint, channels, task.writes);
        const step = (saved?.metadata?.step ?? -2) + 1;
        return await this.checkpointer.put(saved?.config ?? config, (0, base_js_1.createCheckpoint)(checkpoint, channels, step), {
            source: "update",
            step,
            writes: { [asNode]: values },
        });
    }
    _defaults(config) {
        const { debug, streamMode, inputKeys, outputKeys, interruptAfter, interruptBefore, ...rest } = config;
        const defaultDebug = debug !== undefined ? debug : this.debug;
        let defaultOutputKeys = outputKeys;
        if (defaultOutputKeys === undefined) {
            defaultOutputKeys = this.streamChannelsAsIs;
        }
        else {
            (0, validate_js_1.validateKeys)(defaultOutputKeys, this.channels);
        }
        let defaultInputKeys = inputKeys;
        if (defaultInputKeys === undefined) {
            defaultInputKeys = this.inputs;
        }
        else {
            (0, validate_js_1.validateKeys)(defaultInputKeys, this.channels);
        }
        const defaultInterruptBefore = interruptBefore ?? this.interruptBefore ?? [];
        const defaultInterruptAfter = interruptAfter ?? this.interruptAfter ?? [];
        let defaultStreamMode;
        if (streamMode !== undefined) {
            defaultStreamMode = Array.isArray(streamMode) ? streamMode : [streamMode];
        }
        else {
            defaultStreamMode = this.streamMode;
        }
        if (config.configurable !== undefined &&
            config.configurable[constants_js_1.CONFIG_KEY_READ] !== undefined) {
            defaultStreamMode = ["values"];
        }
        return [
            defaultDebug,
            defaultStreamMode,
            defaultInputKeys,
            defaultOutputKeys,
            rest,
            defaultInterruptBefore,
            defaultInterruptAfter,
        ];
    }
    async *_transform(input, runManager, config = {}) {
        const bg = [];
        try {
            if (config.recursionLimit && config.recursionLimit < 1) {
                throw new errors_js_1.GraphValueError(`Recursion limit must be greater than 0, got ${config.recursionLimit}`);
            }
            if (this.checkpointer && !config.configurable) {
                throw new errors_js_1.GraphValueError(`Checkpointer requires one or more of the following 'configurable' keys: thread_id, checkpoint_id`);
            }
            // assign defaults
            const [debug, streamMode, inputKeys, outputKeys, restConfig, interruptBefore, interruptAfter,] = this._defaults(config);
            // copy nodes to ignore mutations during execution
            const processes = { ...this.nodes };
            // get checkpoint, or create an empty one
            const saved = this.checkpointer
                ? await this.checkpointer.getTuple(config)
                : null;
            let checkpoint = saved ? saved.checkpoint : (0, base_js_2.emptyCheckpoint)();
            let checkpointConfig = saved ? saved.config : config;
            let start = (saved?.metadata?.step ?? -2) + 1;
            // create channels from checkpoint
            const channels = (0, base_js_1.emptyChannels)(this.channels, checkpoint);
            // map inputs to channel updates
            const inputPendingWrites = [];
            for await (const c of input) {
                for (const value of (0, io_js_1.mapInput)(inputKeys, c)) {
                    inputPendingWrites.push(value);
                }
            }
            if (inputPendingWrites.length) {
                // discard any unfinished tasks from previous checkpoint
                const discarded = (0, algo_js_1._prepareNextTasks)(checkpoint, processes, channels, true, { step: -1 });
                checkpoint = discarded[0]; // eslint-disable-line prefer-destructuring
                // apply input writes
                (0, algo_js_1._applyWrites)(checkpoint, channels, inputPendingWrites);
                // save input checkpoint
                if (this.checkpointer) {
                    checkpoint = (0, base_js_1.createCheckpoint)(checkpoint, channels, start);
                    bg.push(this.checkpointer.put(checkpointConfig, checkpoint, {
                        source: "input",
                        step: start,
                        writes: Object.fromEntries(inputPendingWrites),
                    }));
                    checkpointConfig = {
                        configurable: {
                            ...checkpointConfig.configurable,
                            checkpoint_id: checkpoint.id,
                        },
                    };
                }
                // increment start to 0
                start += 1;
            }
            else {
                checkpoint = (0, base_js_2.copyCheckpoint)(checkpoint);
                for (const k of this.streamChannelsList) {
                    const version = checkpoint.channel_versions[k] ?? 0;
                    if (!checkpoint.versions_seen[constants_js_1.INTERRUPT]) {
                        checkpoint.versions_seen[constants_js_1.INTERRUPT] = {};
                    }
                    checkpoint.versions_seen[constants_js_1.INTERRUPT][k] = version;
                }
            }
            // Similarly to Bulk Synchronous Parallel / Pregel model
            // computation proceeds in steps, while there are channel updates
            // channel updates from step N are only visible in step N+1
            // channels are guaranteed to be immutable for the duration of the step,
            // with channel updates applied only at the transition between steps
            const stop = start + (config.recursionLimit ?? DEFAULT_LOOP_LIMIT);
            for (let step = start; step < stop + 1; step += 1) {
                const [nextCheckpoint, nextTasks] = (0, algo_js_1._prepareNextTasks)(checkpoint, processes, channels, true, { step });
                // if no more tasks, we're done
                if (nextTasks.length === 0 && step === start) {
                    throw new errors_js_1.GraphValueError(`No tasks to run in graph.`);
                }
                else if (nextTasks.length === 0) {
                    break;
                }
                else if (step === stop) {
                    throw new errors_js_1.GraphRecursionError(`Recursion limit of ${config.recursionLimit} reached without hitting a stop condition. You can increase the limit by setting the "recursionLimit" config key.`);
                }
                // before execution, check if we should interrupt
                if ((0, algo_js_1._shouldInterrupt)(checkpoint, interruptBefore, this.streamChannelsList, nextTasks)) {
                    break;
                }
                else {
                    checkpoint = nextCheckpoint;
                }
                // produce debug stream mode event
                if (streamMode.includes("debug")) {
                    yield* prefixGenerator((0, io_js_1.mapDebugTasks)(step, nextTasks), streamMode.length > 1 ? "debug" : undefined);
                }
                if (debug) {
                    console.log(nextTasks);
                }
                const tasksWithConfig = nextTasks.map(
                // eslint-disable-next-line no-loop-func
                (task, i) => [
                    task.proc,
                    task.input,
                    (0, runnables_1.patchConfig)((0, runnables_1.mergeConfigs)(restConfig, processes[task.name].config, {
                        metadata: {
                            langgraph_step: step,
                            langgraph_node: task.name,
                            langgraph_triggers: [constants_js_1.TASKS],
                            langgraph_task_idx: i,
                        },
                    }), {
                        callbacks: runManager?.getChild(`graph:step:${step}`),
                        runName: task.name,
                        configurable: {
                            ...config.configurable,
                            [constants_js_1.CONFIG_KEY_SEND]: (items) => task.writes.push(...items),
                            [constants_js_1.CONFIG_KEY_READ]: algo_js_1._localRead.bind(undefined, checkpoint, channels, task.writes),
                        },
                    }),
                ]);
                // execute tasks, and wait for one to fail or all to finish.
                // each task is independent from all other concurrent tasks
                const tasks = tasksWithConfig.map(([proc, input, updatedConfig]) => () => proc.invoke(input, updatedConfig));
                await (0, algo_js_1.executeTasks)(tasks, this.stepTimeout, config.signal);
                // combine pending writes from all tasks
                const pendingWrites = [];
                for (const task of nextTasks) {
                    pendingWrites.push(...task.writes);
                }
                // apply writes to channels
                (0, algo_js_1._applyWrites)(checkpoint, channels, pendingWrites);
                if (streamMode.includes("updates")) {
                    // TODO: Refactor
                    for await (const task of nextTasks) {
                        yield* prefixGenerator((0, io_js_1.mapOutputUpdates)(outputKeys, [task]), streamMode.length > 1 ? "updates" : undefined);
                    }
                }
                // yield current value and checkpoint view
                if (streamMode.includes("values")) {
                    yield* prefixGenerator((0, io_js_1.mapOutputValues)(outputKeys, pendingWrites, channels), streamMode.length > 1 ? "values" : undefined);
                }
                if (streamMode.includes("debug")) {
                    yield* prefixGenerator((0, io_js_1.mapDebugTaskResults)(step, nextTasks, this.streamChannelsList), streamMode.length > 1 ? "debug" : undefined);
                }
                // save end of step checkpoint
                if (this.checkpointer) {
                    checkpoint = (0, base_js_1.createCheckpoint)(checkpoint, channels, step);
                    bg.push(this.checkpointer.put(checkpointConfig, checkpoint, {
                        source: "loop",
                        step,
                        writes: (0, io_js_1.single)(this.streamMode.includes("values")
                            ? (0, io_js_1.mapOutputValues)(outputKeys, pendingWrites, channels)
                            : (0, io_js_1.mapOutputUpdates)(outputKeys, nextTasks)),
                    }));
                    checkpointConfig = {
                        configurable: {
                            ...checkpointConfig.configurable,
                            checkpoint_id: checkpoint.id,
                        },
                    };
                }
                if ((0, algo_js_1._shouldInterrupt)(checkpoint, interruptAfter, this.streamChannelsList, nextTasks)) {
                    break;
                }
            }
        }
        finally {
            await Promise.all(bg);
        }
    }
    async invoke(input, options) {
        const config = (0, runnables_1.ensureConfig)(options);
        if (!config?.outputKeys) {
            config.outputKeys = this.outputs;
        }
        if (!config?.streamMode) {
            config.streamMode = "values";
        }
        let latest;
        for await (const chunk of await this.stream(input, config)) {
            latest = chunk;
        }
        if (!latest) {
            return undefined;
        }
        return latest;
    }
    async stream(input, config) {
        const inputIterator = (async function* () {
            yield input;
        })();
        return stream_1.IterableReadableStream.fromAsyncGenerator(this.transform(inputIterator, config));
    }
    async *transform(generator, config) {
        for await (const chunk of this._transformStreamWithConfig(generator, this._transform, config)) {
            yield chunk;
        }
    }
}
exports.Pregel = Pregel;
