import { EmptyChannelError } from "../errors.js";
const COLORS_MAP = {
    blue: {
        start: "\x1b[34m",
        end: "\x1b[0m",
    },
};
/**
 * Wrap some text in a color for printing to the console.
 */
const wrap = (color, text) => `${color.start}${text}${color.end}`;
export function printStepStart(step, nextTasks) {
    const nTasks = nextTasks.length;
    console.log(`${wrap(COLORS_MAP.blue, "[langgraph/step]")}`, `Starting step ${step} with ${nTasks} task${nTasks === 1 ? "" : "s"}. Next tasks:\n`, `\n${nextTasks
        .map((task) => `${String(task.name)}(${JSON.stringify(task.input, null, 2)})`)
        .join("\n")}`);
}
export function printCheckpoint(step, channels) {
    console.log(`${wrap(COLORS_MAP.blue, "[langgraph/checkpoint]")}`, `Finishing step ${step}. Channel values:\n`, `\n${JSON.stringify(Object.fromEntries(_readChannels(channels)), null, 2)}`);
}
function* _readChannels(channels
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) {
    for (const [name, channel] of Object.entries(channels)) {
        try {
            yield [name, channel.get()];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }
        catch (error) {
            if (error.name === EmptyChannelError.unminifiable_name) {
                // Skip the channel if it's empty
                continue;
            }
            else {
                throw error; // Re-throw the error if it's not an EmptyChannelError
            }
        }
    }
}
