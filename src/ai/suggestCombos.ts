// src/ai/suggestCombos.ts
import { openai } from "../utils/openaiClient";

export async function suggestCombos(taskPool: any[]) {
  const tool = {
    type: "function",
    function: {
      name: "suggest_combos",
      description: "基于相同/相近地点、相似目的或顺路，建议合并任务以节省时间",
      parameters: {
        type: "object",
        properties: {
          combos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                taskIds: { type: "array", items: { type: "number" } },
                reason: { type: "string" }
              },
              required: ["taskIds","reason"]
            }
          }
        },
        required: ["combos"]
      }
    }
  };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    tools: [tool],
    tool_choice: { type: "function", function: "suggest_combos" },
    messages: [
      { role: "system", content: "建议将能一起办的任务合并（购物/顺路等），不要过度合并；给出原因。" },
      { role: "user", content: JSON.stringify(taskPool) }
    ]
  });

  const call = res.choices[0].message.tool_calls?.[0];
  return JSON.parse(call!.function.arguments) as { combos: Array<{ taskIds: number[]; reason: string }> };
}
