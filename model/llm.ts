export type LlmMessage = {
  role: "user" | "assistant"
  content: string
}

export type LlmTurnInput = {
  system: string
  messages: LlmMessage[]
}

export type LlmTurnResult = {
  message: string
}

export interface LlmClient {
  complete(input: LlmTurnInput): Promise<LlmTurnResult>
}
