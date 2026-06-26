import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(
  process.env.AI_GATEWAY_API_KEY!
);

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });

    const result = await model.generateContent(message);

    return Response.json({
      reply: result.response.text(),
    });
  } catch (error) {
    return Response.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}