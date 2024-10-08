import { Runnable, RunnableConfig, RunnableLike } from "@langchain/core/runnables";
import { Send } from "../constants.js";
import { RunnableCallable } from "../utils.js";
export declare const SKIP_WRITE: {
    [x: symbol]: boolean;
};
export declare const PASSTHROUGH: {
    [x: symbol]: boolean;
};
/**
 * Mapping of write channels to Runnables that return the value to be written,
 * or None to skip writing.
 */
export declare class ChannelWrite<RunInput = any> extends RunnableCallable {
    writes: Array<ChannelWriteEntry | Send>;
    constructor(writes: Array<ChannelWriteEntry | Send>, tags?: string[]);
    _getWriteValues(input: unknown, config: RunnableConfig): Promise<[string, unknown][]>;
    _write(input: unknown, config: RunnableConfig): Promise<void>;
    static doWrite(config: RunnableConfig, values: [string, unknown][]): void;
    static isWriter(runnable: RunnableLike): boolean;
    static registerWriter<T extends Runnable>(runnable: T): T;
}
export interface ChannelWriteEntry {
    channel: string;
    value: unknown;
    skipNone?: boolean;
    mapper?: Runnable;
}
