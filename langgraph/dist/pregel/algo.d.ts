import { BaseChannel } from "../channels/base.js";
import { Checkpoint, ReadonlyCheckpoint } from "../checkpoint/base.js";
import { PregelNode } from "./read.js";
import { All, PregelExecutableTask, PregelTaskDescription } from "./types.js";
/**
 * Construct a type with a set of properties K of type T
 */
export type StrRecord<K extends string, T> = {
    [P in K]: T;
};
export declare function executeTasks<RunOutput>(tasks: Array<() => Promise<RunOutput | Error | void>>, stepTimeout?: number, signal?: AbortSignal): Promise<void>;
export declare function _shouldInterrupt<N extends PropertyKey, C extends PropertyKey>(checkpoint: ReadonlyCheckpoint, interruptNodes: All | Array<N>, snapshotChannels: Array<C>, tasks: Array<PregelExecutableTask<N, C>>): boolean;
export declare function _localRead<Cc extends StrRecord<string, BaseChannel>>(checkpoint: ReadonlyCheckpoint, channels: Cc, writes: Array<[keyof Cc, unknown]>, select: Array<keyof Cc> | keyof Cc, fresh?: boolean): Record<string, unknown> | unknown;
export declare function _localWrite(commit: (writes: [string, any][]) => void, processes: Record<string, PregelNode>, channels: Record<string, BaseChannel>, writes: [string, any][]): void;
export declare function _applyWrites<Cc extends Record<string, BaseChannel>>(checkpoint: Checkpoint, channels: Cc, pendingWrites: Array<[keyof Cc, unknown]>): void;
export declare function _prepareNextTasks<Nn extends StrRecord<string, PregelNode>, Cc extends StrRecord<string, BaseChannel>>(checkpoint: ReadonlyCheckpoint, processes: Nn, channels: Cc, forExecution: false, extra: {
    step: number;
}): [Checkpoint, Array<PregelTaskDescription>];
export declare function _prepareNextTasks<Nn extends StrRecord<string, PregelNode>, Cc extends StrRecord<string, BaseChannel>>(checkpoint: ReadonlyCheckpoint, processes: Nn, channels: Cc, forExecution: true, extra: {
    step: number;
}): [Checkpoint, Array<PregelExecutableTask<keyof Nn, keyof Cc>>];
