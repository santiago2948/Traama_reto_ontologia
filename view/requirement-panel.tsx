import { Button } from "@/view/ui/button"
import type { Requirement } from "@/model/requirement"

type RequirementPanelProps = {
  requirement: Requirement
  confirmed: boolean
  onToggleConfirmed: () => void
}

export function RequirementPanel({
  requirement,
  confirmed,
  onToggleConfirmed,
}: RequirementPanelProps) {
  const ready = requirement.completitud === "suficiente_para_confirmar"

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t bg-background lg:border-t-0">
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Requerimiento</h2>
          <p className="text-xs font-medium text-muted-foreground">
            Versión {requirement.version}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 break-words">
        <section
          className={
            confirmed
              ? "rounded-xl border-2 border-solid border-foreground bg-foreground/5 p-4 font-semibold ring-1 ring-foreground/10"
              : "rounded-xl border border-dashed border-foreground/40 bg-muted p-4 ring-1 ring-foreground/10"
          }
        >
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Estado
          </p>
          <p className="mt-2 text-sm">
            {confirmed
              ? "Confirmado"
              : ready
                ? "Suficiente para confirmar"
                : "Faltan datos"}
          </p>
          <p className="mt-2 text-xs font-normal text-muted-foreground">
            El borde sólido marca lo confirmado. El borde punteado, lo que
            todavía se puede ajustar.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 bg-background"
            onClick={onToggleConfirmed}
          >
            {confirmed ? "Volver a borrador" : "Confirmar"}
          </Button>
        </section>

        <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Necesidad
          </h3>
          <p className="mt-2 text-sm">{requirement.necesidad}</p>
          <h3 className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Decisión
          </h3>
          <p className="mt-2 text-sm">{requirement.decision}</p>
        </section>

        <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Alcance
          </h3>
          <dl className="mt-2 space-y-2 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Período
              </dt>
              <dd>{requirement.periodo}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Unidades
              </dt>
              <dd>{requirement.unidades.join(", ")}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Esquema
          </h3>
          <p className="mt-2 text-sm">{requirement.clases.join(" · ")}</p>
          <ul className="mt-3 space-y-2">
            {requirement.relaciones.map((relation) => (
              <li
                key={`${relation.sujeto}-${relation.predicado}-${relation.objeto}`}
                className="rounded-md border bg-muted p-2 text-sm break-words"
              >
                {relation.sujeto}{" "}
                <span className="font-medium">{relation.predicado}</span>{" "}
                {relation.objeto}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Reglas candidatas
          </h3>
          <ul className="mt-3 space-y-3">
            {requirement.reglas.map((rule) => (
              <li key={rule.id} className="text-sm">
                <p className="font-medium">{rule.id}</p>
                <p className="mt-1">{rule.enunciado}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Fuentes requeridas
          </h3>
          {requirement.fuentes.map((source) => (
            <article
              key={source.nombre}
              className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-sm font-medium">{source.nombre}</h4>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {source.tipo}
                </p>
              </div>
              <p className="mt-3 text-xs font-medium text-muted-foreground">
                Columnas mínimas
              </p>
              <p className="mt-1 text-sm break-words">{source.columnas.join(", ")}</p>
              <p className="mt-3 text-xs font-medium text-muted-foreground">
                Justifica
              </p>
              <p className="mt-1 text-sm break-words">{source.justifica.join(", ")}</p>
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-dashed border-foreground/40 bg-muted p-4">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Preguntas abiertas
          </h3>
          {requirement.preguntasAbiertas.length === 0 ? (
            <p className="mt-2 text-sm font-normal text-muted-foreground">
              Ninguna. El pedido ya se puede confirmar.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm font-medium">
              {requirement.preguntasAbiertas.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  )
}
