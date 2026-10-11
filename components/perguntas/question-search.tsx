import { SearchIcon, XIcon } from "lucide-react"
import Form from "next/form"
import Link from "next/link"

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

export function QuestionSearch({ value, hidden, clearHref }: { value: string; hidden: Record<string, string>; clearHref: string }) {
  return (
    <Form action="/perguntas" className="flex-1">
      {Object.entries(hidden).map(([name, hiddenValue]) => (
        <input key={name} type="hidden" name={name} value={hiddenValue} />
      ))}
      <InputGroup className="bg-card">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput name="busca" defaultValue={value} placeholder="Buscar pergunta ou anúncio" aria-label="Buscar perguntas" />
        {value ? (
          <InputGroupAddon align="inline-end">
            <Link href={clearHref} aria-label="Limpar busca" className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground">
              <XIcon className="size-4" />
            </Link>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </Form>
  )
}
