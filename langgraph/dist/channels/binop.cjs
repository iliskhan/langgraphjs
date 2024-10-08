"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinaryOperatorAggregate = void 0;
const errors_js_1 = require("../errors.cjs");
const index_js_1 = require("./index.cjs");
/**
 * Stores the result of applying a binary operator to the current value and each new value.
 */
class BinaryOperatorAggregate extends index_js_1.BaseChannel {
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
            throw new errors_js_1.EmptyChannelError();
        }
        return this.value;
    }
    checkpoint() {
        if (this.value === undefined) {
            throw new errors_js_1.EmptyChannelError();
        }
        return this.value;
    }
}
exports.BinaryOperatorAggregate = BinaryOperatorAggregate;
