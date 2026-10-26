import { sampleRequirement, type Requirement } from "@/model/requirement"

export type InterviewPhase = "delimitar" | "proponer" | "pedir" | "confirmar"

export type ChatRole = "agent" | "user"

export type ChatMessage = {
  id: string
  role: ChatRole
  text: string
}

export type InterviewState = {
  messages: ChatMessage[]
  requirement: Requirement
  version: number
  confirmed: boolean
  phase: InterviewPhase
}

const sampleMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    text: "Quiero saber por qué se redujo la productividad en un 15%.",
  },
  {
    id: "m2",
    role: "agent",
    text: "Para armar el pedido necesito cerrar dos cosas. ¿Productividad de qué, medida contra qué período? ¿Y la decisión es elegir entre causas concretas, por ejemplo ausentismo o paradas de máquina?",
  },
  {
    id: "m3",
    role: "user",
    text: "Unidades producidas por hora-hombre en la planta de empaque, este trimestre contra el anterior. Queremos decidir si el problema está en el ausentismo o en las paradas de máquina.",
  },
  {
    id: "m4",
    role: "agent",
    text: "Con eso el pedido queda en el panel: operario, línea, turno, supervisor, parte de producción, parada y ausencia. R1 y R2 son hipótesis para revisar cuando existan los Excel. El 15% queda como lo formulaste; esta vista no lo calcula.",
  },
]

export function createInterview(): InterviewState {
  return {
    messages: sampleMessages,
    requirement: sampleRequirement,
    version: 2,
    confirmed: false,
    phase: "confirmar",
  }
}

export function resolvePhase(phase: InterviewPhase, requirement: Requirement | null): InterviewPhase {
  if (!requirement) return phase
  const hasSchema = requirement.esquema.clases.length > 0
  const hasSources = requirement.fuentes_requeridas.length > 0
  if (phase === "delimitar" && hasSchema) {
    if (!hasSources) return "proponer"
    return requirement.completitud === "suficiente_para_confirmar" ? "confirmar" : "pedir"
  }
  if (phase === "proponer" && hasSources) {
    return requirement.completitud === "suficiente_para_confirmar" ? "confirmar" : "pedir"
  }
  if (phase === "pedir" && requirement.completitud === "suficiente_para_confirmar") return "confirmar"
  return phase
}

export function applyAgentTurn(
  state: InterviewState,
  message: string,
  requirement: Requirement | null,
): InterviewState {
  const withMessage = appendAgentMessage(state, message)
  if (!requirement) return withMessage
  return {
    ...withMessage,
    requirement,
    version: state.version + 1,
    confirmed: false,
    phase: resolvePhase(state.phase, requirement),
  }
}

export function isSendable(text: string) {
  return text.trim().length > 0
}

export function appendUserMessage(state: InterviewState, text: string): InterviewState {
  const trimmed = text.trim()
  if (!trimmed) return state

  return {
    ...state,
    messages: [
      ...state.messages,
      { id: `local-${state.messages.length + 1}`, role: "user", text: trimmed },
    ],
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
  return { ...state, confirmed: !state.confirmed }
}
