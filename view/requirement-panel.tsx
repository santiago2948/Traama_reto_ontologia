"use client"

import { Button } from "@/view/ui/button"
import type { Requirement, SourceType } from "@/model/requirement"

const sourceLabels: Record<SourceType, string> = {
  excel: "Excel",
  csv: "CSV",
  pdf: "PDF",
  "crm-export": "CRM",
}

function panelStatus(requirement: Requirement, confirmed: boolean) {
  if (confirmed) {
    return {
      badge: "Confirmado",
      footer: "El requerimiento quedó confirmado. Descargá el JSON o pedí un ajuste.",
    }
  }
  if (requirement.completitud === "suficiente_para_confirmar") {
    return {
      badge: "Esperando confirmación",
      footer: "Revisá el modelo y apretá Confirmar.",
    }
  }
  if (requirement.fuentes_requeridas.length === 0) {
    return {
      badge: "Revisá la propuesta",
      footer: "Si las clases están bien, respondé en el chat.",
    }
  }
  return {
    badge: "Faltan datos",
    footer: "Respondé en el chat el dato que falta.",
  }
}

function downloadRequirementJson(requirement: Requirement, version: number) {
  const blob = new Blob([`${JSON.stringify(requirement, null, 2)}\n`], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `requerimiento-motor-v${version}.json`
  link.click()
  URL.revokeObjectURL(url)
}

type RequirementPanelProps = {
  requirement: Requirement | null
  version: number
  confirmed: boolean
  onToggleConfirmed: () => void
  onAdjust: () => void
}

export function RequirementPanel({
  requirement,
  version,
  confirmed,
  onToggleConfirmed,
  onAdjust,
}: RequirementPanelProps) {
  if (!requirement) {
    return (
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t bg-background lg:border-t-0">
        <div className="shrink-0 border-b px-6 py-4">
          <h2 className="text-sm font-semibold">Requerimiento de datos</h2>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground">
            Escribí en el chat qué hay que decidir. La propuesta aparece acá.
          </p>
        </div>
      </aside>
    )
  }

  const ready = requirement.completitud === "suficiente_para_confirmar"
  const status = panelStatus(requirement, confirmed)

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t bg-background lg:border-t-0">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold">Requerimiento de datos</h2>
          <p className="text-xs text-muted-foreground">Versión {version}</p>
        </div>
        <p className="shrink-0 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
          {status.badge}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4 break-words">
        <section>
          <h3 className="text-sm font-medium">Necesidad</h3>
          <p className="mt-2 text-sm text-muted-foreground">{requirement.necesidad}</p>
          <p className="mt-3 text-sm">{requirement.decision_objetivo}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {requirement.alcance.periodo} · {requirement.alcance.unidades.join(", ")}
          </p>
        </section>

        <section>
          <h3 className="text-sm font-medium">Clases</h3>
          <p className="mt-2 text-sm">{requirement.esquema.clases.join(" · ")}</p>
        </section>

        {requirement.reglas_candidatas.length > 0 ? (
          <section>
            <h3 className="text-sm font-medium">Reglas candidatas</h3>
            <ul className="mt-2 space-y-2">
              {requirement.reglas_candidatas.map((rule) => (
                <li key={rule.id} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{rule.id}.</span> {rule.enunciado}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {requirement.fuentes_requeridas.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Fuentes requeridas</h3>
            {requirement.fuentes_requeridas.map((source) => (
              <article key={source.nombre} className="rounded-lg border px-3 py-3">
                <h4 className="text-sm font-medium">
                  {source.nombre} ({sourceLabels[source.tipo]})
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {source.columnas_minimas.join(", ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Justifica {source.justifica.join(", ")}
                </p>
              </article>
            ))}
          </section>
        ) : null}

        {requirement.preguntas_abiertas.length > 0 ? (
          <section>
            <h3 className="text-sm font-medium">Preguntas abiertas</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {requirement.preguntas_abiertas.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="shrink-0 border-t px-6 py-4">
        <div
          className={
            confirmed
              ? "rounded-xl border-2 border-solid border-foreground bg-foreground/5 p-4"
              : "rounded-xl border border-dashed border-foreground/40 p-4"
          }
        >
          <p className="text-sm">{status.footer}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onAdjust}>
              Ajustar
            </Button>
            {confirmed ? (
              <Button type="button" onClick={() => downloadRequirementJson(requirement, version)}>
                Descargar
              </Button>
            ) : (
              <Button type="button" disabled={!ready} onClick={onToggleConfirmed}>
                Confirmar
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
