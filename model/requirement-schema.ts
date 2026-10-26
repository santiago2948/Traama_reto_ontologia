import { z } from "zod"
import type { LlmTool } from "@/model/llm"
import type { Requirement } from "@/model/requirement"

const text = z.string().trim().min(1)

export const requirementSchema = z.object({
  necesidad: text,
  decision_objetivo: text,
  alcance: z.object({
    periodo: text,
    unidades: z.array(text).min(1),
  }),
  esquema: z.object({
    clases: z.array(text).min(1),
    relaciones: z.array(
      z.object({
        sujeto: text,
        predicado: text,
        objeto: text,
      }),
    ),
  }),
  reglas_candidatas: z.array(
    z.object({
      id: text,
      enunciado: text,
    }),
  ),
  fuentes_requeridas: z.array(
    z.object({
      nombre: text,
      tipo: z.enum(["excel", "csv", "pdf", "crm-export"]),
      columnas_minimas: z.array(text).min(1),
      justifica: z.array(text).min(1),
    }),
  ),
  preguntas_abiertas: z.array(text),
  completitud: z.enum(["suficiente_para_confirmar", "faltan_datos"]),
})

const findingPattern = /\d+(?:[.,]\d+)?\s*%|\bencontramos\b|\bla causa es\b|\bse debe a\b|\bhallamos\b/i

function mentions(openQuestions: string[], token: string) {
  const haystack = openQuestions.join(" ").toLocaleLowerCase("es")
  return haystack.includes(token.toLocaleLowerCase("es"))
}

function justifyErrors(requirement: Requirement) {
  const errors: string[] = []
  const classes = new Set(requirement.esquema.clases)
  const predicates = new Set(requirement.esquema.relaciones.map((relation) => relation.predicado))
  const ruleIds = new Set(requirement.reglas_candidatas.map((rule) => rule.id))
  const known = new Set([...classes, ...predicates, ...ruleIds])

  for (const relation of requirement.esquema.relaciones) {
    if (!classes.has(relation.sujeto) || !classes.has(relation.objeto)) {
      errors.push(
        `La relación ${relation.sujeto} ${relation.predicado} ${relation.objeto} usa una clase que no está en el esquema.`,
      )
    }
  }

  for (const source of requirement.fuentes_requeridas) {
    for (const token of source.justifica) {
      if (!known.has(token)) {
        errors.push(
          `${source.nombre} justifica "${token}", que no es una clase, una relación ni una regla.`,
        )
      }
    }
  }

  for (const rule of requirement.reglas_candidatas) {
    if (findingPattern.test(rule.enunciado)) {
      errors.push(`${rule.id} afirma un resultado. Una regla tiene que ser una hipótesis.`)
    }
  }

  return errors
}

function covered(requirement: Requirement) {
  const justified = new Set(requirement.fuentes_requeridas.flatMap((source) => source.justifica))
  const classesInUse = new Set(
    requirement.esquema.relaciones.flatMap((relation) => [relation.sujeto, relation.objeto]),
  )

  for (const name of classesInUse) {
    if (!justified.has(name) && !mentions(requirement.preguntas_abiertas, name)) return false
  }

  for (const rule of requirement.reglas_candidatas) {
    const hasSource = requirement.fuentes_requeridas.some((source) => source.justifica.includes(rule.id))
    if (!hasSource && !mentions(requirement.preguntas_abiertas, rule.id)) return false
  }

  return true
}

export type RequirementValidation =
  | { ok: true; requirement: Requirement }
  | { ok: false; errors: string[] }

export function validateRequirement(input: unknown): RequirementValidation {
  const parsed = requirementSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.join(".")
        return path ? `${path}: ${issue.message}` : issue.message
      }),
    }
  }

  const requirement = parsed.data
  const errors = justifyErrors(requirement)
  if (errors.length > 0) return { ok: false, errors }

  if (requirement.completitud === "suficiente_para_confirmar" && !covered(requirement)) {
    requirement.completitud = "faltan_datos"
  }

  return { ok: true, requirement }
}

const stringArray = { type: "array", items: { type: "string" } }

export const registrarRequerimientoTool: LlmTool = {
  name: "registrar_requerimiento",
  description:
    "Registra el requerimiento formal de la entrevista. No la uses para afirmar resultados. Cada fuente y cada columna tienen que justificarse con una clase, una relación o una regla.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [
      "necesidad",
      "decision_objetivo",
      "alcance",
      "esquema",
      "reglas_candidatas",
      "fuentes_requeridas",
      "preguntas_abiertas",
      "completitud",
    ],
    properties: {
      necesidad: { type: "string" },
      decision_objetivo: { type: "string" },
      alcance: {
        type: "object",
        additionalProperties: false,
        required: ["periodo", "unidades"],
        properties: {
          periodo: { type: "string" },
          unidades: stringArray,
        },
      },
      esquema: {
        type: "object",
        additionalProperties: false,
        required: ["clases", "relaciones"],
        properties: {
          clases: stringArray,
          relaciones: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sujeto", "predicado", "objeto"],
              properties: {
                sujeto: { type: "string" },
                predicado: { type: "string" },
                objeto: { type: "string" },
              },
            },
          },
        },
      },
      reglas_candidatas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "enunciado"],
          properties: {
            id: { type: "string" },
            enunciado: { type: "string" },
          },
        },
      },
      fuentes_requeridas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["nombre", "tipo", "columnas_minimas", "justifica"],
          properties: {
            nombre: { type: "string" },
            tipo: { type: "string", enum: ["excel", "csv", "pdf", "crm-export"] },
            columnas_minimas: stringArray,
            justifica: stringArray,
          },
        },
      },
      preguntas_abiertas: stringArray,
      completitud: { type: "string", enum: ["suficiente_para_confirmar", "faltan_datos"] },
    },
  },
}
