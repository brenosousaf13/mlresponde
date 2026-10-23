"use client"

import { CheckIcon, RefreshCwIcon, ScanEyeIcon, TriangleAlertIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import type { PhotoReview, PhotoReviewState, PhotoSupport } from "@/lib/recovery/photo-review"
import { PHOTO_VERDICT_BOX } from "@/lib/recovery/presentation"
import { cn } from "@/lib/utils"

const SUPPORT_TEXT: Record<PhotoSupport, string> = {
  yes: "As fotos confirmam o que você marcou.",
  partial: "As fotos confirmam só parte do que você marcou.",
  no: "As fotos não mostram o que você marcou.",
  unclear: "Só pelas fotos não dá para concluir.",
}

const VERDICT_TITLE = {
  ok: "As fotos parecem completas",
  needs_more: "Faltam fotos para sustentar o relato",
  unusable: "As fotos não servem de prova",
} as const

/**
 * "Ver as fotos": resultado da conferência das fotos pela IA com visão, mostrado ANTES de liberar o envio. Contrato:
 * state (idle | running | done | unavailable), review (PhotoReview, lib/recovery/photo-review.ts), message (quando
 * indisponível) e a confirmação "enviar mesmo assim" (acknowledged). A liberação do botão de enviar é de photoReviewGate.
 */
export function PhotoReviewPanel({
  state,
  review,
  message,
  acknowledged,
  onAcknowledge,
  onRetry,
  disabled,
}: {
  state: PhotoReviewState
  review: PhotoReview | null
  message: string | null
  acknowledged: boolean
  onAcknowledge: (value: boolean) => void
  onRetry: () => void
  disabled?: boolean
}) {
  if (state === "idle") {
    return (
      <p data-slot="photo-review" data-state="idle" className="flex items-center gap-2 text-xs text-muted-foreground">
        <ScanEyeIcon className="size-4" /> A IA vai conferir as fotos assim que você terminar de adicionar.
      </p>
    )
  }
  if (state === "running") {
    return (
      <p data-slot="photo-review" data-state="running" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> A IA está conferindo as fotos...
      </p>
    )
  }
  if (state === "unavailable" || !review) {
    return (
      <div data-slot="photo-review" data-state="unavailable" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">{message ?? "A IA não conseguiu conferir as fotos agora. Você pode enviar mesmo assim."}</span>
        <Button variant="outline" size="sm" className="bg-card" onClick={onRetry} disabled={disabled}>
          <RefreshCwIcon data-icon="inline-start" />
          Tentar de novo
        </Button>
      </div>
    )
  }
  const guideItems = new Set(review.guide.map((entry) => entry.item))
  const extras = review.missing.filter((item) => !guideItems.has(item))
  return (
    <div
      data-slot="photo-review"
      data-state="done"
      data-verdict={review.verdict}
      className={cn("flex flex-col gap-3 rounded-lg border px-3 py-3 text-sm", PHOTO_VERDICT_BOX[review.verdict])}
    >
      <div className="flex items-start gap-2">
        {review.verdict === "ok" ? <CheckIcon className="mt-0.5 size-4 text-emerald-600" /> : <TriangleAlertIcon className="mt-0.5 size-4 text-amber-600" />}
        <div className="flex flex-col gap-0.5">
          <p className="font-medium">{VERDICT_TITLE[review.verdict]}</p>
          <p className="text-muted-foreground">{review.summary}</p>
        </div>
      </div>

      {review.guide.length ? (
        <ul className="flex flex-col gap-1">
          {review.guide.map((entry) => (
            <li key={entry.item} className="flex items-start gap-2">
              {entry.covered ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XIcon className="mt-0.5 size-4 shrink-0 text-red-600" />}
              <span className={entry.covered ? undefined : "font-medium"}>{entry.item}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {extras.length ? (
        <ul className="flex list-inside list-disc flex-col gap-1">
          {extras.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <p className="text-muted-foreground">{SUPPORT_TEXT[review.supportsReason]}</p>

      {review.photos.length ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {review.photos.map((photo) => (
            <li key={photo.index}>
              <span className="font-medium text-foreground">Foto {photo.index}:</span> {photo.shows || "sem descrição"}
              {photo.issue ? " · " + photo.issue : ""}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {review.verdict !== "ok" ? (
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={acknowledged} onCheckedChange={(checked) => onAcknowledge(Boolean(checked))} disabled={disabled} />
            Entendi o aviso e quero enviar mesmo assim
          </Label>
        ) : (
          <span />
        )}
        <Button variant="outline" size="sm" className="bg-card" onClick={onRetry} disabled={disabled}>
          <RefreshCwIcon data-icon="inline-start" />
          Conferir de novo
        </Button>
      </div>
    </div>
  )
}