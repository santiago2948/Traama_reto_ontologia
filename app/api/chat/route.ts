import { connection } from "next/server"
import { createLlmClient } from "@/controller/openai-llm"
import {
  acceptDraft,
  acceptsProposal,
  phaseAfterUserReply,
  resolvePhase,
  scopeLooksReady,
  type InterviewPhase,
} from "@/model/interview"
import type { LlmMessage } from "@/model/llm"
import {
  enrichOpenQuestions,
  formatOpenQuestionForChat,
  mergeOpenQuestions,
} from "@/model/open-questions"
import { buildSystemPrompt } from "@/model/prompt"
import { describeConfirmation, type Requirement, type Source } from "@/model/requirement"
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
  const userTexts = messages.filter((message) => message.role === "user").map((message) => message.text)
  const turns = userTexts.length

  // Solo en la fase final el "sí" confirma el pedido.
  if (
    phase === "confirmar" &&
    requirement?.fuentes_requeridas.length &&
    acceptsProposal(userText)
  ) {
    const confirmed = { ...requirement, completitud: "suficiente_para_confirmar" as const }
    return Response.json({
      message: "Quedó confirmado. Si necesitás un ajuste, escribilo; si no, descargá el JSON desde el panel.",
      requirement: confirmed,
      phase: "confirmar",
    })
  }

  try {
    const client = createLlmClient()
    const llmMessages = toLlmMessages(messages)

    // Ajuste después del resumen final: vuelve a armar el pedido.
    if (phase === "confirmar" && requirement && !acceptsProposal(userText)) {
      const next = await reviseRequirement(client, requirement, llmMessages, userText)
      return finishOrAsk(enrichOpenQuestions(next))
    }

    // Ya hay esquema pero faltan fuentes: cerrar pedir.
    if (requirement?.esquema.clases.length && !requirement.fuentes_requeridas.length) {
      const system = buildSystemPrompt("pedir", requirement)
      const next = enrichOpenQuestions(
        await registerSources(client, system, llmMessages, requirement),
      )
      return finishOrAsk(next)
    }

    // Ya hay fuentes: incorporar la respuesta de la entrevista y seguir o cerrar.
    // No re-enriquecer preguntas abiertas: si no, se reeditan en bucle.
    if (requirement?.fuentes_requeridas.length && phase !== "confirmar") {
      const next = await reviseRequirement(client, requirement, llmMessages, userText)
      return finishOrAsk(next)
    }

    // Delimitar: entrevistar hasta tener alcance; después armar todo y cerrar.
    const readyToModel = turns >= 3 || (turns >= 2 && scopeLooksReady(userTexts))
    if (!readyToModel) {
      const system = buildSystemPrompt("delimitar", requirement)
      const turn = await client.complete({
        system,
        messages: llmMessages,
        tools: [registrarRequerimientoTool],
      })
      const question = keepConversation(turn.message.trim())
      return Response.json({
        message:
          question ||
          [
            "Para entenderlo mejor:",
            "1. ¿Qué decisión querés poder tomar con este análisis?",
            "2. ¿Desde cuándo lo están notando?",
          ].join("\n"),
        requirement: null,
        phase: "delimitar",
      })
    }

    const system = buildSystemPrompt("delimitar", requirement)
    const proposed = enrichOpenQuestions(
      await registerProposal(client, system, llmMessages, messages),
    )
    const withSources = enrichOpenQuestions(
      await registerSources(client, buildSystemPrompt("pedir", proposed), llmMessages, proposed),
    )
    return finishOrAsk(withSources)
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

function finishOrAsk(requirement: Requirement) {
  const open = Array.isArray(requirement.preguntas_abiertas)
    ? requirement.preguntas_abiertas.filter(Boolean)
    : []

  // Si aún hay una duda concreta de datos, preguntarla con un poco de contexto.
  if (requirement.completitud !== "suficiente_para_confirmar" && open.length > 0) {
    return Response.json({
      message: formatOpenQuestionForChat(requirement, open[0]),
      requirement,
      phase: resolvePhase("pedir", requirement),
    })
  }

  const ready = markReady(requirement)
  return Response.json({
    message: describeConfirmation(ready),
    requirement: ready,
    phase: "confirmar",
  })
}

function markReady(requirement: Requirement): Requirement {
  if (!requirement.fuentes_requeridas.length) return requirement
  return { ...requirement, completitud: "suficiente_para_confirmar" }
}

async function registerProposal(
  client: ReturnType<typeof createLlmClient>,
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

Ya hay información suficiente en el hilo. No preguntes más.
Llamá a registrar_requerimiento con necesidad, decisión, alcance, clases concretas, relaciones, hasta 3 reglas, fuentes_requeridas [], preguntas_abiertas si hace falta, completitud "faltan_datos".

Mensajes del usuario:
- ${userBits}`,
    messages: llmMessages,
    tools: [registrarRequerimientoTool],
    toolChoice: "required",
  })

  const accepted = acceptToolCall(turn.toolCall, null)
  if (accepted.requirement) return accepted.requirement
  return proposalFromMessages(messages)
}

async function registerSources(
  client: ReturnType<typeof createLlmClient>,
  system: string,
  llmMessages: LlmMessage[],
  previous: Requirement,
) {
  const turn = await client.complete({
    system: `${system}

El esquema ya está. No lo reescribas.
Base:
${JSON.stringify(previous)}

Llamá a registrar_requerimiento manteniendo necesidad, decisión, alcance, esquema y reglas.
Completá fuentes_requeridas mínimas y preguntas_abiertas solo si hay ambigüedad real de datos.`,
    messages: llmMessages,
    tools: [registrarRequerimientoTool],
    toolChoice: "required",
  })

  const accepted = acceptToolCall(turn.toolCall, previous)
  if (accepted.requirement?.fuentes_requeridas.length) return accepted.requirement
  return sourcesFromSchema(previous)
}

async function reviseRequirement(
  client: ReturnType<typeof createLlmClient>,
  previous: Requirement,
  llmMessages: LlmMessage[],
  userText: string,
) {
  const turn = await client.complete({
    system: `${buildSystemPrompt("pedir", previous)}

La persona aportó este dato o ajuste: "${userText}".
Actualizá el requerimiento con registrar_requerimiento.
Conservá lo que siga válido. Si respondió una pregunta abierta, sacala de preguntas_abiertas o reformulala.
Completá o corregí fuentes/columnas si corresponde.`,
    messages: llmMessages,
    tools: [registrarRequerimientoTool],
    toolChoice: "required",
  })

  const accepted = acceptToolCall(turn.toolCall, previous)
  if (accepted.requirement) {
    return consumeAnsweredQuestion(accepted.requirement, userText, previous)
  }
  return consumeAnsweredQuestion(previous, userText, previous)
}

function consumeAnsweredQuestion(
  requirement: Requirement,
  userText: string,
  previous: Requirement,
): Requirement {
  const open = Array.isArray(requirement.preguntas_abiertas)
    ? [...requirement.preguntas_abiertas]
    : []
  if (open.length === 0) return requirement

  // Si el usuario respondió con sustancia, retiramos la primera pregunta abierta previa.
  if (userText.trim().length > 2 && previous.preguntas_abiertas[0]) {
    const answered = previous.preguntas_abiertas[0]
    return {
      ...requirement,
      preguntas_abiertas: open.filter((question) => question !== answered),
    }
  }
  return requirement
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
    completitud: "faltan_datos" as const,
  }
  const validated = validateRequirement(draft)
  if (!validated.ok) throw new Error("No se pudo armar el borrador del requerimiento")
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
      "En los datos que vamos a pedir hay campos de categoría o motivo. ¿Se cargan con una lista fija de valores o como texto libre? Eso cambia cómo se modelan.",
    ]),
    completitud: "faltan_datos",
  })
  const requirement = validated.ok
    ? validated.requirement
    : {
        ...previous,
        fuentes_requeridas: [source],
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
  if (/mirá el panel|respondé que sí|dejé la propuesta|ya están las fuentes/i.test(text)) {
    return ""
  }
  if (/así quedó|necesidad\s*[:：]|decisión\s*[:：]/i.test(text)) {
    const cut = text.search(/(?:para entender|necesito saber|una pregunta|\n\s*\d{1,2}[.)]\s)/i)
    return cut >= 0 ? text.slice(cut).trim() : ""
  }
  return text
}

function acceptToolCall(
  toolCall: { name: string; arguments: unknown } | null,
  previous: Requirement | null,
) {
  if (!toolCall || toolCall.name !== "registrar_requerimiento") {
    return { requirement: null, errors: [] as string[] }
  }
  if (toolCall.arguments == null) {
    return { requirement: null, errors: ["La tool devolvió argumentos inválidos."] }
  }

  if (previous) {
    const merged = mergeSources(previous, toolCall.arguments)
    if (merged.ok) return { requirement: merged.requirement, errors: [] as string[] }
    const validated = validateRequirement(toolCall.arguments)
    if (validated.ok) return { requirement: validated.requirement, errors: [] as string[] }
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
    ...(typeof record.necesidad === "string" ? { necesidad: record.necesidad } : {}),
    ...(typeof record.decision_objetivo === "string"
      ? { decision_objetivo: record.decision_objetivo }
      : {}),
    ...(record.alcance && typeof record.alcance === "object" ? { alcance: record.alcance } : {}),
    ...(record.esquema && typeof record.esquema === "object" ? { esquema: record.esquema } : {}),
    ...(Array.isArray(record.reglas_candidatas)
      ? { reglas_candidatas: record.reglas_candidatas }
      : {}),
    fuentes_requeridas: Array.isArray(record.fuentes_requeridas)
      ? record.fuentes_requeridas
      : previous.fuentes_requeridas,
    preguntas_abiertas: Array.isArray(record.preguntas_abiertas)
      ? record.preguntas_abiertas
      : previous.preguntas_abiertas,
    completitud:
      record.completitud === "suficiente_para_confirmar" || record.completitud === "faltan_datos"
        ? record.completitud
        : previous.completitud,
  })
}
