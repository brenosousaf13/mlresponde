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
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { draftReturnMessageAction, loadReturnReasons, submitReturnReviewAction } from "@/app/(app)/recuperador/actions"
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

/**
 * Revisão da devolução, feita para o celular: "chegou certinho" (1 confirmação) ou "chegou com problema" (motivo, o que
 * viu, fotos, relato escrito pela IA e editável, 1 confirmação). No modo "appeal" é a contestação da revisão do armazém
 * do ML (só "com problema"). Só dono/administrador envia; nada sai sozinho.
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
  const fileInput = useRef<HTMLInputElement>(null)
  const photosRef = useRef<Photo[]>([])

  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  // Libera as prévias das fotos ao sair da tela.
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), [])

  const reason = reasons?.find((item) => item.id === reasonId) ?? null
  const checklist = checklistFor(reasonId)
  const guide = PHOTO_GUIDE[reasonId] ?? []
  const needsPhotos = photosRequired(reasonId)
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

  function draft() {
    if (!reason) return
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
          toast.error(result.message)
          return
        }
        setMessage(result.message)
        setAiNote(result.fromAi ? null : "A IA não respondeu agora: montamos o relato só com o que você marcou. Revise antes de enviar.")
      } catch {
        toast.error("Não foi possível escrever o relato agora.")
      }
    })
  }

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
                    <Button variant="outline" size="sm" className="bg-card" onClick={draft} disabled={drafting || pending}>
                      {drafting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                      {message ? "Escrever de novo com a IA" : "Escrever com a IA"}
                    </Button>
                  </div>
                  <Textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value.slice(0, RETURN_MESSAGE_MAX))}
                    placeholder="Toque em “Escrever com a IA” ou escreva aqui o que você constatou."
                    rows={6}
                  />
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>{aiNote ?? "A IA usa só o que você marcou e escreveu. Confira e ajuste antes de enviar."}</span>
                    <span className="shrink-0 tabular-nums">
                      {message.length}/{RETURN_MESSAGE_MAX}
                    </span>
                  </div>
                </section>

                <Button size="lg" className="w-full sm:w-fit" disabled={!canManage || pending || Boolean(invalid)} onClick={() => setConfirm("fail")}>
                  <SendIcon data-icon="inline-start" />
                  {appeal ? "Enviar a contestação ao Mercado Livre" : "Enviar a revisão ao Mercado Livre"}
                </Button>
                {invalid && message ? <p className="text-sm text-muted-foreground">{invalid}</p> : null}
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
                    ". A equipe do ML analisa e decide se você é ressarcido. Não dá para desfazer."}
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
