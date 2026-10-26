"use client"

import { useInterviewController } from "@/controller/use-interview"
import { ChatShell } from "@/view/chat-shell"

export function InterviewScreen() {
  const interview = useInterviewController()

  return (
    <ChatShell
      messages={interview.messages}
      requirement={interview.requirement}
      confirmed={interview.confirmed}
      draft={interview.draft}
      canSend={interview.canSend}
      pending={interview.pending}
      error={interview.error}
      onDraftChange={interview.setDraft}
      onSend={interview.send}
      onToggleConfirmed={interview.toggleConfirmed}
    />
  )
}
