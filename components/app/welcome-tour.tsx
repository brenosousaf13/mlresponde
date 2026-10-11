"use client"

import { BotIcon, LayersIcon, ShieldCheckIcon, ZapIcon, type LucideIcon } from "lucide-react"
import { useState, useTransition } from "react"

import { completeTour } from "@/app/(app)/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

const STEPS: { icon: LucideIcon; title: string; description: string; tone: string }[] = [
  {
    icon: ZapIcon,
    title: "Responda rápido, venda mais",
    description:
      "No Mercado Livre, quem responde primeiro leva a venda. A IA responde seus compradores em segundos, a qualquer hora.",
    tone: "bg-brand-yellow/20 text-brand-navy",
  },
  {
    icon: BotIcon,
    title: "Uma IA que conhece seus anúncios",
    description:
      "Ela lê título, descrição, ficha técnica, variações e estoque do anúncio, além das regras da sua loja, antes de responder.",
    tone: "bg-primary/10 text-primary",
  },
  {
    icon: ShieldCheckIcon,
    title: "Você no controle",
    description:
      "Se a IA não tiver certeza, ela não inventa: deixa a pergunta para você responder. Você também pode pausar quando quiser.",
    tone: "bg-emerald-500/10 text-emerald-600",
  },
  {
    icon: LayersIcon,
    title: "Suas contas em um só lugar",
    description:
      "Conecte suas contas do Mercado Livre e acompanhe tudo num único painel, sem ficar trocando de login.",
    tone: "bg-violet-500/10 text-violet-600",
  },
]

export function WelcomeTour() {
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState(0)
  const [pending, startTransition] = useTransition()
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  function finish() {
    startTransition(async () => {
      await completeTour()
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish()
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <div className={cn("mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl", current.tone)}>
            <current.icon className="size-7" />
          </div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Passo {step + 1} de {STEPS.length}
          </p>
          <DialogTitle className="text-xl">{current.title}</DialogTitle>
          <DialogDescription className="text-balance">{current.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 rounded-full bg-muted-foreground/30 transition-all",
                  index === step ? "w-6 bg-primary" : "w-1.5"
                )}
              />
            ))}
          </div>
          {isLast ? (
            <Button onClick={finish} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Começar
            </Button>
          ) : (
            <Button onClick={() => setStep(step + 1)}>Próximo</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
