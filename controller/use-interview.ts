"use client"

import { useState } from "react"
import {
  appendUserMessage,
  applyAgentTurn,
  createInterview,
  isSendable,
  toggleConfirmation,
  type InterviewPhase,
} from "@/model/interview"
import type { Requirement } from "@/model/requirement"

const phases: InterviewPhase[] = ["delimitar", "proponer", "pedir", "confirmar"]

function isPhase(value: unknown): value is InterviewPhase {
  return typeof value === "string" && phases.includes(value as InterviewPhase)
}

export function useInterviewController() {
  const [interview, setInterview] = useState(createInterview)
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!isSendable(draft) || pending) return
    const text = draft
    const next = appendUserMessage(interview, text)
    setInterview(next)
    setDraft("")
    setError(null)
    setPending(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: next.phase,
          messages: next.messages.map((message) => ({
            role: message.role,
            text: message.text,
          })),
          requirement: next.requirement,
        }),
      })
      const payload = (await response.json()) as {
        message?: string
        error?: string
        requirement?: Requirement | null
        phase?: InterviewPhase
      }

      const reply = payload.message?.trim() ?? ""
      if (reply || payload.requirement || isPhase(payload.phase)) {
        setInterview((current) => {
          const turned =
            reply || payload.requirement
              ? applyAgentTurn(current, reply, payload.requirement ?? null)
              : current
          return isPhase(payload.phase) ? { ...turned, phase: payload.phase } : turned
        })
      }

      if (!response.ok) {
        setError(payload.error ?? "No se pudo completar el turno. Tu mensaje sigue en el hilo.")
        return
      }

      if (!reply && !payload.requirement) {
        setError(payload.error ?? "Todavía estoy armando esta parte. Probá de nuevo.")
      }
    } catch {
      setError("No se pudo consultar al modelo. Tu mensaje sigue en el hilo.")
    } finally {
      setPending(false)
    }
  }

  function toggleConfirmed() {
    setInterview((current) => toggleConfirmation(current))
  }

  return {
    messages: interview.messages,
    requirement: interview.requirement,
    version: interview.version,
    confirmed: interview.confirmed,
    draft,
    setDraft,
    send,
    canSend: isSendable(draft) && !pending,
    pending,
    error,
    toggleConfirmed,
  }
}
