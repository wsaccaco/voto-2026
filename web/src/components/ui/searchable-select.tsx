import { useEffect, useMemo, useRef, useState } from "react"
import { SearchIcon } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface SearchableSelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  value?: string
  onValueChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
}

// Búsqueda insensible a mayúsculas y a tildes
function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder = "Buscar…",
  disabled,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // El Content enfoca el item seleccionado al abrir; dar el foco al campo de
  // búsqueda en el siguiente frame
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  // Al cerrar el listado se reinicia la búsqueda
  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return options
    return options.filter((o) => normalize(o.label).includes(q))
  }, [options, query])

  const selectFirst = () => {
    const first = filtered[0]
    if (!first) return
    onValueChange(first.value)
    setOpen(false)
  }

  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={(v) => {
        onValueChange(v)
        setOpen(false)
      }}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <div
          className="sticky top-0 z-10 border-b border-border bg-popover p-1 pb-1.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full rounded-md border border-input bg-transparent pr-3 pl-7 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              onKeyDown={(e) => {
                // Escape debe cerrar el listado; el resto de teclas no debe
                // activar la navegación por teclado del Select
                if (e.key === "Escape") return
                e.stopPropagation()
                if (e.key === "Enter") {
                  e.preventDefault()
                  selectFirst()
                }
              }}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Sin resultados para “{query.trim()}”
          </p>
        ) : (
          filtered.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
