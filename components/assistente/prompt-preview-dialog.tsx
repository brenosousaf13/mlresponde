"use client"

import { ScanTextIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

export function PromptPreviewDialog({ knowledge }: { knowledge: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ScanTextIcon data-icon="inline-start" />
        Ver como a IA lê
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conhecimento da loja</DialogTitle>
          <DialogDescription>
            É este texto que a IA recebe, junto com as regras de segurança (não inventar, não passar contato, não
            negociar), o anúncio da pergunta e as respostas ensinadas.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] rounded-lg border bg-muted/40">
          <pre className="p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {knowledge || "Nada informado ainda."}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
