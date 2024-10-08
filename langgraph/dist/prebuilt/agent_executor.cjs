"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentExecutor = void 0;
const tool_executor_js_1 = require("./tool_executor.cjs");
const state_js_1 = require("../graph/state.cjs");
const index_js_1 = require("../graph/index.cjs");
function createAgentExecutor({ agentRunnable, tools, }) {
    let toolExecutor;
    if (!Array.isArray(tools)) {
        toolExecutor = tools;
    }
    else {
        toolExecutor = new tool_executor_js_1.ToolExecutor({
            tools,
        });
    }
    // Define logic that will be used to determine which conditional edge to go down
    const shouldContinue = (data) => {
        if (data.agentOutcome && "returnValues" in data.agentOutcome) {
            return "end";
        }
        return "continue";
    };
    const runAgent = async (data, config) => {
        const agentOutcome = await agentRunnable.invoke(data, config);
        return {
            agentOutcome,
        };
    };
    const executeTools = async (data, config) => {
        const agentAction = data.agentOutcome;
        if (!agentAction || "returnValues" in agentAction) {
            throw new Error("Agent has not been run yet");
        }
        const output = await toolExecutor.invoke(agentAction, config);
        return {
            steps: [{ action: agentAction, observation: output }],
        };
    };
    // Define a new graph
    const workflow = new state_js_1.StateGraph({
        channels: {
            input: null,
            agentOutcome: null,
            steps: {
                reducer: (x, y) => x.concat(y),
                default: () => [],
            },
        },
    })
        // Define the two nodes we will cycle between
        .addNode("agent", runAgent)
        .addNode("action", executeTools)
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
    return workflow.compile();
}
exports.createAgentExecutor = createAgentExecutor;
