"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelWrite = exports.PASSTHROUGH = exports.SKIP_WRITE = void 0;
const constants_js_1 = require("../constants.cjs");
const utils_js_1 = require("../utils.cjs");
const errors_js_1 = require("../errors.cjs");
exports.SKIP_WRITE = {
    [Symbol.for("LG_SKIP_WRITE")]: true,
};
function _isSkipWrite(x) {
    return (typeof x === "object" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        x?.[Symbol.for("LG_SKIP_WRITE")] !== undefined);
}
exports.PASSTHROUGH = {
    [Symbol.for("LG_PASSTHROUGH")]: true,
};
function _isPassthrough(x) {
    return (typeof x === "object" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        x?.[Symbol.for("LG_PASSTHROUGH")] !== undefined);
}
const IS_WRITER = Symbol("IS_WRITER");
/**
 * Mapping of write channels to Runnables that return the value to be written,
 * or None to skip writing.
 */
class ChannelWrite extends utils_js_1.RunnableCallable {
    constructor(writes, tags) {
        const name = `ChannelWrite<${writes
            .map((packet) => {
            return (0, constants_js_1._isSend)(packet) ? packet.node : packet.channel;
        })
            .join(",")}>`;
        super({
            ...{ writes, name, tags },
            func: async (input, config) => this._write(input, config ?? {}),
        });
        Object.defineProperty(this, "writes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.writes = writes;
    }
    async _getWriteValues(input, config) {
        const writes = this.writes
            .filter(constants_js_1._isSend)
            .map((packet) => {
            return [constants_js_1.TASKS, packet];
        });
        const entries = this.writes.filter((write) => {
            return !(0, constants_js_1._isSend)(write);
        });
        const invalidEntry = entries.find((write) => {
            return write.channel === constants_js_1.TASKS;
        });
        if (invalidEntry) {
            throw new errors_js_1.InvalidUpdateError(`Cannot write to the reserved channel ${constants_js_1.TASKS}`);
        }
        const values = await Promise.all(entries.map(async (write) => {
            let value;
            if (_isPassthrough(write.value)) {
                value = input;
            }
            else {
                value = write.value;
            }
            const mappedValue = write.mapper
                ? await write.mapper.invoke(value, config)
                : value;
            return {
                ...write,
                value: mappedValue,
            };
        })).then((writes) => {
            return writes
                .filter((write) => !write.skipNone || write.value !== null)
                .map((write) => {
                return [write.channel, write.value];
            });
        });
        return [...writes, ...values];
    }
    async _write(input, config) {
        const values = await this._getWriteValues(input, config);
        ChannelWrite.doWrite(config, values);
    }
    // TODO: Support requireAtLeastOneOf
    static doWrite(config, values) {
        const write = config.configurable?.[constants_js_1.CONFIG_KEY_SEND];
        const filtered = values.filter(([_, value]) => !_isSkipWrite(value));
        write(filtered);
    }
    static isWriter(runnable) {
        return (
        // eslint-disable-next-line no-instanceof/no-instanceof
        runnable instanceof ChannelWrite ||
            (IS_WRITER in runnable && !!runnable[IS_WRITER]));
    }
    static registerWriter(runnable) {
        return Object.defineProperty(runnable, IS_WRITER, { value: true });
    }
}
exports.ChannelWrite = ChannelWrite;
