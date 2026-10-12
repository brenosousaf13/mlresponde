"use client"

import { SearchIcon, XIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ORG_SORTS, PLAN_FILTERS, STATUS_FILTERS } from "@/lib/admin/labels"
import { cn } from "@/lib/utils"

const ALL = "todos"

/** Busca, filtros e ordem da lista de clientes (estado na URL; trocar qualquer um volta para a página 1). */
export function OrgFilters({ search, status, plan, sort }: { search: string; status: string; plan: string; sort: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState(search)

  function update(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== ALL) params.set(key, value)
      else params.delete(key)
    }
    params.delete("pagina")
    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  const statusItems = [{ value: ALL, label: "Todas as situações" }, ...STATUS_FILTERS]
  const planItems = [{ value: ALL, label: "Todos os planos" }, ...PLAN_FILTERS]
  const sortItems = Object.entries(ORG_SORTS).map(([value, label]) => ({ value, label }))

  return (
    <div className={cn("flex flex-col gap-2 lg:flex-row lg:items-center", pending && "opacity-70")}>
      <form
        role="search"
        className="flex-1"
        onSubmit={(event) => {
          event.preventDefault()
          update({ busca: text.trim() })
        }}
      >
        <InputGroup className="bg-card">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Loja, nome, e-mail, CPF/CNPJ, WhatsApp ou conta do ML"
            aria-label="Buscar clientes"
            maxLength={100}
          />
          {text ? (
            <InputGroupAddon align="inline-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Limpar busca"
                onClick={() => {
                  setText("")
                  update({ busca: "" })
                }}
              >
                <XIcon />
              </Button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </form>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
        <Select items={statusItems} value={status || ALL} onValueChange={(value) => update({ situacao: String(value ?? "") })}>
          <SelectTrigger className="w-full bg-card lg:w-44" aria-label="Situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={planItems} value={plan || ALL} onValueChange={(value) => update({ plano: String(value ?? "") })}>
          <SelectTrigger className="w-full bg-card lg:w-40" aria-label="Plano">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {planItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={sortItems} value={sort} onValueChange={(value) => update({ ordem: value === "recent" ? "" : String(value ?? "") })}>
          <SelectTrigger className="w-full bg-card lg:w-52" aria-label="Ordem">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
