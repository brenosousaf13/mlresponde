"use client"

import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircle2Icon,
  ImagePlusIcon,
  LockIcon,
  PackageXIcon,
  SendIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  draftReturnMessageAction,
  loadReturnReasons,
  reviewReturnPhotosAction,
  submitReturnReviewAction,
} from "@/app/(app)/recuperador/actions"
import { PhotoReviewPanel } from "@/components/recuperador/photo-review-panel"
import { resizePhoto } from "@/components/recuperador/resize-photo"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { photoFingerprint, photoReviewGate, type PhotoReview, type PhotoReviewState } from "@/lib/recovery/photo-review"
import {
  PHOTO_GUIDE,
  RETURN_MESSAGE_MAX,
  RETURN_PHOTOS_MAX,
  checklistFor,
  photosRequired,
  validateReview,
  type ReturnReason,
  type ReviewDecision,
} from "@/lib/recovery/review"

type Photo = { file: File; url: string }

/** Conferência das fotos pela IA para um conjunto de fotos (key = photoFingerprint). */
type PhotoCheck = { key: string; state: "running" | "done" | "unavailable"; review: PhotoReview | null; message: string | null }

/** Espera depois da última mudança antes de chamar a IA sozinha (relato e conferência das fotos). */
const AUTO_DRAFT_DELAY_MS = 900
const AUTO_PHOTO_DELAY_MS = 700

/**
 * Revisão da devolução, feita para o celular: "chegou certinho" (1 confirmação) ou "chegou com problema" (motivo, o que
 * viu, fotos, relato escrito pela IA e editável, 1 confirmação). No modo "appeal" é a contestação da revisão do armazém
 * do ML (só "com problema"). Só dono/administrador envia; nada sai sozinho.
 *
 * IA no fluxo:
 *  - relato: escrito SOZINHO quando o motivo e o que o dono viu estão escolhidos (e, nos motivos que exigem foto, depois da
 *    primeira foto); o botão "Escrever de novo com a IA" regenera. O texto é sempre editável e nunca sobrescreve o que o dono
 *    escreveu;
 *  - fotos: a IA com visão confere as fotos assim que o dono para de adicionar (PhotoReviewPanel). Se faltar foto, o botão de
 *    enviar só libera com o "enviar mesmo assim" do dono; se a IA não puder conferir, não trava nada.
 */
export function ReturnReviewFlow({
  returnRowId,
  canManage,
  mode,
  canOk,
  canFail,
  isCart,
  cartOrders,
  amount,
}: {
  returnRowId: string
  canManage: boolean
  mode: "arrival" | "appeal"
  canOk: boolean
  canFail: boolean
  isCart: boolean
  cartOrders: number
  amount: string | null
}) {
  const appeal = mode === "appeal"
  const router = useRouter()
  const [step, setStep] = useState<"choose" | "problem">("choose")
  const [confirm, setConfirm] = useState<ReviewDecision | null>(null)
  const [reasons, setReasons] = useState<ReturnReason[] | null>(null)
  const [reasonsError, setReasonsError] = useState<string | null>(null)
  const [reasonId, setReasonId] = useState<string>("")
  const [checks, setChecks] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [photos, setPhotos] = useState<Photo[]>([])
  const [message, setMessage] = useState("")
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [drafting, startDraft] = useTransition()
  const [pending, startSubmit] = useTransition()
  const [photoCheck, setPhotoCheck] = useState<PhotoCheck | null>(null)
  const [photoAck, setPhotoAck] = useState(false)
  const [draftKey, setDraftKey] = useState<string | null>(null)
  const [sent, setSent] = useState<ReviewDecision | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const photosRef = useRef<Photo[]>([])
  const latestPhotoKey = useRef("")
  const autoDrafted = useRef<string | null>(null)
  const messageEdited = useRef(false)

  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  // Libera as prévias das fotos ao sair da tela.
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), [])

  const reason = reasons?.find((item) => item.id === reasonId) ?? null
  const checklist = checklistFor(reasonId)
  const guide = PHOTO_GUIDE[reasonId] ?? []
  const needsPhotos = photosRequired(reasonId)
  const photoKey = reasonId && photos.length ? photoFingerprint(reasonId, photos.map((photo) => ({ name: photo.file.name, size: photo.file.size }))) : ""
  const photoNow = photoKey && photoCheck?.key === photoKey ? photoCheck : null
  const photoState: PhotoReviewState = photoNow ? photoNow.state : "idle"
  const gate = photoReviewGate({
    photoCount: photos.length,
    state: photoState,
    verdict: photoNow?.review?.verdict ?? null,
    acknowledged: photoAck,
  })
  const currentDraftKey = checks.slice().sort().join(",") + "|" + photos.length
  const invalid = useMemo(
    () =>
      reasons
        ? validateReview({
            decision: "fail",
            reasonId: reasonId || null,
            message,
            photos: photos.map((photo) => photo.file),
            reasons,
            isCart,
          })
        : "Carregando os motivos...",
    [reasons, reasonId, message, photos, isCart]
  )

  function openProblem() {
    setStep("problem")
    if (reasons) return
    loadReturnReasons(returnRowId)
      .then((result) => {
        if (result.ok) setReasons(result.reasons)
        else setReasonsError(result.message)
      })
      .catch(() => setReasonsError("Não foi possível buscar os motivos agora. Tente de novo."))
  }

  async function addPhotos(list: FileList | null) {
    if (!list?.length) return
    const room = RETURN_PHOTOS_MAX - photos.length
    if (room <= 0) {
      toast.error("Envie no máximo " + RETURN_PHOTOS_MAX + " fotos.")
      return
    }
    setPreparing(true)
    const added: Photo[] = []
    for (const [index, file] of [...list].slice(0, room).entries()) {
      try {
        const resized = await resizePhoto(file, photos.length + index)
        added.push({ file: resized, url: URL.createObjectURL(resized) })
      } catch {
        toast.error("Não deu para ler a foto " + file.name + ". Tire de novo ou envie em JPG/PNG.")
      }
    }
    setPhotos((current) => [...current, ...added])
    setPreparing(false)
    if (fileInput.current) fileInput.current.value = ""
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const photo = current[index]
      if (photo) URL.revokeObjectURL(photo.url)
      return current.filter((_, position) => position !== index)
    })
  }

  // Relato pela IA. auto = chamado sozinho pelo fluxo (erro sem alarde); o botão "Escrever de novo" regenera e avisa o erro.
  const draft = useCallback(
    (auto: boolean) => {
      if (!reason) return
      const failed = "Não deu para escrever o relato agora. Toque em “Escrever com a IA” para tentar de novo."
      startDraft(async () => {
        try {
          const result = await draftReturnMessageAction({
            returnRowId,
            reasonId: reason.id,
            reasonLabel: reason.label,
            checks,
            notes,
            photos: photos.length,
          })
          if (!result.ok) {
            if (auto) setAiNote(failed)
            else toast.error(result.message)
            return
          }
          messageEdited.current = false
          setMessage(result.message)
          setDraftKey(checks.slice().sort().join(",") + "|" + photos.length)
          setAiNote(result.fromAi ? null : "A IA não respondeu agora: montamos o relato só com o que você marcou. Revise antes de enviar.")
        } catch {
          if (auto) setAiNote(failed)
          else toast.error("Não foi possível escrever o relato agora.")
        }
      })
    },
    [reason, returnRowId, checks, notes, photos.length]
  )

  // Relato automático: quando o motivo e o que o dono viu estão escolhidos (com foto, nos motivos que exigem), uma vez por
  // motivo e só se o dono ainda não escreveu nada. Depois disso só o botão regenera (sem laço).
  const draftReady = Boolean(reason) && (checklist.length === 0 || checks.length > 0) && (!needsPhotos || photos.length > 0) && !preparing
  useEffect(() => {
    if (!draftReady || !reason || drafting || pending) return
    if (autoDrafted.current === reason.id || messageEdited.current || message.trim()) return
    const timer = setTimeout(() => {
      autoDrafted.current = reason.id
      draft(true)
    }, AUTO_DRAFT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draftReady, reason, drafting, pending, message, draft])

  // Conferência das fotos pela IA com visão (Server Action reviewReturnPhotosAction).
  const checkPhotos = useCallback(async () => {
    if (!reason || !photos.length) return
    const key = photoFingerprint(reason.id, photos.map((photo) => ({ name: photo.file.name, size: photo.file.size })))
    latestPhotoKey.current = key
    setPhotoAck(false)
    setPhotoCheck({ key, state: "running", review: null, message: null })
    const form = new FormData()
    form.set("returnRowId", returnRowId)
    form.set("reasonId", reason.id)
    form.set("reasonLabel", reason.label)
    for (const id of checks) form.append("checks", id)
    for (const photo of photos) form.append("photos", photo.file)
    try {
      const result = await reviewReturnPhotosAction(form)
      if (latestPhotoKey.current !== key) return
      setPhotoCheck(
        result.ok
          ? { key, state: "done", review: result.review, message: null }
          : { key, state: "unavailable", review: null, message: result.message }
      )
    } catch {
      if (latestPhotoKey.current !== key) return
      setPhotoCheck({
        key,
        state: "unavailable",
        review: null,
        message: "Não foi possível conferir as fotos agora. Você pode enviar mesmo assim.",
      })
    }
  }, [reason, photos, checks, returnRowId])

  // Confere sozinho quando o dono para de mexer nas fotos; só roda de novo se as fotos ou o motivo mudarem.
  useEffect(() => {
    if (!photoKey || preparing || pending || photoCheck?.key === photoKey) return
    const timer = setTimeout(() => void checkPhotos(), AUTO_PHOTO_DELAY_MS)
    return () => clearTimeout(timer)
  }, [photoKey, preparing, pending, photoCheck, checkPhotos])

  function submit(decision: ReviewDecision) {
    startSubmit(async () => {
      const form = new FormData()
      form.set("returnRowId", returnRowId)
      form.set("decision", decision)
      form.set("confirmed", "true")
      if (decision === "fail") {
        form.set("reasonId", reasonId)
        form.set("message", message)
        for (const photo of photos) form.append("photos", photo.file)
      }
      try {
        const result = await submitReturnReviewAction(form)
        if (result.ok) {
          toast.success(result.message)
          setConfirm(null)
          setSent(decision)
          router.refresh()
        } else {
          toast.error(result.message)
          setConfirm(null)
        }
      } catch {
        toast.error("Não foi possível enviar agora. Tente de novo.")
        setConfirm(null)
      }
    })
  }

  if (!canOk && !canFail) return null

  // Entre o envio e a página trocar o fluxo pelo acompanhamento: o estado já fica claro, sem mostrar o formulário de novo.
  if (sent) {
    return (
      <Card className="border-primary/40" data-slot="return-review-sent" data-decision={sent}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2Icon className="size-5 text-emerald-600" />
            {sent === "ok" ? "Pronto: o Mercado Livre foi avisado" : appeal ? "Contestação enviada ao Mercado Livre" : "Revisão enviada ao Mercado Livre"}
          </CardTitle>
          <CardDescription>
            {sent === "ok"
              ? "Você confirmou que a devolução chegou certinho. Não há mais nada a fazer."
              : "O ML analisa o caso e não informa o prazo. Acompanhe aqui: se ressarcir, avisamos no app e por e-mail; se negar, a situação muda nesta tela."}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-lg">
          {appeal ? "Contestar a revisão do armazém do Mercado Livre" : "A devolução chegou. Como veio o produto?"}
        </CardTitle>
        <CardDescription>
          {appeal
            ? "O armazém do ML marcou o produto como sem condição de venda e devolveu " +
              (amount ? amount + " " : "o dinheiro ") +
              "ao comprador. Se o produto saiu em perfeito estado (e voltou usado, danificado, incompleto, diferente ou sem a embalagem original), conteste por aqui. A decisão é do Mercado Livre."
            : "Confira o pacote e responda ao Mercado Livre por aqui. Se chegou com problema, as fotos e o relato pesam a seu favor."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!canManage ? (
          <Alert>
            <LockIcon />
            <AlertTitle>Só o dono ou um administrador envia a revisão</AlertTitle>
            <AlertDescription>Peça para quem administra a loja abrir esta devolução na maanu.</AlertDescription>
          </Alert>
        ) : null}

        {step === "choose" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {canOk ? (
              <Button
                variant="outline"
                className="h-auto flex-col items-start gap-1 bg-card px-4 py-4 text-left whitespace-normal"
                disabled={!canManage || pending}
                onClick={() => setConfirm("ok")}
              >
                <span className="flex items-center gap-2 text-base font-semibold">
                  <CheckCircle2Icon className="size-5 text-emerald-600" />
                  Chegou certinho
                </span>
                <span className="text-sm font-normal text-muted-foreground">O produto voltou como você enviou.</span>
              </Button>
            ) : null}
            {canFail ? (
              <Button
                variant="outline"
                className="h-auto flex-col items-start gap-1 bg-card px-4 py-4 text-left whitespace-normal"
                disabled={!canManage || pending}
                onClick={openProblem}
              >
                <span className="flex items-center gap-2 text-base font-semibold">
                  <PackageXIcon className="size-5 text-red-600" />
                  {appeal ? "Contestar a revisão" : "Chegou com problema"}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {appeal ? "Escolha o motivo, junte fotos e a IA escreve a contestação." : "Avariado, incompleto, diferente ou vazio."}
                </span>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => setStep("choose")} disabled={pending}>
              <ArrowLeftIcon data-icon="inline-start" />
              Voltar
            </Button>

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">1. Qual foi o problema?</h3>
              {reasonsError ? (
                <p className="text-sm text-destructive">{reasonsError}</p>
              ) : !reasons ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Buscando os motivos que o Mercado Livre aceita...
                </p>
              ) : (
                <RadioGroup
                  value={reasonId}
                  onValueChange={(value) => {
                    setReasonId(String(value))
                    setChecks([])
                    setPhotoAck(false)
                    // Relato que a IA escreveu para o motivo anterior (e o dono não mexeu) sai para a IA escrever o do novo.
                    if (!messageEdited.current) {
                      setMessage("")
                      setAiNote(null)
                      setDraftKey(null)
                    }
                  }}
                  className="gap-2"
                >
                  {reasons.map((item) => (
                    <Label
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border px-3 py-3 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
                    >
                      <RadioGroupItem value={item.id} />
                      <span>{item.label}</span>
                      {photosRequired(item.id) ? (
                        <Badge variant="outline" className="ml-auto shrink-0">
                          <CameraIcon data-icon="inline-start" />
                          Foto
                        </Badge>
                      ) : null}
                    </Label>
                  ))}
                </RadioGroup>
              )}
              {isCart ? (
                <p className="text-xs text-muted-foreground">
                  Esta devolução junta {cartOrders} pedidos de um carrinho: a maanu envia {appeal ? "a contestação" : "a revisão"} só
                  do pedido desta reclamação.
                </p>
              ) : null}
            </section>

            {reason ? (
              <>
                {checklist.length ? (
                  <section className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold">2. O que você viu?</h3>
                    <div className="flex flex-col gap-2">
                      {checklist.map((item) => (
                        <Label key={item.id} className="flex items-center gap-3 rounded-lg border px-3 py-3 font-normal">
                          <Checkbox
                            checked={checks.includes(item.id)}
                            onCheckedChange={(checked) =>
                              setChecks((current) => (checked ? [...current, item.id] : current.filter((id) => id !== item.id)))
                            }
                          />
                          {item.label}
                        </Label>
                      ))}
                    </div>
                  </section>
                ) : null}

                {guide.length || needsPhotos ? (
                  <section className="flex flex-col gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      3. Fotos
                      {needsPhotos ? <Badge variant="outline">obrigatória</Badge> : <Badge variant="outline">recomendado</Badge>}
                    </h3>
                    {guide.length ? (
                      <ul className="list-inside list-disc text-sm text-muted-foreground">
                        {guide.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    ) : null}
                    {appeal ? (
                      <p className="text-xs text-muted-foreground">
                        O produto está no Full? Valem fotos de quando ele saiu (embalagem, etiqueta, peça inteira) ou depois de
                        retirar o produto do Full.
                      </p>
                    ) : null}
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {photos.map((photo, index) => (
                        <div key={photo.url} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                          <img src={photo.url} alt={"Foto " + (index + 1)} className="size-full object-cover" />
                          <Button
                            variant="secondary"
                            size="icon"
                            className="absolute top-1 right-1 size-7"
                            onClick={() => removePhoto(index)}
                            disabled={pending}
                            aria-label={"Tirar a foto " + (index + 1)}
                          >
                            <XIcon />
                          </Button>
                        </div>
                      ))}
                      {photos.length < RETURN_PHOTOS_MAX ? (
                        <Button
                          variant="outline"
                          className="aspect-square h-auto flex-col gap-1 border-dashed bg-card text-xs"
                          onClick={() => fileInput.current?.click()}
                          disabled={preparing || pending}
                        >
                          {preparing ? <Spinner /> : <ImagePlusIcon className="size-5" />}
                          {preparing ? "Preparando" : "Adicionar"}
                        </Button>
                      ) : null}
                    </div>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(event) => void addPhotos(event.target.files)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Até {RETURN_PHOTOS_MAX} fotos. A maanu reduz as fotos antes de enviar (fica mais rápido no 4G).
                    </p>
                    {photos.length > 0 ? (
                      <PhotoReviewPanel
                        state={photoState}
                        review={photoNow?.review ?? null}
                        message={photoNow?.message ?? null}
                        acknowledged={photoAck}
                        onAcknowledge={setPhotoAck}
                        onRetry={() => void checkPhotos()}
                        disabled={pending}
                      />
                    ) : null}
                  </section>
                ) : null}

                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold">{guide.length || needsPhotos ? "4" : checklist.length ? "3" : "2"}. Algo mais? (opcional)</h3>
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value.slice(0, 600))}
                    placeholder="Ex.: a tela veio trincada no canto direito; a caixa chegou aberta."
                    rows={2}
                  />
                </section>

                <section className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{appeal ? "Contestação para o Mercado Livre" : "Relato para o Mercado Livre"}</h3>
                    <Button variant="outline" size="sm" className="bg-card" onClick={() => draft(false)} disabled={drafting || pending}>
                      {drafting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                      {message ? "Escrever de novo com a IA" : "Escrever com a IA"}
                    </Button>
                  </div>
                  <Textarea
                    value={message}
                    onChange={(event) => {
                      messageEdited.current = true
                      setMessage(event.target.value.slice(0, RETURN_MESSAGE_MAX))
                    }}
                    placeholder={
                      drafting ? "A IA está escrevendo o relato..." : "A IA escreve o relato quando você marca o que viu. Ou escreva aqui o que você constatou."
                    }
                    rows={6}
                  />
                  {message.trim() && draftKey !== null && draftKey !== currentDraftKey && !drafting ? (
                    <p className="text-xs text-muted-foreground">
                      Você mudou o que marcou ou as fotos depois de o relato ser escrito. Toque em “Escrever de novo com a IA” para atualizar o texto.
                    </p>
                  ) : null}
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {aiNote ??
                        (needsPhotos && !photos.length && !message.trim()
                          ? "Este motivo pede foto: adicione a foto e a IA escreve o relato."
                          : "A IA usa só o que você marcou e escreveu. Confira e ajuste antes de enviar.")}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {message.length}/{RETURN_MESSAGE_MAX}
                    </span>
                  </div>
                </section>

                <Button
                  size="lg"
                  className="w-full sm:w-fit"
                  disabled={!canManage || pending || drafting || Boolean(invalid) || gate.blocked}
                  onClick={() => setConfirm("fail")}
                >
                  <SendIcon data-icon="inline-start" />
                  {appeal ? "Enviar a contestação ao Mercado Livre" : "Enviar a revisão ao Mercado Livre"}
                </Button>
                {gate.blocked && gate.reason ? (
                  <p className="text-sm text-muted-foreground">{gate.reason}</p>
                ) : invalid && message ? (
                  <p className="text-sm text-muted-foreground">{invalid}</p>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirm !== null} onOpenChange={(value) => (value || pending ? null : setConfirm(null))}>
        {confirm ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm === "ok"
                  ? "Confirmar que chegou certinho?"
                  : appeal
                    ? "Enviar a contestação ao Mercado Livre?"
                    : "Enviar a revisão ao Mercado Livre?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm === "ok"
                  ? "A maanu avisa o Mercado Livre que o produto voltou como você enviou. O dinheiro segue para o comprador." +
                    (isCart ? " Este pacote junta " + cartOrders + " pedidos: a confirmação vale para todos eles." : "") +
                    " Não dá para desfazer."
                  : "A maanu envia ao Mercado Livre o motivo, o relato" +
                    (photos.length ? " e " + (photos.length === 1 ? "a foto" : "as " + photos.length + " fotos") : "") +
                    ". A equipe do ML analisa e decide se você é ressarcido. Não dá para desfazer." +
                    (photoNow?.review && photoNow.review.verdict !== "ok"
                      ? " A IA avisou que " +
                        (photoNow.review.verdict === "unusable" ? "as fotos não servem de prova" : "faltam fotos") +
                        " e você escolheu enviar mesmo assim."
                      : "")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
              <AlertDialogAction disabled={pending} onClick={() => submit(confirm)}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {confirm === "ok" ? "Sim, chegou certinho" : appeal ? "Enviar contestação" : "Enviar revisão"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </Card>
  )
}
