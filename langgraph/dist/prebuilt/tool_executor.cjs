"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutor = void 0;
const runnables_1 = require("@langchain/core/runnables");
const INVALID_TOOL_MSG_TEMPLATE = `{requestedToolName} is not a valid tool, try one of {availableToolNamesString}.`;
class ToolExecutor extends runnables_1.RunnableBinding {
    constructor(fields) {
        const fieldsWithDefaults = {
            invalidToolMsgTemplate: INVALID_TOOL_MSG_TEMPLATE,
            ...fields,
        };
        const bound = runnables_1.RunnableLambda.from(async (input, config) => this._execute(input, config));
        super({
            bound,
            config: {},
        });
        Object.defineProperty(this, "lc_graph_name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "ToolExecutor"
        });
        Object.defineProperty(this, "tools", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "toolMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "invalidToolMsgTemplate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.tools = fieldsWithDefaults.tools;
        this.invalidToolMsgTemplate = fieldsWithDefaults.invalidToolMsgTemplate;
        this.toolMap = this.tools.reduce((acc, tool) => {
            acc[tool.name] = tool;
            return acc;
        }, {});
    }
    /**
     * Execute a tool invocation
     *
     * @param {ToolInvocationInterface} toolInvocation The tool to invoke and the input to pass to it.
     * @param {RunnableConfig | undefined} config Optional configuration to pass to the tool when invoked.
     * @returns Either the result of the tool invocation (`string` or `ToolMessage`, set by the `ToolOutput` generic) or a string error message.
     */
    async _execute(toolInvocation, config) {
        if (!(toolInvocation.tool in this.toolMap)) {
            return this.invalidToolMsgTemplate
                .replace("{requestedToolName}", toolInvocation.tool)
                .replace("{availableToolNamesString}", Object.keys(this.toolMap).join(", "));
        }
        else {
            const tool = this.toolMap[toolInvocation.tool];
            const output = await tool.invoke(toolInvocation.toolInput, config);
            return output;
        }
    }
}
exports.ToolExecutor = ToolExecutor;
