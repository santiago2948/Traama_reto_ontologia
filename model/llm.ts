export type LlmMessage = {
  role: "user" | "assistant"
  content: string
}

export type LlmTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type LlmToolCall = {
  name: string
  arguments: unknown
}

export type LlmTurnInput = {
  system: string
  messages: LlmMessage[]
  tools?: LlmTool[]
  toolChoice?: "auto" | "required"
}

export type LlmTurnResult = {
  message: string
  toolCall: LlmToolCall | null
}

export interface LlmClient {
  complete(input: LlmTurnInput): Promise<LlmTurnResult>
}
