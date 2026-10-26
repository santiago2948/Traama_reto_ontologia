"use client"

import { Button } from "@/view/ui/button"

const storageKey = "trama-theme"

export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark")
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem(storageKey, next ? "dark" : "light")
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={toggle} aria-label="Cambiar tema">
      <span className="dark:hidden">Oscuro</span>
      <span className="hidden dark:inline">Claro</span>
    </Button>
  )
}
