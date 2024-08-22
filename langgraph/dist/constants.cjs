"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._isSend = exports.Send = exports._isSendInterface = exports.TASK_NAMESPACE = exports.TASKS = exports.TAG_HIDDEN = exports.INTERRUPT = exports.CONFIG_KEY_READ = exports.CONFIG_KEY_SEND = void 0;
exports.CONFIG_KEY_SEND = "__pregel_send";
exports.CONFIG_KEY_READ = "__pregel_read";
exports.INTERRUPT = "__interrupt__";
exports.TAG_HIDDEN = "langsmith:hidden";
exports.TASKS = "__pregel_tasks";
exports.TASK_NAMESPACE = "6ba7b831-9dad-11d1-80b4-00c04fd430c8";
function _isSendInterface(x) {
    const operation = x;
    return typeof operation.node === "string" && operation.args !== undefined;
}
exports._isSendInterface = _isSendInterface;
/**
 * A message or packet to send to a specific node in the graph.
 *
 * The `Send` class is used within a `StateGraph`'s conditional edges to
 * dynamically invoke a node with a custom state at the next step.
 *
 * Importantly, the sent state can differ from the core graph's state,
 * allowing for flexible and dynamic workflow management.
 *
 * One such example is a "map-reduce" workflow where your graph invokes
 * the same node multiple times in parallel with different states,
 * before aggregating the results back into the main graph's state.
 *
 * @example
 * ```typescript
 * import { Annotation, Send, StateGraph } from "@langchain/langgraph";
 *
 * const ChainState = Annotation.Root({
 *   subjects: Annotation<string[]>,
 *   jokes: Annotation<string[]>({
 *     reducer: (a, b) => a.concat(b),
 *   }),
 * });
 *
 * const continueToJokes = async (state: typeof ChainState.State) => {
 *   return state.subjects.map((subject) => {
 *     return new Send("generate_joke", { subjects: [subject] });
 *   });
 * };
 *
 * const graph = new StateGraph(ChainState)
 *   .addNode("generate_joke", (state) => ({
 *     jokes: [`Joke about ${state.subjects}`],
 *   }))
 *   .addConditionalEdges("__start__", continueToJokes)
 *   .addEdge("generate_joke", "__end__")
 *   .compile();
 *
 * const res = await graph.invoke({ subjects: ["cats", "dogs"] });
 * console.log(res);
 *
 * // Invoking with two subjects results in a generated joke for each
 * // { subjects: ["cats", "dogs"], jokes: [`Joke about cats`, `Joke about dogs`] }
 * ```
 */
class Send {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(node, args) {
        Object.defineProperty(this, "node", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: node
        });
        Object.defineProperty(this, "args", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: args
        });
        Object.defineProperty(this, "lg_name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "Send"
        });
    }
}
exports.Send = Send;
function _isSend(x) {
    const operation = x;
    return operation.lg_name === "Send";
}
exports._isSend = _isSend;
