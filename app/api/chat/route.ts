import { connection } from "next/server"
import { createLlmClient } from "@/controller/openai-llm"
import type { InterviewPhase } from "@/model/interview"
import type { LlmMessage } from "@/model/llm"
import { buildSystemPrompt } from "@/model/prompt"
import type { Requirement } from "@/model/requirement"
import OpenAI from "openai"

const phases: InterviewPhase[] = ["delimitar", "proponer", "pedir", "confirmar"]
const maxMessages = 40
const maxChars = 2_000

type IncomingMessage = {
  role: "agent" | "user"
  text: string
}

function isPhase(value: unknown): value is InterviewPhase {
  return typeof value === "string" && phases.includes(value as InterviewPhase)
}

function readMessages(value: unknown): IncomingMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxMessages) {
    return null
  }

  const messages: IncomingMessage[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const role = "role" in item ? item.role : undefined
    const text = "text" in item ? item.text : undefined
    if ((role !== "agent" && role !== "user") || typeof text !== "string") return null
    const trimmed = text.trim()
    if (!trimmed || trimmed.length > maxChars) return null
    messages.push({ role, text: trimmed })
  }
  return messages
}

function toLlmMessages(messages: IncomingMessage[]): LlmMessage[] {
  return messages.map((message) => ({
    role: message.role === "agent" ? "assistant" : "user",
    content: message.text,
  }))
}

export async function POST(request: Request) {
  await connection()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El pedido no es válido." }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "El pedido no es válido." }, { status: 400 })
  }

  const phase = "phase" in body ? body.phase : undefined
  const messages = "messages" in body ? readMessages(body.messages) : null
  const requirement =
    "requirement" in body && body.requirement && typeof body.requirement === "object"
      ? (body.requirement as Requirement)
      : null

  if (!isPhase(phase) || !messages) {
    return Response.json({ error: "El pedido no es válido." }, { status: 400 })
  }

  try {
    const client = createLlmClient()
    const result = await client.complete({
      system: buildSystemPrompt(phase, requirement),
      messages: toLlmMessages(messages),
    })
    return Response.json({ message: result.message })
  } catch (error) {
    const status = error instanceof OpenAI.APIError ? error.status : undefined
    console.error("openai_failed", status ?? "unknown")
    const missingKey = error instanceof Error && error.message === "Falta OPENAI_API_KEY"
    return Response.json(
      {
        error: missingKey
          ? "Falta OPENAI_API_KEY en el servidor."
          : "No se pudo completar el turno.",
      },
      { status: missingKey ? 500 : 502 },
    )
  }
}
