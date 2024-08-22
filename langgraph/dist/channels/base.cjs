"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckpoint = exports.emptyChannels = exports.BaseChannel = void 0;
const base_js_1 = require("../checkpoint/base.cjs");
const id_js_1 = require("../checkpoint/id.cjs");
const errors_js_1 = require("../errors.cjs");
class BaseChannel {
    constructor() {
        Object.defineProperty(this, "ValueType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "UpdateType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
}
exports.BaseChannel = BaseChannel;
function emptyChannels(channels, checkpoint) {
    const newChannels = {};
    for (const k in channels) {
        if (Object.prototype.hasOwnProperty.call(channels, k)) {
            const channelValue = checkpoint.channel_values[k];
            newChannels[k] = channels[k].fromCheckpoint(channelValue);
        }
    }
    return newChannels;
}
exports.emptyChannels = emptyChannels;
function createCheckpoint(checkpoint, channels, step) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = {};
    for (const k of Object.keys(channels)) {
        try {
            values[k] = channels[k].checkpoint();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }
        catch (error) {
            if (error.name === errors_js_1.EmptyChannelError.unminifiable_name) {
                // no-op
            }
            else {
                throw error; // Rethrow unexpected errors
            }
        }
    }
    return {
        v: 1,
        id: (0, id_js_1.uuid6)(step),
        ts: new Date().toISOString(),
        channel_values: values,
        channel_versions: { ...checkpoint.channel_versions },
        versions_seen: (0, base_js_1.deepCopy)(checkpoint.versions_seen),
        pending_sends: checkpoint.pending_sends ?? [],
    };
}
exports.createCheckpoint = createCheckpoint;
