"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NamedBarrierValue = exports.areSetsEqual = void 0;
const errors_js_1 = require("../errors.cjs");
const index_js_1 = require("./index.cjs");
const areSetsEqual = (a, b) => a.size === b.size && [...a].every((value) => b.has(value));
exports.areSetsEqual = areSetsEqual;
/**
 * A channel that waits until all named values are received before making the value available.
 *
 * This ensures that if node N and node M both write to channel C, the value of C will not be updated
 * until N and M have completed updating.
 */
class NamedBarrierValue extends index_js_1.BaseChannel {
    constructor(names) {
        super();
        Object.defineProperty(this, "lc_graph_name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "NamedBarrierValue"
        });
        Object.defineProperty(this, "names", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        }); // Names of nodes that we want to wait for.
        Object.defineProperty(this, "seen", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.names = names;
        this.seen = new Set();
    }
    fromCheckpoint(checkpoint) {
        const empty = new NamedBarrierValue(this.names);
        if (checkpoint) {
            empty.seen = new Set(checkpoint);
        }
        return empty;
    }
    update(values) {
        // We have seen all nodes, so we can reset the seen set in preparation for the next round of updates.
        if ((0, exports.areSetsEqual)(this.names, this.seen)) {
            this.seen = new Set();
        }
        for (const nodeName of values) {
            if (this.names.has(nodeName)) {
                this.seen.add(nodeName);
            }
            else {
                throw new Error(`Value ${JSON.stringify(nodeName)} not in names ${JSON.stringify(this.names)}`);
            }
        }
    }
    // If we have not yet seen all the node names we want to wait for,
    // throw an error to prevent continuing.
    get() {
        if (!(0, exports.areSetsEqual)(this.names, this.seen)) {
            throw new errors_js_1.EmptyChannelError();
        }
        return undefined;
    }
    checkpoint() {
        return [...this.seen];
    }
}
exports.NamedBarrierValue = NamedBarrierValue;
