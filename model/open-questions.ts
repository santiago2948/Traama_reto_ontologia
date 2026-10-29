import type { Requirement } from "@/model/requirement"

/** Normaliza cualquier valor a una lista segura de preguntas abiertas. */
export function normalizeOpenQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const questions: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const trimmed = item.trim().replace(/\s+/g, " ")
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    questions.push(trimmed)
  }
  return questions
}

export function mergeOpenQuestions(
  current: unknown,
  extras: Array<string | null | undefined>,
): string[] {
  return normalizeOpenQuestions([
    ...(Array.isArray(current) ? current : []),
    ...extras.filter((item): item is string => typeof item === "string"),
  ])
}

/**
 * Completa preguntas abiertas obvias sin romper el requerimiento.
 * No inventa hallazgos: solo deja marcado lo ambiguo o pendiente de confirmar.
 */
export function enrichOpenQuestions(requirement: Requirement): Requirement {
  const extras: string[] = []

  const period = requirement.alcance.periodo.toLocaleLowerCase("es")
  if (
    /a confirmar|no especif|desconocido|sin definir|no sabe|no conoc/i.test(period) ||
    period.trim() === "periodo" ||
    period.trim() === "período"
  ) {
    extras.push(
      "Para acotar el análisis: ¿cuál es el período exacto que querés revisar (desde–hasta o últimos N meses)?",
    )
  }

  for (const unit of requirement.alcance.unidades) {
    if (/área mencionada|a confirmar|no especif|desconocid/i.test(unit)) {
      extras.push(
        "Para no mezclar áreas: ¿sobre qué unidad o planta exacta aplica el análisis?",
      )
      break
    }
  }

  if (requirement.fuentes_requeridas.length > 0) {
    const hasCategoricalAmbiguity = requirement.fuentes_requeridas.some((source) =>
      source.columnas_minimas.some((column) =>
        /motivo|categoria|estado|tipo|razon/i.test(column),
      ),
    )
    if (hasCategoricalAmbiguity) {
      const decisionHint = requirement.decision.trim()
        ? ` (p. ej. para distinguir opciones como en «${clip(requirement.decision, 80)}»)`
        : ""
      extras.push(
        `En los datos que vamos a pedir hay campos de motivo, categoría o estado${decisionHint}. ¿Se cargan con una lista fija de valores o como texto libre? Eso cambia cómo se modelan.`,
      )
    }
  }

  return {
    ...requirement,
    preguntas_abiertas: mergeOpenQuestions(requirement.preguntas_abiertas, extras),
  }
}

function clip(text: string, max: number) {
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

/** Mensaje de chat: una línea de por qué + la pregunta abierta. */
export function formatOpenQuestionForChat(
  requirement: Requirement,
  question: string,
): string {
  const trimmed = question.trim()
  if (!trimmed) return trimmed
  if (/^(para |con lo |en los |sobre )/i.test(trimmed) && trimmed.length > 60) {
    return trimmed
  }

  const decision = requirement.decision.trim()
  const need = requirement.necesidad.trim()
  const focus = decision || need
  const bridge = focus
    ? `Con lo que contaste ya puedo armar el pedido para «${clip(focus, 90)}». Me falta un detalle de los datos:`
    : "Con lo que contaste ya puedo armar el pedido. Me falta un detalle de los datos:"

  return `${bridge}\n\n${trimmed}`
}
