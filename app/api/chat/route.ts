import { connection } from "next/server"
import { createLlmClient } from "@/controller/openai-llm"
import {
  acceptDraft,
  acceptsNoChanges,
  acceptsProposal,
  phaseAfterUserReply,
  resolvePhase,
  type InterviewPhase,
} from "@/model/interview"
import type { LlmMessage } from "@/model/llm"
import { enrichOpenQuestions, mergeOpenQuestions } from "@/model/open-questions"
import { buildSystemPrompt } from "@/model/prompt"
import { describePhase, type Requirement, type Source } from "@/model/requirement"
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

  const requestedPhase = "phase" in body ? body.phase : undefined
  const messages = "messages" in body ? readMessages(body.messages) : null
  const requirement = "requirement" in body ? readRequirement(body.requirement) : null

  if (!isPhase(requestedPhase) || !messages) {
    return Response.json({ error: "El pedido no es válido." }, { status: 400 })
  }

  const lastUser = [...messages].reverse().find((message) => message.role === "user")
  const userText = lastUser?.text ?? ""
  const acceptedDraft = acceptDraft(requirement, userText)
  const phase = phaseAfterUserReply(requestedPhase, userText, acceptedDraft ?? requirement)

  // Confirmación final: ya hay fuentes y el usuario acepta.
  if (
    requirement?.fuentes_requeridas.length &&
    (acceptedDraft?.completitud === "suficiente_para_confirmar" ||
      ((acceptsProposal(userText) || acceptsNoChanges(userText)) &&
        (requestedPhase === "pedir" || phase === "confirmar")))
  ) {
    const confirmed = { ...requirement, completitud: "suficiente_para_confirmar" as const }
    return Response.json({
      message: describePhase("confirmar", confirmed),
      requirement: confirmed,
      phase: "confirmar",
    })
  }

  try {
    const client = createLlmClient()
    const system = buildSystemPrompt(phase, requirement)
    const llmMessages = toLlmMessages(messages)
    const turns = userTurns(messages)

    // 1) Pedir fuentes: una sola llamada, merge sobre el esquema aceptado.
    if (phase === "pedir" && requirement?.esquema.clases.length) {
      const next = enrichOpenQuestions(await registerSources(client, system, llmMessages, requirement))
      return Response.json({
        message: describePhase("pedir", next),
        requirement: next,
        phase: resolvePhase(phase, next),
      })
    }

    // 2) Proponer modelo: a partir del 2º mensaje del usuario, una sola tool call.
    if (phase === "delimitar" && turns >= 2) {
      const next = enrichOpenQuestions(await registerProposal(client, system, llmMessages, messages))
      return Response.json({
        message: describePhase("proponer", next),
        requirement: next,
        phase: resolvePhase("delimitar", next),
      })
    }

    // 3) Delimitar: solo preguntas (sin forzar tool).
    const turn = await client.complete({
      system,
      messages: llmMessages,
      tools: [registrarRequerimientoTool],
    })
    const accepted = acceptToolCall(turn.toolCall, phase, requirement)
    if (accepted.requirement) {
      const next = enrichOpenQuestions(accepted.requirement)
      const nextPhase = resolvePhase(phase, next)
      return Response.json({
        message: describePhase(nextPhase === "pedir" ? "pedir" : "proponer", next),
        requirement: next,
        phase: nextPhase,
      })
    }

    const question = keepConversation(turn.message.trim())
    return Response.json({
      message:
        question ||
        [
          "Para delimitarlo necesito saber:",
          "1. ¿Qué decisión querés poder tomar con esto?",
          "2. ¿En qué período lo estás viendo?",
        ].join("\n"),
      requirement: null,
      phase,
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

async function registerProposal(
  client: LlmClient,
  system: string,
  llmMessages: LlmMessage[],
  messages: IncomingMessage[],
) {
  const userBits = messages
    .filter((message) => message.role === "user")
    .map((message) => message.text)
    .join("\n- ")

  const turn = await client.complete({
    system: `${system}

La persona ya dio necesidad, decisión y alcance en el hilo. No preguntes más.
Llamá a registrar_requerimiento ahora con:
- necesidad, decision_objetivo y alcance tomados del hilo
- clases concretas cargables (4 a 7), no abstractas
- relaciones conectando cada clase
- hasta 3 reglas candidatas como hipótesis
- fuentes_requeridas: []
- preguntas_abiertas: ambigüedades del alcance o sospecha (o [] si no hay)
- completitud: "faltan_datos"

Mensajes del usuario:
- ${userBits}

Mensaje de chat vacío.`,
    messages: llmMessages,
    tools: [registrarRequerimientoTool],
    toolChoice: "required",
  })

  const accepted = acceptToolCall(turn.toolCall, "delimitar", null)
  if (accepted.requirement) return accepted.requirement

  // Último recurso predecible: armar un borrador mínimo desde el hilo.
  return proposalFromMessages(messages)
}

async function registerSources(
  client: LlmClient,
  system: string,
  llmMessages: LlmMessage[],
  previous: Requirement,
) {
  const turn = await client.complete({
    system: `${system}

El esquema ya está aceptado. No lo reescribas.
Base:
${JSON.stringify(previous)}

Llamá a registrar_requerimiento manteniendo necesidad, decisión, alcance, esquema y reglas.
Solo completá fuentes_requeridas (mínimo justificado) y preguntas_abiertas si hace falta.
Mensaje vacío.`,
    messages: llmMessages,
    tools: [registrarRequerimientoTool],
    toolChoice: "required",
  })

  const accepted = acceptToolCall(turn.toolCall, "pedir", previous)
  if (accepted.requirement?.fuentes_requeridas.length) return accepted.requirement
  return sourcesFromSchema(previous)
}

function proposalFromMessages(messages: IncomingMessage[]): Requirement {
  const users = messages.filter((message) => message.role === "user").map((message) => message.text)
  const first = users[0] ?? "Necesidad de negocio"
  const second = users[1] ?? first
  const period = guessPeriod(users.join(" "))
  const unit = guessUnit(users.join(" "))
  const draft = {
    necesidad: first.replace(/\{+$/g, "").trim(),
    decision_objetivo: second.replace(/\{+$/g, "").trim(),
    alcance: {
      periodo: period || "período a confirmar",
      unidades: [unit || "Área mencionada"],
    },
    esquema: {
      clases: ["Entidad", "Evento", "Contexto"],
      relaciones: [
        { sujeto: "Entidad", predicado: "participaEn", objeto: "Evento" },
        { sujeto: "Evento", predicado: "ocurreEn", objeto: "Contexto" },
      ],
    },
    reglas_candidatas: [
      {
        id: "R1",
        enunciado:
          "Si un Evento se concentra en un Contexto, asociar ese Contexto como hipótesis a revisar",
      },
    ],
    fuentes_requeridas: [],
    preguntas_abiertas: mergeOpenQuestions([], [
      period ? null : "¿Cuál es el período exacto a analizar?",
      unit ? null : "¿Sobre qué unidad o área exacta aplica el análisis?",
    ]),
    completitud: "faltan_datos",
  }
  const validated = validateRequirement(draft)
  if (!validated.ok) {
    throw new Error("No se pudo armar el borrador del requerimiento")
  }
  return enrichOpenQuestions(validated.requirement)
}

function sourcesFromSchema(previous: Requirement): Requirement {
  const ruleIds = previous.reglas_candidatas.map((rule) => rule.id)
  const source: Source = {
    nombre: "Datos operativos",
    tipo: "excel",
    columnas_minimas: [
      "id",
      "fecha",
      ...previous.esquema.clases.map((name) => `${toColumn(name)}_id`),
    ],
    justifica: [...previous.esquema.clases, ...ruleIds],
  }
  const validated = validateRequirement({
    ...previous,
    fuentes_requeridas: [source],
    preguntas_abiertas: mergeOpenQuestions(previous.preguntas_abiertas, [
      "¿Los datos viven en Excel, CSV, PDF o una exportación de CRM, y con qué nombre interno?",
    ]),
    completitud: "faltan_datos",
  })
  const requirement = validated.ok
    ? validated.requirement
    : {
        ...previous,
        fuentes_requeridas: [source],
        preguntas_abiertas: mergeOpenQuestions(previous.preguntas_abiertas, [
          "¿Los datos viven en Excel, CSV, PDF o una exportación de CRM, y con qué nombre interno?",
        ]),
        completitud: "faltan_datos" as const,
      }
  return enrichOpenQuestions(requirement)
}

function guessPeriod(text: string) {
  const match = text.match(
    /(?:ultim[oa]s?\s+\d+\s+(?:meses|semanas|dias)|hace\s+\d+\s+(?:meses|semanas|dias)|ultimo trimestre|este año|este mes)/i,
  )
  return match?.[0]
}

function guessUnit(text: string) {
  const match = text.match(
    /planta\s+\w+|area\s+de\s+\w+|operaciones|fulfillment|bodega(?:\s+\w+)?|soporte|linea\s+\d+/i,
  )
  return match?.[0]
}

function toColumn(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

function keepConversation(text: string) {
  if (!text) return ""
  if (/no pude cerrar|todavía estoy armando|decime el dato que falta/i.test(text)) return ""
  if (
    !/así quedó esta parte|así quedó el requerimiento|\bnecesidad\s*[:：]|\bdecisión\s*[:：]/i.test(
      text,
    )
  ) {
    return text
  }
  const cut = text.search(
    /(?:para delimitar|necesito saber|me falta|una pregunta|\n\s*\d{1,2}[.)]\s)/i,
  )
  return cut >= 0 ? text.slice(cut).trim() : ""
}

function userTurns(history: IncomingMessage[]) {
  return history.filter((message) => message.role === "user").length
}

function acceptToolCall(
  toolCall: { name: string; arguments: unknown } | null,
  phase: InterviewPhase,
  previous: Requirement | null,
) {
  if (!toolCall || toolCall.name !== "registrar_requerimiento") {
    return { requirement: null, errors: [] as string[] }
  }
  if (toolCall.arguments == null) {
    return { requirement: null, errors: ["La tool devolvió argumentos inválidos."] }
  }

  if (phase === "pedir" && previous) {
    const merged = mergeSources(previous, toolCall.arguments)
    if (merged.ok) {
      if (!merged.requirement.fuentes_requeridas.length) {
        return { requirement: null, errors: ["Faltan fuentes_requeridas."] }
      }
      return { requirement: merged.requirement, errors: [] as string[] }
    }
    return { requirement: null, errors: merged.errors }
  }

  const validated = validateRequirement(toolCall.arguments)
  if (!validated.ok) return { requirement: null, errors: validated.errors }
  return { requirement: validated.requirement, errors: [] as string[] }
}

function mergeSources(previous: Requirement, args: unknown) {
  if (!args || typeof args !== "object") {
    return { ok: false as const, errors: ["Argumentos vacíos."] }
  }
  const record = args as Record<string, unknown>
  return validateRequirement({
    ...previous,
    fuentes_requeridas: Array.isArray(record.fuentes_requeridas)
      ? record.fuentes_requeridas
      : previous.fuentes_requeridas,
    preguntas_abiertas: Array.isArray(record.preguntas_abiertas)
      ? record.preguntas_abiertas
      : previous.preguntas_abiertas,
    completitud:
      record.completitud === "suficiente_para_confirmar" || record.completitud === "faltan_datos"
        ? record.completitud
        : "faltan_datos",
  })
}
