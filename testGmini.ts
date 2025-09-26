import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,

});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "你是gemini几",
  });
  console.log(response.text);
}

// await main();

async function testOpenAi() {
  const { createChatCompletion } = await import('./src/utils/openaiClient');
  const res = await createChatCompletion('parseTask', {
    model: 'gpt-4o-mini',
    messages: [
      { role: "user", content: "帮我安排一个明天下午三点到五点的会议" }
    ]
  });
  console.log(res);
}