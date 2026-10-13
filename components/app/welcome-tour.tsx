"use client"

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"
import Image from "next/image"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { completeTour } from "@/app/(app)/actions"
import { LogoWordmark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/** Imagens em public/tour (geradas por docs/brand/scripts/onboarding.mjs a partir de docs/brand/onboarding). */
const STEPS = [
  {
    label: "Rapidez",
    image: "/tour/passo-1.png",
    title: "Responda rápido, venda mais",
    description:
      "No Mercado Livre, quem responde primeiro leva a venda. A IA responde seus compradores em segundos, a qualquer hora.",
  },
  {
    label: "IA",
    image: "/tour/passo-2.png",
    title: "Uma IA que conhece seus anúncios",
    description:
      "Antes de responder, ela lê título, descrição, ficha técnica, variações e estoque do anúncio, além das regras da sua loja.",
  },
  {
    label: "Controle",
    image: "/tour/passo-3.png",
    title: "Você sempre no controle",
    description:
      "Na dúvida, a IA não inventa: deixa a pergunta para você responder. E dá para pausar as respostas quando quiser.",
  },
  {
    label: "Contas",
    image: "/tour/passo-4.png",
    title: "Suas contas num só lugar",
    description:
      "Conecte suas contas do Mercado Livre e acompanhe perguntas e resultados num único painel, sem trocar de login.",
  },
] as const

/** Apresentação da plataforma no primeiro acesso. Concluir, pular ou fechar (Esc) grava o tour como visto. */
export function WelcomeTour() {
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState(0)
  const [pending, startTransition] = useTransition()
  // Foco inicial no próprio diálogo (sem anel de foco num botão); Tab e as setas ← → navegam.
  const popupRef = useRef<HTMLDivElement>(null)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  function goTo(next: number) {
    setStep(Math.min(STEPS.length - 1, Math.max(0, next)))
  }

  function finish() {
    if (pending) return
    startTransition(async () => {
      try {
        await completeTour()
      } catch {
        toast.error("Não conseguimos salvar agora. A apresentação pode aparecer de novo no próximo acesso.")
      }
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) finish()
      }}
    >
      <DialogContent
        ref={popupRef}
        initialFocus={popupRef}
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-3xl"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") goTo(step + 1)
          if (event.key === "ArrowLeft") goTo(step - 1)
        }}
      >
        <div className="grid sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* Palco da ilustração: grade de pontos suave com um brilho branco atrás do desenho. */}
          <div className="relative flex h-56 items-center justify-center overflow-hidden border-b bg-canvas sm:h-auto sm:min-h-[27rem] sm:border-r sm:border-b-0">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(color-mix(in_oklch,var(--brand-slate)_45%,transparent)_1.2px,transparent_1.2px)] bg-size-[18px_18px] mask-[radial-gradient(ellipse_at_center,black_25%,transparent_78%)]"
            />
            <div aria-hidden className="absolute size-44 rounded-full bg-background blur-2xl sm:size-56" />
            <LogoWordmark label="" className="absolute top-5 left-5 h-4 opacity-80" />
            {STEPS.map((item, index) => (
              <Image
                key={item.image}
                src={item.image}
                alt=""
                width={640}
                height={640}
                sizes="(min-width: 640px) 240px, 168px"
                loading="eager"
                aria-hidden
                className={cn(
                  "absolute size-42 object-contain drop-shadow-[0_18px_24px_rgb(15_23_42/0.10)] transition-[opacity,translate,scale] duration-500 ease-out motion-reduce:transition-none sm:size-60",
                  index === step && "translate-x-0 scale-100 opacity-100",
                  index < step && "-translate-x-8 scale-90 opacity-0",
                  index > step && "translate-x-8 scale-90 opacity-0"
                )}
              />
            ))}
          </div>

          <div className="flex flex-col gap-8 p-6 sm:p-8">
            <nav aria-label="Etapas da apresentação">
              <ol className="grid grid-cols-4 gap-2">
                {STEPS.map((item, index) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => goTo(index)}
                      aria-current={index === step ? "step" : undefined}
                      aria-label={`Etapa ${index + 1} de ${STEPS.length}: ${item.label}`}
                      className="group/step flex w-full flex-col gap-2 rounded-sm py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="block h-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn(
                            "block h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none",
                            index <= step ? "w-full" : "w-0"
                          )}
                        />
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium transition-colors",
                          index === step ? "text-foreground" : "text-muted-foreground group-hover/step:text-foreground"
                        )}
                      >
                        {item.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            <div
              key={step}
              className="flex flex-1 flex-col justify-center gap-3 duration-500 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
            >
              <DialogTitle className="text-2xl leading-tight font-semibold tracking-tight text-balance">
                {current.title}
              </DialogTitle>
              <DialogDescription className="leading-relaxed text-pretty sm:text-base">
                {current.description}
              </DialogDescription>
            </div>

            <div className="flex items-center justify-between gap-3">
              {isLast ? (
                <span />
              ) : (
                <Button variant="ghost" onClick={finish} disabled={pending} className="-ml-2.5 text-muted-foreground">
                  Pular
                </Button>
              )}
              <div className="flex items-center gap-2">
                {step > 0 ? (
                  <Button variant="outline" size="icon-lg" onClick={() => goTo(step - 1)} aria-label="Voltar">
                    <ArrowLeftIcon />
                  </Button>
                ) : null}
                {isLast ? (
                  <Button size="lg" onClick={finish} disabled={pending} className="px-4">
                    {pending ? <Spinner data-icon="inline-start" /> : null}
                    Começar a usar
                  </Button>
                ) : (
                  <Button size="lg" onClick={() => goTo(step + 1)} className="px-4">
                    Próximo
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
