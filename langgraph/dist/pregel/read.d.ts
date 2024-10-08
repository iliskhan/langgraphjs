import { Runnable, RunnableBinding, RunnableBindingArgs, RunnableConfig, RunnableLike } from "@langchain/core/runnables";
import { RunnableCallable } from "../utils.js";
export declare class ChannelRead<RunInput = any> extends RunnableCallable {
    lc_graph_name: string;
    channel: string | Array<string>;
    fresh: boolean;
    mapper?: (args: any) => any;
    constructor(channel: string | Array<string>, mapper?: (args: any) => any, fresh?: boolean);
    static doRead<T = unknown>(config: RunnableConfig, channel: string | Array<string>, fresh: boolean, mapper?: (args: unknown) => unknown): T;
}
interface PregelNodeArgs<RunInput, RunOutput> extends Partial<RunnableBindingArgs<RunInput, RunOutput>> {
    channels: Record<string, string> | string[];
    triggers: Array<string>;
    mapper?: (args: any) => any;
    writers?: Runnable<RunOutput, unknown>[];
    tags?: string[];
    bound?: Runnable<RunInput, RunOutput>;
    kwargs?: Record<string, any>;
    config?: RunnableConfig;
}
export type PregelNodeInputType = any;
export type PregelNodeOutputType = any;
export declare class PregelNode<RunInput = PregelNodeInputType, RunOutput = PregelNodeOutputType> extends RunnableBinding<RunInput, RunOutput, RunnableConfig> {
    lc_graph_name: string;
    channels: Record<string, string> | string[];
    triggers: string[];
    mapper?: (args: any) => any;
    writers: Runnable[];
    bound: Runnable<RunInput, RunOutput>;
    kwargs: Record<string, any>;
    constructor(fields: PregelNodeArgs<RunInput, RunOutput>);
    getWriters(): Array<Runnable>;
    getNode(): Runnable<RunInput, RunOutput> | undefined;
    join(channels: Array<string>): PregelNode<RunInput, RunOutput>;
    pipe<NewRunOutput>(coerceable: RunnableLike): PregelNode<RunInput, Exclude<NewRunOutput, Error>>;
}
export {};
