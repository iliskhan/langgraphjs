export declare const CONFIG_KEY_SEND = "__pregel_send";
export declare const CONFIG_KEY_READ = "__pregel_read";
export declare const INTERRUPT = "__interrupt__";
export declare const TAG_HIDDEN = "langsmith:hidden";
export declare const TASKS = "__pregel_tasks";
export declare const TASK_NAMESPACE = "6ba7b831-9dad-11d1-80b4-00c04fd430c8";
export interface SendInterface {
    node: string;
    args: any;
}
export declare function _isSendInterface(x: unknown): x is SendInterface;
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
export declare class Send implements SendInterface {
    node: string;
    args: any;
    lg_name: string;
    constructor(node: string, args: any);
}
export declare function _isSend(x: unknown): x is Send;
