import { z } from "zod"
import type { LlmTool } from "@/model/llm"
import { normalizeOpenQuestions } from "@/model/open-questions"
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
    relaciones: z
      .array(
        z.object({
          sujeto: text,
          predicado: text,
          objeto: text,
        }),
      )
      .min(1),
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

// Solo rechaza afirmaciones de hallazgo. Un % que trajo el usuario en una hipótesis no invalida la regla.
const findingPattern = /\b(encontramos|hallamos|la causa es|se debe a)\b/i

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

  if (requirement.esquema.relaciones.length === 0) {
    errors.push("esquema.relaciones tiene que conectar las clases. No puede quedar vacío.")
  }

  const connected = new Set<string>()
  for (const relation of requirement.esquema.relaciones) {
    if (!classes.has(relation.sujeto) || !classes.has(relation.objeto)) {
      errors.push(
        `La relación ${relation.sujeto} ${relation.predicado} ${relation.objeto} usa una clase que no está en el esquema.`,
      )
    } else {
      connected.add(relation.sujeto)
      connected.add(relation.objeto)
    }
  }

  if (requirement.esquema.clases.length > 1) {
    for (const name of requirement.esquema.clases) {
      if (!connected.has(name)) {
        errors.push(
          `La clase ${name} no aparece en ninguna relación. Conectala con otra clase del esquema.`,
        )
      }
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

  for (const name of requirement.esquema.clases) {
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
  const repairedInput = repairRequirementShape(input)
  const parsed = requirementSchema.safeParse(repairedInput)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.join(".")
        if (issue.code === "too_small" && path === "esquema.clases") {
          return "esquema.clases tiene que tener al menos una clase, tomada de las palabras de la persona."
        }
        if (issue.code === "too_small" && path === "esquema.relaciones") {
          return "esquema.relaciones tiene que conectar las clases. Incluí al menos una relación sujeto-predicado-objeto."
        }
        if (issue.code === "too_small" && path === "alcance.unidades") {
          return "alcance.unidades tiene que tener al menos una unidad."
        }
        if (issue.code === "too_small") {
          return path ? `${path} no puede quedar vacío.` : "Hay un campo vacío."
        }
        return path ? `${path}: ${issue.message}` : issue.message
      }),
    }
  }

  const requirement = repairRequirementGraph(parsed.data)
  const errors = justifyErrors(requirement)
  if (errors.length > 0) return { ok: false, errors }

  if (requirement.completitud === "suficiente_para_confirmar" && !covered(requirement)) {
    requirement.completitud = "faltan_datos"
  }

  return { ok: true, requirement }
}

/** Completa campos faltantes frecuentes del modelo antes del parse Zod. */
function repairRequirementShape(input: unknown): unknown {
  if (!input || typeof input !== "object") return input
  const value = { ...(input as Record<string, unknown>) }
  if (!Array.isArray(value.fuentes_requeridas)) value.fuentes_requeridas = []
  value.preguntas_abiertas = normalizeOpenQuestions(value.preguntas_abiertas)
  if (!Array.isArray(value.reglas_candidatas)) value.reglas_candidatas = []
  if (value.completitud !== "suficiente_para_confirmar" && value.completitud !== "faltan_datos") {
    value.completitud = "faltan_datos"
  }
  return value
}

/** Conecta clases huérfanas y limpia justifica inválidos para no tumbar el turno. */
function repairRequirementGraph(requirement: Requirement): Requirement {
  const classes = [...requirement.esquema.clases]
  let relations = requirement.esquema.relaciones.filter(
    (relation) => classes.includes(relation.sujeto) && classes.includes(relation.objeto),
  )

  if (relations.length === 0 && classes.length >= 2) {
    relations = [
      {
        sujeto: classes[0],
        predicado: "relacionadoCon",
        objeto: classes[1],
      },
    ]
  }

  const connected = new Set<string>()
  for (const relation of relations) {
    connected.add(relation.sujeto)
    connected.add(relation.objeto)
  }

  const anchor = classes.find((name) => connected.has(name)) ?? classes[0]
  for (const name of classes) {
    if (!connected.has(name) && name !== anchor) {
      relations.push({ sujeto: name, predicado: "relacionadoCon", objeto: anchor })
      connected.add(name)
    }
  }

  const predicates = new Set(relations.map((relation) => relation.predicado))
  const ruleIds = new Set(requirement.reglas_candidatas.map((rule) => rule.id))
  const known = new Set([...classes, ...predicates, ...ruleIds])

  const fuentes = requirement.fuentes_requeridas.map((source) => ({
    ...source,
    justifica: source.justifica.filter((token) => known.has(token)).length
      ? source.justifica.filter((token) => known.has(token))
      : [classes[0]],
  }))

  const reglas = requirement.reglas_candidatas
    .map((rule, index) => ({
      id: rule.id || `R${index + 1}`,
      enunciado: findingPattern.test(rule.enunciado)
        ? rule.enunciado.replace(findingPattern, "si ocurre esto, asociar")
        : rule.enunciado,
    }))
    .filter((rule) => rule.enunciado.trim().length > 0)

  return {
    ...requirement,
    esquema: { clases: classes, relaciones: relations },
    reglas_candidatas: reglas,
    fuentes_requeridas: fuentes,
    preguntas_abiertas: normalizeOpenQuestions(requirement.preguntas_abiertas),
  }
}

const stringArray = { type: "array", items: { type: "string" } }
const nonEmptyStringArray = { type: "array", minItems: 1, items: { type: "string" } }

export const registrarRequerimientoTool: LlmTool = {
  name: "registrar_requerimiento",
  description:
    "Registra el requerimiento formal de la entrevista. No la uses para afirmar resultados. esquema.clases son entidades concretas cargables (Producto, Movimiento, Conteo), no resúmenes abstractos (StockSistema, DiferenciaStock). Los ids (producto_id) van en columnas de fuentes, no como clases. Cada clase se conecta con al menos una relación sujeto-predicado-objeto. Cada fuente y columna se justifica con una clase, un predicado o una regla.",
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
          unidades: nonEmptyStringArray,
        },
      },
      esquema: {
        type: "object",
        additionalProperties: false,
        required: ["clases", "relaciones"],
        properties: {
          clases: nonEmptyStringArray,
          relaciones: {
            type: "array",
            minItems: 1,
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
            columnas_minimas: nonEmptyStringArray,
            justifica: nonEmptyStringArray,
          },
        },
      },
      preguntas_abiertas: stringArray,
      completitud: { type: "string", enum: ["suficiente_para_confirmar", "faltan_datos"] },
    },
  },
}
