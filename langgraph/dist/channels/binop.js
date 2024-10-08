import { EmptyChannelError } from "../errors.js";
import { BaseChannel } from "./index.js";
/**
 * Stores the result of applying a binary operator to the current value and each new value.
 */
export class BinaryOperatorAggregate extends BaseChannel {
    constructor(operator, initialValueFactory) {
        super();
        Object.defineProperty(this, "lc_graph_name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "BinaryOperatorAggregate"
        });
        Object.defineProperty(this, "value", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "operator", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "initialValueFactory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.operator = operator;
        this.initialValueFactory = initialValueFactory;
        this.value = initialValueFactory?.();
    }
    fromCheckpoint(checkpoint) {
        const empty = new BinaryOperatorAggregate(this.operator, this.initialValueFactory);
        if (checkpoint) {
            empty.value = checkpoint;
        }
        return empty;
    }
    update(values) {
        let newValues = values;
        if (!newValues.length)
            return;
        if (this.value === undefined) {
            [this.value] = newValues;
            newValues = newValues.slice(1);
        }
        for (const value of newValues) {
            if (this.value !== undefined) {
                this.value = this.operator(this.value, value);
            }
        }
    }
    get() {
        if (this.value === undefined) {
            throw new EmptyChannelError();
        }
        return this.value;
    }
    checkpoint() {
        if (this.value === undefined) {
            throw new EmptyChannelError();
        }
        return this.value;
    }
}
