import type { Requirement } from "@/model/requirement"

export type InterviewPhase = "delimitar" | "proponer" | "pedir" | "confirmar"

export type ChatRole = "agent" | "user"

export type ChatMessage = {
  id: string
  role: ChatRole
  text: string
}

export type InterviewState = {
  messages: ChatMessage[]
  requirement: Requirement | null
  version: number
  confirmed: boolean
  phase: InterviewPhase
}

export function createInterview(): InterviewState {
  return {
    messages: [],
    requirement: null,
    version: 0,
    confirmed: false,
    phase: "delimitar",
  }
}

function normalize(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function acceptsProposal(text: string) {
  const value = normalize(text)
  if (!value || value.length > 120) return false
  if (/\b(pero|saca|cambia|agrega|quita|falta|excepto|menos|mal|incorrecto)\b/.test(value)) {
    return false
  }
  if (/^(no|no hace falta|sin cambios|deja asi|dejalo asi)(\b|[,.!]|$)/.test(value)) {
    return true
  }
  if (/\bno\b/.test(value)) return false
  return /^(si|ok|okay|dale|de acuerdo|correcto|asi esta|esta bien|esta correcto|me parece bien|perfecto|confirmo|adelante)(\b|[,.!]|$)/.test(
    value,
  )
}

export function acceptDraft(requirement: Requirement | null, text: string): Requirement | null {
  if (!requirement || !acceptsProposal(text)) return requirement
  if (requirement.esquema.clases.length === 0 || requirement.fuentes_requeridas.length === 0) {
    return requirement
  }
  return { ...requirement, completitud: "suficiente_para_confirmar" }
}

/** Las fases intermedias avanzan solas por datos; el "sí" solo cierra la confirmación final. */
export function phaseAfterUserReply(
  phase: InterviewPhase,
  text: string,
  requirement: Requirement | null = null,
): InterviewPhase {
  if (phase === "confirmar" && acceptsProposal(text) && requirement?.fuentes_requeridas.length) {
    return "confirmar"
  }
  return phase
}

export function resolvePhase(phase: InterviewPhase, requirement: Requirement | null): InterviewPhase {
  if (!requirement) return phase === "confirmar" ? "delimitar" : phase
  const hasSchema = requirement.esquema.clases.length > 0
  const hasSources = requirement.fuentes_requeridas.length > 0

  if (hasSchema && hasSources && requirement.completitud === "suficiente_para_confirmar") {
    return "confirmar"
  }
  if (hasSchema && hasSources) return "pedir"
  if (hasSchema) return "proponer"
  return "delimitar"
}

export function applyAgentTurn(
  state: InterviewState,
  message: string,
  requirement: Requirement | null,
): InterviewState {
  const withMessage = appendAgentMessage(state, message)
  if (!requirement) return withMessage
  const phase = resolvePhase(state.phase, requirement)
  if (state.requirement && JSON.stringify(state.requirement) === JSON.stringify(requirement)) {
    return { ...withMessage, phase }
  }
  return {
    ...withMessage,
    requirement,
    version: state.version + 1,
    confirmed: false,
    phase,
  }
}

export function isSendable(text: string) {
  return text.trim().length > 0
}

export function appendUserMessage(state: InterviewState, text: string): InterviewState {
  const trimmed = text.trim()
  if (!trimmed) return state

  const next: InterviewState = {
    ...state,
    messages: [
      ...state.messages,
      { id: `local-${state.messages.length + 1}`, role: "user", text: trimmed },
    ],
  }
  const requirement = acceptDraft(next.requirement, trimmed)
  return {
    ...next,
    requirement,
    phase: phaseAfterUserReply(next.phase, trimmed, requirement),
  }
}

export function appendAgentMessage(state: InterviewState, text: string): InterviewState {
  const trimmed = text.trim()
  if (!trimmed) return state

  return {
    ...state,
    messages: [
      ...state.messages,
      { id: `agent-${state.messages.length + 1}`, role: "agent", text: trimmed },
    ],
  }
}

export function toggleConfirmation(state: InterviewState): InterviewState {
  if (!state.requirement) return state
  const ready = state.requirement.completitud === "suficiente_para_confirmar"
  if (!state.confirmed && !ready) return state
  return { ...state, confirmed: !state.confirmed }
}

/** ¿El hilo ya trae decisión y período suficientes para cerrar delimitar? */
export function scopeLooksReady(userTexts: string[]): boolean {
  const text = userTexts.join(" \n ")
  const hasPeriod =
    /ultim[oa]s?\s+\d+|hace\s+\d+|meses|semanas|dias|trimestre|periodo|desde\s+hace|este a[nñ]o|este mes/i.test(
      text,
    )
  const hasDecision =
    /decidir|actu(?:ar|emos)|cambiar|revisar|ajust(?:ar|e)|tomar\s+medidas|entre .+ o |si .+ o /i.test(
      text,
    )
  return hasPeriod && hasDecision
}
