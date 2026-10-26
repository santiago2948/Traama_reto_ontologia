"use client"

import { useState } from "react"
import {
  appendUserMessage,
  applyAgentTurn,
  createInterview,
  isSendable,
  toggleConfirmation,
} from "@/model/interview"
import type { Requirement } from "@/model/requirement"

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
      }
      if (!response.ok || !payload.message) {
        setError(payload.error ?? "No se pudo consultar al modelo. Tu mensaje sigue en el hilo.")
        return
      }
      setInterview((current) => applyAgentTurn(current, payload.message ?? "", payload.requirement ?? null))
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
