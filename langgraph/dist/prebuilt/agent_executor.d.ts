import { AgentAction, AgentFinish } from "@langchain/core/agents";
import { BaseMessage } from "@langchain/core/messages";
import { Runnable } from "@langchain/core/runnables";
import { Tool } from "@langchain/core/tools";
import { ToolExecutor } from "./tool_executor.js";
interface Step {
    action: AgentAction | AgentFinish;
    observation: unknown;
}
export interface AgentExecutorState {
    agentOutcome?: AgentAction | AgentFinish;
    steps: Array<Step>;
    input: string;
    chatHistory?: BaseMessage[];
}
export declare function createAgentExecutor({ agentRunnable, tools, }: {
    agentRunnable: Runnable;
    tools: Array<Tool> | ToolExecutor;
}): import("../graph/state.js").CompiledStateGraph<AgentExecutorState, Partial<AgentExecutorState>, "__start__" | "agent" | "action">;
export {};
