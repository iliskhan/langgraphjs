"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFunctionCallingExecutor = void 0;
const function_calling_1 = require("@langchain/core/utils/function_calling");
const messages_1 = require("@langchain/core/messages");
const runnables_1 = require("@langchain/core/runnables");
const tool_executor_js_1 = require("./tool_executor.cjs");
const state_js_1 = require("../graph/state.cjs");
const index_js_1 = require("../graph/index.cjs");
function createFunctionCallingExecutor({ model, tools, }) {
    let toolExecutor;
    let toolClasses;
    if (!Array.isArray(tools)) {
        toolExecutor = tools;
        toolClasses = tools.tools;
    }
    else {
        toolExecutor = new tool_executor_js_1.ToolExecutor({
            tools,
        });
        toolClasses = tools;
    }
    if (!("bind" in model) || typeof model.bind !== "function") {
        throw new Error("Model must be bindable");
    }
    const toolsAsOpenAIFunctions = toolClasses.map((tool) => (0, function_calling_1.convertToOpenAIFunction)(tool));
    const newModel = model.bind({
        functions: toolsAsOpenAIFunctions,
    });
    // Define the function that determines whether to continue or not
    const shouldContinue = (state) => {
        const { messages } = state;
        const lastMessage = messages[messages.length - 1];
        // If there is no function call, then we finish
        if (!("function_call" in lastMessage.additional_kwargs) ||
            !lastMessage.additional_kwargs.function_call) {
            return "end";
        }
        // Otherwise if there is, we continue
        return "continue";
    };
    // Define the function that calls the model
    const callModel = async (state, config) => {
        const { messages } = state;
        const response = await newModel.invoke(messages, config);
        // We return a list, because this will get added to the existing list
        return {
            messages: [response],
        };
    };
    // Define the function to execute tools
    const _getAction = (state) => {
        const { messages } = state;
        // Based on the continue condition
        // we know the last message involves a function call
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) {
            throw new Error("No messages found.");
        }
        if (!lastMessage.additional_kwargs.function_call) {
            throw new Error("No function call found in message.");
        }
        // We construct an AgentAction from the function_call
        return {
            tool: lastMessage.additional_kwargs.function_call.name,
            toolInput: JSON.stringify(lastMessage.additional_kwargs.function_call.arguments),
            log: "",
        };
    };
    const callTool = async (state, config) => {
        const action = _getAction(state);
        // We call the tool_executor and get back a response
        const response = await toolExecutor.invoke(action, config);
        // We use the response to create a FunctionMessage
        const functionMessage = new messages_1.FunctionMessage({
            content: response,
            name: action.tool,
        });
        // We return a list, because this will get added to the existing list
        return { messages: [functionMessage] };
    };
    // We create the AgentState that we will pass around
    // This simply involves a list of messages
    // We want steps to return messages to append to the list
    // So we annotate the messages attribute with operator.add
    const schema = {
        messages: {
            value: (x, y) => x.concat(y),
            default: () => [],
        },
    };
    // Define a new graph
    const workflow = new state_js_1.StateGraph({
        channels: schema,
    })
        // Define the two nodes we will cycle between
        .addNode("agent", new runnables_1.RunnableLambda({ func: callModel }))
        .addNode("action", new runnables_1.RunnableLambda({ func: callTool }))
        // Set the entrypoint as `agent`
        // This means that this node is the first one called
        .addEdge(index_js_1.START, "agent")
        // We now add a conditional edge
        .addConditionalEdges(
    // First, we define the start node. We use `agent`.
    // This means these are the edges taken after the `agent` node is called.
    "agent", 
    // Next, we pass in the function that will determine which node is called next.
    shouldContinue, 
    // Finally we pass in a mapping.
    // The keys are strings, and the values are other nodes.
    // END is a special node marking that the graph should finish.
    // What will happen is we will call `should_continue`, and then the output of that
    // will be matched against the keys in this mapping.
    // Based on which one it matches, that node will then be called.
    {
        // If `tools`, then we call the tool node.
        continue: "action",
        // Otherwise we finish.
        end: index_js_1.END,
    })
        // We now add a normal edge from `tools` to `agent`.
        // This means that after `tools` is called, `agent` node is called next.
        .addEdge("action", "agent");
    // Finally, we compile it!
    // This compiles it into a LangChain Runnable,
    // meaning you can use it as you would any other runnable
    return workflow.compile();
}
exports.createFunctionCallingExecutor = createFunctionCallingExecutor;
