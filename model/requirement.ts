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
