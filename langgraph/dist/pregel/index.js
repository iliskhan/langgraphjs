/* eslint-disable no-param-reassign */
import { Runnable, RunnableSequence, _coerceToRunnable, ensureConfig, mergeConfigs, patchConfig, } from "@langchain/core/runnables";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { createCheckpoint, emptyChannels, } from "../channels/base.js";
import { copyCheckpoint, emptyCheckpoint, } from "../checkpoint/base.js";
import { PregelNode } from "./read.js";
import { validateGraph, validateKeys } from "./validate.js";
import { mapInput, mapOutputUpdates, mapOutputValues, mapDebugTasks, readChannels, single, mapDebugTaskResults, } from "./io.js";
import { ChannelWrite, PASSTHROUGH } from "./write.js";
import { CONFIG_KEY_READ, CONFIG_KEY_SEND, INTERRUPT, TASKS, } from "../constants.js";
import { GraphRecursionError, GraphValueError, InvalidUpdateError, } from "../errors.js";
import { executeTasks, _prepareNextTasks, _shouldInterrupt, _localRead, _applyWrites, } from "./algo.js";
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
export class Channel {
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
        return new PregelNode({
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
                value: PASSTHROUGH,
                skipNone: false,
            });
        }
        for (const [key, value] of Object.entries(kwargs ?? {})) {
            if (Runnable.isRunnable(value) || typeof value === "function") {
                channelWriteEntries.push({
                    channel: key,
                    value: PASSTHROUGH,
                    skipNone: true,
                    mapper: _coerceToRunnable(value),
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
        return new ChannelWrite(channelWriteEntries);
    }
}
export class Pregel extends Runnable {
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
        validateGraph({
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
            throw new GraphValueError("No checkpointer set");
        }
        const saved = await this.checkpointer.getTuple(config);
        const checkpoint = saved ? saved.checkpoint : emptyCheckpoint();
        const channels = emptyChannels(this.channels, checkpoint);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, nextTasks] = _prepareNextTasks(checkpoint, this.nodes, channels, false, { step: -1 });
        return {
            values: readChannels(channels, this.streamChannelsAsIs),
            next: nextTasks.map((task) => task.name),
            metadata: saved?.metadata,
            config: saved ? saved.config : config,
            createdAt: saved?.checkpoint.ts,
            parentConfig: saved?.parentConfig,
        };
    }
    async *getStateHistory(config, limit, before) {
        if (!this.checkpointer) {
            throw new GraphValueError("No checkpointer set");
        }
        for await (const saved of this.checkpointer.list(config, limit, before)) {
            const channels = emptyChannels(this.channels, saved.checkpoint);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const [_, nextTasks] = _prepareNextTasks(saved.checkpoint, this.nodes, channels, false, { step: -1 });
            yield {
                values: readChannels(channels, this.streamChannelsAsIs),
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
            throw new GraphValueError("No checkpointer set");
        }
        // Get the latest checkpoint
        const saved = await this.checkpointer.getTuple(config);
        const checkpoint = saved
            ? copyCheckpoint(saved.checkpoint)
            : emptyCheckpoint();
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
            throw new InvalidUpdateError("Ambiguous update, specify as_node");
        }
        // update channels
        const channels = emptyChannels(this.channels, checkpoint);
        // create task to run all writers of the chosen node
        const writers = this.nodes[asNode].getWriters();
        if (!writers.length) {
            throw new InvalidUpdateError(`No writers found for node ${asNode}`);
        }
        const task = {
            name: asNode,
            input: values,
            proc: 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            writers.length > 1 ? RunnableSequence.from(writers) : writers[0],
            writes: [],
            triggers: [INTERRUPT],
            config: undefined,
        };
        // execute task
        await task.proc.invoke(task.input, patchConfig(config, {
            runName: `${this.name}UpdateState`,
            configurable: {
                [CONFIG_KEY_SEND]: (items) => task.writes.push(...items),
                [CONFIG_KEY_READ]: _localRead.bind(undefined, checkpoint, channels, task.writes),
            },
        }));
        // apply to checkpoint and save
        _applyWrites(checkpoint, channels, task.writes);
        const step = (saved?.metadata?.step ?? -2) + 1;
        return await this.checkpointer.put(saved?.config ?? config, createCheckpoint(checkpoint, channels, step), {
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
            validateKeys(defaultOutputKeys, this.channels);
        }
        let defaultInputKeys = inputKeys;
        if (defaultInputKeys === undefined) {
            defaultInputKeys = this.inputs;
        }
        else {
            validateKeys(defaultInputKeys, this.channels);
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
            config.configurable[CONFIG_KEY_READ] !== undefined) {
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
                throw new GraphValueError(`Recursion limit must be greater than 0, got ${config.recursionLimit}`);
            }
            if (this.checkpointer && !config.configurable) {
                throw new GraphValueError(`Checkpointer requires one or more of the following 'configurable' keys: thread_id, checkpoint_id`);
            }
            // assign defaults
            const [debug, streamMode, inputKeys, outputKeys, restConfig, interruptBefore, interruptAfter,] = this._defaults(config);
            // copy nodes to ignore mutations during execution
            const processes = { ...this.nodes };
            // get checkpoint, or create an empty one
            const saved = this.checkpointer
                ? await this.checkpointer.getTuple(config)
                : null;
            let checkpoint = saved ? saved.checkpoint : emptyCheckpoint();
            let checkpointConfig = saved ? saved.config : config;
            let start = (saved?.metadata?.step ?? -2) + 1;
            // create channels from checkpoint
            const channels = emptyChannels(this.channels, checkpoint);
            // map inputs to channel updates
            const inputPendingWrites = [];
            for await (const c of input) {
                for (const value of mapInput(inputKeys, c)) {
                    inputPendingWrites.push(value);
                }
            }
            if (inputPendingWrites.length) {
                // discard any unfinished tasks from previous checkpoint
                const discarded = _prepareNextTasks(checkpoint, processes, channels, true, { step: -1 });
                checkpoint = discarded[0]; // eslint-disable-line prefer-destructuring
                // apply input writes
                _applyWrites(checkpoint, channels, inputPendingWrites);
                // save input checkpoint
                if (this.checkpointer) {
                    checkpoint = createCheckpoint(checkpoint, channels, start);
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
                checkpoint = copyCheckpoint(checkpoint);
                for (const k of this.streamChannelsList) {
                    const version = checkpoint.channel_versions[k] ?? 0;
                    if (!checkpoint.versions_seen[INTERRUPT]) {
                        checkpoint.versions_seen[INTERRUPT] = {};
                    }
                    checkpoint.versions_seen[INTERRUPT][k] = version;
                }
            }
            // Similarly to Bulk Synchronous Parallel / Pregel model
            // computation proceeds in steps, while there are channel updates
            // channel updates from step N are only visible in step N+1
            // channels are guaranteed to be immutable for the duration of the step,
            // with channel updates applied only at the transition between steps
            const stop = start + (config.recursionLimit ?? DEFAULT_LOOP_LIMIT);
            for (let step = start; step < stop + 1; step += 1) {
                const [nextCheckpoint, nextTasks] = _prepareNextTasks(checkpoint, processes, channels, true, { step });
                // if no more tasks, we're done
                if (nextTasks.length === 0 && step === start) {
                    throw new GraphValueError(`No tasks to run in graph.`);
                }
                else if (nextTasks.length === 0) {
                    break;
                }
                else if (step === stop) {
                    throw new GraphRecursionError(`Recursion limit of ${config.recursionLimit} reached without hitting a stop condition. You can increase the limit by setting the "recursionLimit" config key.`);
                }
                // before execution, check if we should interrupt
                if (_shouldInterrupt(checkpoint, interruptBefore, this.streamChannelsList, nextTasks)) {
                    break;
                }
                else {
                    checkpoint = nextCheckpoint;
                }
                // produce debug stream mode event
                if (streamMode.includes("debug")) {
                    yield* prefixGenerator(mapDebugTasks(step, nextTasks), streamMode.length > 1 ? "debug" : undefined);
                }
                if (debug) {
                    console.log(nextTasks);
                }
                const tasksWithConfig = nextTasks.map(
                // eslint-disable-next-line no-loop-func
                (task, i) => [
                    task.proc,
                    task.input,
                    patchConfig(mergeConfigs(restConfig, processes[task.name].config, {
                        metadata: {
                            langgraph_step: step,
                            langgraph_node: task.name,
                            langgraph_triggers: [TASKS],
                            langgraph_task_idx: i,
                        },
                    }), {
                        callbacks: runManager?.getChild(`graph:step:${step}`),
                        runName: task.name,
                        configurable: {
                            ...config.configurable,
                            [CONFIG_KEY_SEND]: (items) => task.writes.push(...items),
                            [CONFIG_KEY_READ]: _localRead.bind(undefined, checkpoint, channels, task.writes),
                        },
                    }),
                ]);
                // execute tasks, and wait for one to fail or all to finish.
                // each task is independent from all other concurrent tasks
                const tasks = tasksWithConfig.map(([proc, input, updatedConfig]) => () => proc.invoke(input, updatedConfig));
                await executeTasks(tasks, this.stepTimeout, config.signal);
                // combine pending writes from all tasks
                const pendingWrites = [];
                for (const task of nextTasks) {
                    pendingWrites.push(...task.writes);
                }
                // apply writes to channels
                _applyWrites(checkpoint, channels, pendingWrites);
                if (streamMode.includes("updates")) {
                    // TODO: Refactor
                    for await (const task of nextTasks) {
                        yield* prefixGenerator(mapOutputUpdates(outputKeys, [task]), streamMode.length > 1 ? "updates" : undefined);
                    }
                }
                // yield current value and checkpoint view
                if (streamMode.includes("values")) {
                    yield* prefixGenerator(mapOutputValues(outputKeys, pendingWrites, channels), streamMode.length > 1 ? "values" : undefined);
                }
                if (streamMode.includes("debug")) {
                    yield* prefixGenerator(mapDebugTaskResults(step, nextTasks, this.streamChannelsList), streamMode.length > 1 ? "debug" : undefined);
                }
                // save end of step checkpoint
                if (this.checkpointer) {
                    checkpoint = createCheckpoint(checkpoint, channels, step);
                    bg.push(this.checkpointer.put(checkpointConfig, checkpoint, {
                        source: "loop",
                        step,
                        writes: single(this.streamMode.includes("values")
                            ? mapOutputValues(outputKeys, pendingWrites, channels)
                            : mapOutputUpdates(outputKeys, nextTasks)),
                    }));
                    checkpointConfig = {
                        configurable: {
                            ...checkpointConfig.configurable,
                            checkpoint_id: checkpoint.id,
                        },
                    };
                }
                if (_shouldInterrupt(checkpoint, interruptAfter, this.streamChannelsList, nextTasks)) {
                    break;
                }
            }
        }
        finally {
            await Promise.all(bg);
        }
    }
    async invoke(input, options) {
        const config = ensureConfig(options);
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
        return IterableReadableStream.fromAsyncGenerator(this.transform(inputIterator, config));
    }
    async *transform(generator, config) {
        for await (const chunk of this._transformStreamWithConfig(generator, this._transform, config)) {
            yield chunk;
        }
    }
}
