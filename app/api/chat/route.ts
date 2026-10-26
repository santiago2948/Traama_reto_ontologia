import { connection } from "next/server"
import { createLlmClient } from "@/controller/openai-llm"
import type { InterviewPhase } from "@/model/interview"
import type { LlmMessage } from "@/model/llm"
import { buildSystemPrompt } from "@/model/prompt"
import type { Requirement } from "@/model/requirement"
import { registrarRequerimientoTool, validateRequirement } from "@/model/requirement-schema"
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

function readRequirement(value: unknown): Requirement | null {
  if (!value || typeof value !== "object") return null
  const validated = validateRequirement(value)
  return validated.ok ? validated.requirement : null
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
  const requirement = "requirement" in body ? readRequirement(body.requirement) : null

  if (!isPhase(phase) || !messages) {
    return Response.json({ error: "El pedido no es válido." }, { status: 400 })
  }

  try {
    const client = createLlmClient()
    const system = buildSystemPrompt(phase, requirement)
    const llmMessages = toLlmMessages(messages)
    const first = await client.complete({
      system,
      messages: llmMessages,
      tools: [registrarRequerimientoTool],
    })

    const accepted = acceptToolCall(first.toolCall)
    if (accepted.requirement || !first.toolCall) {
      return Response.json({
        message: first.message || "Dejé el requerimiento en el panel para revisarlo.",
        requirement: accepted.requirement,
      })
    }

    const repair = await client.complete({
      system: `${system}\n\nEl registrar_requerimiento anterior no se mostró porque no validó: ${accepted.errors.join(" ")} Pedile a la persona solo lo que falta. No inventes el dato ni afirmes un resultado.`,
      messages: [
        ...llmMessages,
        ...(first.message ? [{ role: "assistant" as const, content: first.message }] : []),
      ],
      tools: [registrarRequerimientoTool],
    })
    const retried = acceptToolCall(repair.toolCall)

    return Response.json({
      message:
        repair.message ||
        first.message ||
        `No pude mostrar el requerimiento. ${accepted.errors[0]}`,
      requirement: retried.requirement,
    })
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

function acceptToolCall(toolCall: { name: string; arguments: unknown } | null) {
  if (!toolCall || toolCall.name !== "registrar_requerimiento") {
    return { requirement: null, errors: [] as string[] }
  }
  const validated = validateRequirement(toolCall.arguments)
  if (!validated.ok) return { requirement: null, errors: validated.errors }
  return { requirement: validated.requirement, errors: [] as string[] }
}
