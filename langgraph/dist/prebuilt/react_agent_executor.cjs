"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReactAgent = void 0;
const messages_1 = require("@langchain/core/messages");
const runnables_1 = require("@langchain/core/runnables");
const prompts_1 = require("@langchain/core/prompts");
const index_js_1 = require("../graph/index.cjs");
const tool_node_js_1 = require("./tool_node.cjs");
/**
 * Creates a StateGraph agent that relies on a chat llm utilizing tool calling.
 * @param llm The chat llm that can utilize OpenAI-style function calling.
 * @param tools A list of tools or a ToolNode.
 * @param messageModifier An optional message modifier to apply to messages before being passed to the LLM.
 * Can be a SystemMessage, string, function that takes and returns a list of messages, or a Runnable.
 * @param checkpointSaver An optional checkpoint saver to persist the agent's state.
 * @param interruptBefore An optional list of node names to interrupt before running.
 * @param interruptAfter An optional list of node names to interrupt after running.
 * @returns A compiled agent as a LangChain Runnable.
 */
function createReactAgent(props) {
    const { llm, tools, messageModifier, checkpointSaver, interruptBefore, interruptAfter, } = props;
    const schema = {
        messages: {
            value: (left, right) => left.concat(right),
            default: () => [],
        },
    };
    let toolClasses;
    if (!Array.isArray(tools)) {
        toolClasses = tools.tools;
    }
    else {
        toolClasses = tools;
    }
    if (!("bindTools" in llm) || typeof llm.bindTools !== "function") {
        throw new Error(`llm ${llm} must define bindTools method.`);
    }
    const modelWithTools = llm.bindTools(toolClasses);
    const modelRunnable = _createModelWrapper(modelWithTools, messageModifier);
    const shouldContinue = (state) => {
        const { messages } = state;
        const lastMessage = messages[messages.length - 1];
        if ((0, messages_1.isAIMessage)(lastMessage) &&
            (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0)) {
            return index_js_1.END;
        }
        else {
            return "continue";
        }
    };
    const callModel = async (state, config) => {
        const { messages } = state;
        // TODO: Auto-promote streaming.
        return { messages: [await modelRunnable.invoke(messages, config)] };
    };
    const workflow = new index_js_1.StateGraph({
        channels: schema,
    })
        .addNode("agent", runnables_1.RunnableLambda.from(callModel).withConfig({ runName: "agent" }))
        .addNode("tools", new tool_node_js_1.ToolNode(toolClasses))
        .addEdge(index_js_1.START, "agent")
        .addConditionalEdges("agent", shouldContinue, {
        continue: "tools",
        [index_js_1.END]: index_js_1.END,
    })
        .addEdge("tools", "agent");
    return workflow.compile({
        checkpointer: checkpointSaver,
        interruptBefore,
        interruptAfter,
    });
}
exports.createReactAgent = createReactAgent;
function _createModelWrapper(modelWithTools, messageModifier) {
    if (!messageModifier) {
        return modelWithTools;
    }
    const endict = runnables_1.RunnableLambda.from((messages) => ({
        messages,
    }));
    if (typeof messageModifier === "string") {
        const systemMessage = new messages_1.SystemMessage(messageModifier);
        const prompt = prompts_1.ChatPromptTemplate.fromMessages([
            systemMessage,
            ["placeholder", "{messages}"],
        ]);
        return endict.pipe(prompt).pipe(modelWithTools);
    }
    if (typeof messageModifier === "function") {
        const lambda = runnables_1.RunnableLambda.from(messageModifier).withConfig({
            runName: "message_modifier",
        });
        return lambda.pipe(modelWithTools);
    }
    if (runnables_1.Runnable.isRunnable(messageModifier)) {
        return messageModifier.pipe(modelWithTools);
    }
    if (messageModifier._getType() === "system") {
        const prompt = prompts_1.ChatPromptTemplate.fromMessages([
            messageModifier,
            ["placeholder", "{messages}"],
        ]);
        return endict.pipe(prompt).pipe(modelWithTools);
    }
    throw new Error(`Unsupported message modifier type: ${typeof messageModifier}`);
}
