import { ToolMessage, isBaseMessage, } from "@langchain/core/messages";
import { RunnableCallable } from "../utils.js";
import { END } from "../graph/graph.js";
export class ToolNode extends RunnableCallable {
    constructor(tools, options) {
        const { name, tags, handleToolErrors } = options ?? {};
        super({ name, tags, func: (input, config) => this.run(input, config) });
        /**
        A node that runs the tools requested in the last AIMessage. It can be used
        either in StateGraph with a "messages" key or in MessageGraph. If multiple
        tool calls are requested, they will be run in parallel. The output will be
        a list of ToolMessages, one for each tool call.
        */
        Object.defineProperty(this, "tools", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "handleToolErrors", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        this.tools = tools;
        this.handleToolErrors = handleToolErrors ?? this.handleToolErrors;
    }
    async run(input, config) {
        const message = Array.isArray(input)
            ? input[input.length - 1]
            : input.messages[input.messages.length - 1];
        if (message._getType() !== "ai") {
            throw new Error("ToolNode only accepts AIMessages as input.");
        }
        const outputs = await Promise.all(message.tool_calls?.map(async (call) => {
            const tool = this.tools.find((tool) => tool.name === call.name);
            try {
                if (tool === undefined) {
                    throw new Error(`Tool "${call.name}" not found.`);
                }
                const output = await tool.invoke({ ...call, type: "tool_call" }, config);
                if (isBaseMessage(output) && output._getType() === "tool") {
                    return output;
                }
                else {
                    return new ToolMessage({
                        name: tool.name,
                        content: typeof output === "string" ? output : JSON.stringify(output),
                        tool_call_id: call.id,
                    });
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }
            catch (e) {
                if (!this.handleToolErrors) {
                    throw e;
                }
                return new ToolMessage({
                    content: `Error: ${e.message}\n Please fix your mistakes.`,
                    name: call.name,
                    tool_call_id: call.id ?? "",
                });
            }
        }) ?? []);
        return Array.isArray(input) ? outputs : { messages: outputs };
    }
}
export function toolsCondition(state) {
    const message = Array.isArray(state)
        ? state[state.length - 1]
        : state.messages[state.messages.length - 1];
    if ("tool_calls" in message &&
        (message.tool_calls?.length ?? 0) > 0) {
        return "tools";
    }
    else {
        return END;
    }
}
