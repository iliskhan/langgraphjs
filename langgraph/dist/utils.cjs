"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunnableCallable = void 0;
const runnables_1 = require("@langchain/core/runnables");
const singletons_1 = require("@langchain/core/singletons");
class RunnableCallable extends runnables_1.Runnable {
    constructor(fields) {
        super();
        Object.defineProperty(this, "lc_namespace", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ["langgraph"]
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.defineProperty(this, "func", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tags", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "trace", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "recurse", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        this.name = fields.name ?? fields.func.name;
        this.func = fields.func;
        this.config = fields.tags ? { tags: fields.tags } : undefined;
        this.trace = fields.trace ?? this.trace;
        this.recurse = fields.recurse ?? this.recurse;
    }
    async _tracedInvoke(input, config, runManager) {
        return new Promise((resolve, reject) => {
            const childConfig = (0, runnables_1.patchConfig)(config, {
                callbacks: runManager?.getChild(),
            });
            void singletons_1.AsyncLocalStorageProviderSingleton.runWithConfig(childConfig, async () => {
                try {
                    const output = await this.func(input, childConfig);
                    resolve(output);
                }
                catch (e) {
                    reject(e);
                }
            });
        });
    }
    async invoke(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input, options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let returnValue;
        if (this.trace) {
            returnValue = await this._callWithConfig(this._tracedInvoke, input, (0, runnables_1.mergeConfigs)(this.config, options));
        }
        else {
            returnValue = await this.func(input, (0, runnables_1.mergeConfigs)(this.config, options));
        }
        if (runnables_1.Runnable.isRunnable(returnValue) && this.recurse) {
            return await returnValue.invoke(input, options);
        }
        return returnValue;
    }
}
exports.RunnableCallable = RunnableCallable;
