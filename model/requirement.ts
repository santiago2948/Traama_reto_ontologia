import type { InterviewPhase } from "@/model/interview"

export type Relation = {
  sujeto: string
  predicado: string
  objeto: string
}

export type Rule = {
  id: string
  enunciado: string
}

export type SourceType = "excel" | "csv" | "pdf" | "crm-export"

export type Source = {
  nombre: string
  tipo: SourceType
  columnas_minimas: string[]
  justifica: string[]
}

export type Completeness = "suficiente_para_confirmar" | "faltan_datos"

export type Requirement = {
  necesidad: string
  decision_objetivo: string
  alcance: {
    periodo: string
    unidades: string[]
  }
  esquema: {
    clases: string[]
    relaciones: Relation[]
  }
  reglas_candidatas: Rule[]
  fuentes_requeridas: Source[]
  preguntas_abiertas: string[]
  completitud: Completeness
}

const sourceLabels: Record<SourceType, string> = {
  excel: "Excel",
  csv: "CSV",
  pdf: "PDF",
  "crm-export": "exportación del sistema",
}

/** Mensajes cortos del chat. El detalle vive en el panel; el resumen largo solo al confirmar. */
export function describePhase(phase: InterviewPhase, requirement: Requirement | null) {
  if (phase === "confirmar") {
    return describeConfirmation(requirement)
  }
  if (phase === "proponer") {
    return "Dejé la propuesta en el panel de la derecha. Si está bien, respondé que sí. Si hay que cambiar algo, decime qué."
  }
  if (phase === "pedir") {
    const open =
      Array.isArray(requirement?.preguntas_abiertas) && requirement.preguntas_abiertas.length > 0
        ? " Hay preguntas abiertas marcadas en el panel."
        : ""
    return `Ya están las fuentes mínimas en el panel.${open} Si está bien, respondé que sí. Si hay que cambiar algo, decime qué.`
  }
  if (phase === "delimitar") {
    return "Con eso avanzo. Si falta un detalle concreto, decime cuál."
  }
  return ""
}

/** Único resumen largo del chat: cuando se pide confirmar en el panel. */
export function describeConfirmation(requirement: Requirement | null) {
  if (!requirement) {
    return "Revisá el modelo del panel. Si está bien, apretá Confirmar."
  }
  return [
    "Así quedó el requerimiento. Revisalo en el panel y apretá Confirmar:",
    "",
    "Necesidad",
    plain(requirement.necesidad),
    "",
    "Decisión",
    plain(requirement.decision_objetivo),
    "",
    "Alcance",
    `${requirement.alcance.periodo} · ${requirement.alcance.unidades.join(", ")}`,
    "",
    "Clases",
    requirement.esquema.clases.join(" · "),
    ...(requirement.reglas_candidatas.length > 0
      ? [
          "",
          "Reglas candidatas",
          ...requirement.reglas_candidatas.map((rule) => `- ${rule.enunciado}`),
        ]
      : []),
    ...(requirement.fuentes_requeridas.length > 0
      ? [
          "",
          "Fuentes requeridas",
          ...requirement.fuentes_requeridas.map(
            (source) =>
              `- ${source.nombre} (${sourceLabels[source.tipo]}): ${source.columnas_minimas.join(", ")}`,
          ),
        ]
      : []),
    ...(Array.isArray(requirement.preguntas_abiertas) &&
    requirement.preguntas_abiertas.length > 0
      ? [
          "",
          "Preguntas abiertas",
          ...requirement.preguntas_abiertas.map((question) => `- ${question}`),
        ]
      : []),
    "",
    "Si hay que cambiar algo, escribilo en el chat.",
  ].join("\n")
}

function plain(text: string) {
  const trimmed = text.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

export const sampleRequirement: Requirement = {
  necesidad:
    "Explicar la baja de unidades por hora-hombre en empaque, que el equipo estima en 15% frente al trimestre anterior",
  decision_objetivo: "Decidir si actuar sobre ausentismo o sobre paradas de máquina",
  alcance: {
    periodo: "trimestre actual vs trimestre anterior",
    unidades: ["Planta de empaque"],
  },
  esquema: {
    clases: [
      "Operario",
      "Linea",
      "Turno",
      "Supervisor",
      "ParteProduccion",
      "Parada",
      "Ausencia",
    ],
    relaciones: [
      { sujeto: "Operario", predicado: "trabajaEn", objeto: "Linea" },
      { sujeto: "Operario", predicado: "asignadoA", objeto: "Turno" },
      { sujeto: "Operario", predicado: "reportaA", objeto: "Supervisor" },
      { sujeto: "ParteProduccion", predicado: "correspondeA", objeto: "Linea" },
      { sujeto: "Parada", predicado: "ocurreEn", objeto: "Linea" },
      { sujeto: "Ausencia", predicado: "afectaA", objeto: "Operario" },
    ],
  },
  reglas_candidatas: [
    {
      id: "R1",
      enunciado:
        "Si en una Línea suben las horas de Parada y bajan las unidades por hora-hombre del ParteProduccion, la baja se asocia a paradas",
    },
    {
      id: "R2",
      enunciado:
        "Si en una Línea suben las Ausencias y bajan las unidades por hora-hombre, la baja se asocia a ausentismo",
    },
  ],
  fuentes_requeridas: [
    {
      nombre: "Partes de producción",
      tipo: "excel",
      columnas_minimas: ["fecha", "linea_id", "turno_id", "unidades", "horas_hombre"],
      justifica: ["ParteProduccion", "correspondeA", "R1", "R2"],
    },
    {
      nombre: "Paradas de máquina",
      tipo: "excel",
      columnas_minimas: ["fecha", "linea_id", "horas_parada"],
      justifica: ["Parada", "ocurreEn", "R1"],
    },
    {
      nombre: "Ausentismo",
      tipo: "excel",
      columnas_minimas: ["fecha", "operario_id", "linea_id", "horas_ausente"],
      justifica: ["Ausencia", "afectaA", "R2"],
    },
    {
      nombre: "Dotación de línea",
      tipo: "excel",
      columnas_minimas: ["operario_id", "linea_id", "turno_id", "supervisor_id"],
      justifica: ["Operario", "trabajaEn", "asignadoA", "reportaA"],
    },
  ],
  preguntas_abiertas: [],
  completitud: "suficiente_para_confirmar",
}
