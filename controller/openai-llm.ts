import "server-only"

import OpenAI from "openai"
import type { LlmClient, LlmTurnInput, LlmTurnResult } from "@/model/llm"

const defaultModel = "gpt-4.1-mini"

export class OpenAiLlm implements LlmClient {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async complete(input: LlmTurnInput): Promise<LlmTurnResult> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: input.system },
          ...input.messages,
        ],
        tools: input.tools?.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            strict: true,
          },
        })),
        tool_choice: input.tools?.length ? "auto" : undefined,
      },
      { timeout: 25_000 },
    )

    const message = response.choices[0]?.message
    if (!message) throw new Error("Respuesta vacía")

    const call = message.tool_calls?.find((item) => item.type === "function")
    const text = message.content?.trim() ?? ""
    if (!text && !call) throw new Error("Respuesta vacía")

    let parsed: unknown = null
    if (call?.type === "function") {
      try {
        parsed = JSON.parse(call.function.arguments)
      } catch {
        parsed = null
      }
    }

    return {
      message: text,
      toolCall: call?.type === "function" ? { name: call.function.name, arguments: parsed } : null,
    }
  }
}

export function createLlmClient(): LlmClient {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY")
  }

  return new OpenAiLlm(
    new OpenAI({ apiKey }),
    process.env.OPENAI_MODEL || defaultModel,
  )
}
