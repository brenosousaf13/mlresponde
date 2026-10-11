"use client"

import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CopyIcon, SparklesIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { copySetupFrom, saveSetupStep } from "@/app/(app)/assistente/actions"
import { EMPTY_ANSWER, ProfileQuestionInput } from "@/components/assistente/question-input"
import { AffixesFields, ModeFields, ThresholdOptions, ToneOptions, type StyleValues } from "@/components/assistente/style-fields"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { type ProfileAnswer, type StoreProfile } from "@/lib/assistant/profile"
import { SETUP_SECTIONS, SETUP_STEPS, sectionLabel } from "@/lib/assistant/questions"
import { cn } from "@/lib/utils"

export function SetupWizard({
  accountId,
  initialProfile,
  initialStyle,
  initialStep,
  defaultStoreName,
  copySources,
  isRedo,
}: {
  accountId: string
  initialProfile: StoreProfile
  initialStyle: StyleValues
  initialStep: number
  defaultStoreName: string
  copySources: { id: string; name: string }[]
  isRedo: boolean
}) {
  const router = useRouter()
  const [index, setIndex] = useState(Math.min(Math.max(initialStep, 0), SETUP_STEPS.length - 1))
  const [answers, setAnswers] = useState<StoreProfile>(() =>
    initialProfile.store_name ? initialProfile : { ...initialProfile, store_name: { options: [], text: defaultStoreName } }
  )
  const [style, setStyle] = useState<StyleValues>(initialStyle)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const step = SETUP_STEPS[index]
  const isLast = index === SETUP_STEPS.length - 1
  const currentSection = SETUP_SECTIONS.findIndex((section) => section.id === step.section)
  const answer: ProfileAnswer = step.type === "question" ? (answers[step.id] ?? EMPTY_ANSWER) : EMPTY_ANSWER
  const canSkip = step.type === "question" && !step.required

  function go(target: number, { save = true, complete = false }: { save?: boolean; complete?: boolean } = {}) {
    setError(null)
    startTransition(async () => {
      const result = await saveSetupStep({
        accountId,
        stepId: save && step.type === "question" ? step.id : "",
        nextStep: complete ? 0 : target,
        complete,
        ...(save && step.type === "question" ? { options: answer.options, text: answer.text } : {}),
        ...(save && step.type === "style" ? { style } : {}),
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (complete) {
        toast.success("Pronto! O assistente já conhece a sua loja.")
        router.push(`/assistente?conta=${accountId}&concluido=1`)
        return
      }
      setIndex(target)
    })
  }

  const next = () => (isLast ? go(index, { complete: true }) : go(index + 1))

  function copyFrom(sourceId: string) {
    startTransition(async () => {
      const result = await copySetupFrom(accountId, sourceId)
      if (result.ok) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <Card className="mx-auto w-full max-w-5xl gap-0 overflow-hidden p-0">
      <div className="grid md:grid-cols-[240px_1fr]">
        <aside className="hidden flex-col gap-6 border-r bg-muted/40 p-6 md:flex">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SparklesIcon className="size-4" />
            </span>
            Configuração da IA
          </div>
          <ol className="flex flex-col gap-1">
            {SETUP_SECTIONS.map((section, sectionIndex) => {
              const first = SETUP_STEPS.findIndex((item) => item.section === section.id)
              const state = sectionIndex < currentSection ? "done" : sectionIndex === currentSection ? "current" : "next"
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => (sectionIndex === currentSection ? undefined : go(first))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-background",
                      state === "current" && "bg-background font-medium shadow-xs ring-1 ring-foreground/10",
                      state === "next" && "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                        state === "done" && "border-emerald-600 bg-emerald-600 text-white",
                        state === "current" && "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      {state === "done" ? <CheckIcon className="size-3.5" /> : sectionIndex + 1}
                    </span>
                    {section.label}
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="mt-auto text-xs text-muted-foreground">
            Tudo é salvo a cada passo. Você pode sair e continuar depois.
          </p>
        </aside>

        <div className="flex min-h-[560px] flex-col gap-6 p-5 sm:p-8">
          <div className="flex flex-col gap-1 text-center md:text-left">
            <h2 className="text-lg font-semibold">{isRedo ? "Revise as respostas" : "Responda algumas perguntas"}</h2>
            <p className="text-sm text-muted-foreground">
              A IA usa o que você responder aqui para atender seus compradores como alguém da sua equipe. Leva uns 5
              minutos e dá para editar tudo depois.
            </p>
          </div>

          {copySources.length > 0 && index === 0 && !isRedo ? (
            <Alert>
              <CopyIcon />
              <AlertTitle>Já configurou outra conta?</AlertTitle>
              <AlertDescription>Use as respostas de {copySources[0].name} como ponto de partida.</AlertDescription>
              <AlertAction>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => copyFrom(copySources[0].id)}>
                  Copiar respostas
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{sectionLabel(step.section)}</span>
              <span className="text-muted-foreground tabular-nums">
                {index + 1} / {SETUP_STEPS.length}
              </span>
            </div>
            <Progress value={((index + 1) / SETUP_STEPS.length) * 100} aria-label="Progresso da configuração" />
          </div>

          <div key={step.id} className="flex animate-in flex-col gap-5 duration-300 fade-in slide-in-from-right-4">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{step.title}</h3>
              <p className="text-sm text-muted-foreground">
                {step.type === "style" && style.mode === "always" && step.alwaysDescription ? step.alwaysDescription : step.description}
              </p>
            </div>

            {step.type === "question" ? (
              <ProfileQuestionInput
                question={step}
                value={answer}
                onChange={(value) => setAnswers((current) => ({ ...current, [step.id]: value }))}
                onSubmit={next}
                autoFocus
                disabled={pending}
              />
            ) : step.id === "tone" ? (
              <ToneOptions value={style.tone} onChange={(tone) => setStyle({ ...style, tone })} disabled={pending} />
            ) : step.id === "affixes" ? (
              <AffixesFields
                greeting={style.greeting}
                signature={style.signature}
                onChange={(affixes) => setStyle({ ...style, ...affixes })}
                disabled={pending}
              />
            ) : step.id === "mode" ? (
              <ModeFields
                mode={style.mode}
                fallback={style.fallback}
                greeting={style.greeting}
                signature={style.signature}
                onChange={(mode) => setStyle({ ...style, ...mode })}
                disabled={pending}
              />
            ) : (
              <ThresholdOptions
                value={style.threshold}
                onChange={(threshold) => setStyle({ ...style, threshold })}
                disabled={pending}
                mode={style.mode}
              />
            )}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 border-t pt-5">
            <Button variant="outline" onClick={() => go(index - 1)} disabled={pending || index === 0}>
              <ArrowLeftIcon data-icon="inline-start" />
              Anterior
            </Button>
            <div className="flex items-center gap-2">
              {canSkip && !isLast ? (
                <Button variant="ghost" onClick={() => go(index + 1, { save: false })} disabled={pending}>
                  Pular
                </Button>
              ) : null}
              <Button onClick={next} disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {isLast ? "Concluir configuração" : "Próximo"}
                {!pending && !isLast ? <ArrowRightIcon data-icon="inline-end" /> : null}
                {!pending && isLast ? <CheckIcon data-icon="inline-end" /> : null}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
