import { BaseChannel } from "./index.js";
/**
 * Stores the last value received, can receive at most one value per step.
 *
 * Since `update` is only called once per step and value can only be of length 1,
 * LastValue always stores the last value of a single node. If multiple nodes attempt to
 * write to this channel in a single step, an error will be thrown.
 */
export declare class LastValue<Value> extends BaseChannel<Value, Value, Value> {
    lc_graph_name: string;
    value?: Value;
    fromCheckpoint(checkpoint?: Value): this;
    update(values: Value[]): void;
    get(): Value;
    checkpoint(): Value;
}
