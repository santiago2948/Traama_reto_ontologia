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
      },
      { timeout: 25_000 },
    )
    const message = response.choices[0]?.message?.content?.trim()
    if (!message) {
      throw new Error("Respuesta vacía")
    }
    return { message }
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
