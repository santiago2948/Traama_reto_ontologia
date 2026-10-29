"use client"

import { useEffect, useId, useRef } from "react"
import type { ChatMessage } from "@/model/interview"
import type { Requirement } from "@/model/requirement"
import { RequirementPanel } from "@/view/requirement-panel"
import { ThemeToggle } from "@/view/theme-toggle"
import { Button } from "@/view/ui/button"
import { Textarea } from "@/view/ui/textarea"

function formatAgentText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+(?=\d{1,2}[.)] )/g, "\n")
    .replace(
      /([^\n])\n(?=(?:Requerimiento|Necesidad|Decisión|Alcance|Clases|Reglas candidatas|Fuentes requeridas|Preguntas abiertas)\b)/gi,
      "$1\n\n",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type ChatShellProps = {
  messages: ChatMessage[]
  requirement: Requirement | null
  version: number
  confirmed: boolean
  draft: string
  canSend: boolean
  pending: boolean
  error: string | null
  onDraftChange: (value: string) => void
  onSend: () => void
  onToggleConfirmed: () => void
}

export function ChatShell({
  messages,
  requirement,
  version,
  confirmed,
  draft,
  canSend,
  pending,
  error,
  onDraftChange,
  onSend,
  onToggleConfirmed,
}: ChatShellProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fieldId = useId()

  const scrollKey = `${messages.length}:${messages.at(-1)?.id ?? ""}:${pending ? "1" : "0"}`

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [scrollKey])

  return (
    <div className="flex h-dvh w-full max-w-full flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Trama</h1>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Entrevista
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="grid min-h-0 w-full min-w-0 flex-1 grid-rows-[minmax(0,1.15fr)_minmax(0,0.85fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1 lg:divide-x">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-sidebar">
          <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {messages.length === 0 && !pending ? (
              <p className="text-sm text-muted-foreground">
                Contá la necesidad de la empresa. El agente delimita, propone el
                modelo y lista los datos mínimos que harían falta.
              </p>
            ) : null}
            {messages.map((message) => (
              <article key={message.id} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {message.role === "agent" ? "Agente" : "Vos"}
                </p>
                <div
                  className={
                    message.role === "agent"
                      ? "w-full rounded-md border bg-muted p-2 text-sm whitespace-pre-wrap"
                      : "w-full rounded-md border border-foreground/20 p-2 text-sm whitespace-pre-wrap"
                  }
                >
                  {message.role === "agent" ? formatAgentText(message.text) : message.text}
                </div>
              </article>
            ))}
            {pending ? (
              <article className="space-y-1" aria-live="polite" aria-label="El agente está escribiendo">
                <p className="text-xs font-medium text-muted-foreground">Agente</p>
                <div className="flex w-full items-center gap-1.5 rounded-md border bg-muted p-3">
                  <span className="trama-typing-dot size-1.5 rounded-full bg-foreground/70" />
                  <span className="trama-typing-dot size-1.5 rounded-full bg-foreground/70" />
                  <span className="trama-typing-dot size-1.5 rounded-full bg-foreground/70" />
                </div>
              </article>
            ) : null}
          </div>

          <form
            className="flex shrink-0 items-end gap-2 border-t px-6 py-4"
            onSubmit={(event) => {
              event.preventDefault()
              onSend()
            }}
          >
            <label htmlFor={fieldId} className="sr-only">
              Mensaje
            </label>
            <Textarea
              ref={fieldRef}
              id={fieldId}
              value={draft}
              placeholder={
                messages.length === 0
                  ? "Escribí la necesidad de la empresa"
                  : "Escribí un ajuste o la respuesta"
              }
              className="max-h-40 min-h-16 flex-1 rounded-lg"
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  onSend()
                }
              }}
            />
            <Button type="submit" size="lg" disabled={!canSend}>
              {pending ? "Enviando" : "Enviar"}
            </Button>
          </form>
          {error ? (
            <p className="border-t border-dashed px-6 py-3 text-sm">{error}</p>
          ) : null}
        </section>

        <RequirementPanel
          requirement={requirement}
          version={version}
          confirmed={confirmed}
          onToggleConfirmed={onToggleConfirmed}
          onAdjust={() => {
            if (confirmed) onToggleConfirmed()
            fieldRef.current?.focus()
          }}
        />
      </div>
    </div>
  )
}
