import { BaseChannel } from "../channels/index.js";
import { PregelNode } from "./read.js";
import { All } from "./types.js";
export declare class GraphValidationError extends Error {
    constructor(message?: string);
}
export declare function validateGraph<Nn extends Record<string, PregelNode>, Cc extends Record<string, BaseChannel>>({ nodes, channels, inputChannels, outputChannels, streamChannels, interruptAfterNodes, interruptBeforeNodes, }: {
    nodes: Nn;
    channels: Cc;
    inputChannels: keyof Cc | Array<keyof Cc>;
    outputChannels: keyof Cc | Array<keyof Cc>;
    streamChannels?: keyof Cc | Array<keyof Cc>;
    interruptAfterNodes?: Array<keyof Nn> | All;
    interruptBeforeNodes?: Array<keyof Nn> | All;
}): void;
export declare function validateKeys<Cc extends Record<string, BaseChannel>>(keys: keyof Cc | Array<keyof Cc>, channels: Cc): void;
