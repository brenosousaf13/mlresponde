"use client"

import { LockIcon, MapPinIcon } from "lucide-react"
import { useActionState, useRef, useState } from "react"

import { FormMessage, SubmitButton, fieldErrors, hasFieldError } from "@/components/forms/form-feedback"
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { lookupPostalCode } from "@/lib/billing/cep"
import {
  BRAZIL_STATES,
  DOCUMENT_LABELS,
  formatDocument,
  isValidDocument,
  maskDocument,
  maskPostalCode,
  normalizeDocument,
  normalizePostalCode,
  type DocumentType,
} from "@/lib/billing/documents"
import { formatDate } from "@/lib/format"
import type { FormState } from "@/lib/validation/forms"

export type BillingFormValues = {
  documentType: DocumentType
  document: string
  legalName: string
  postalCode: string
  street: string
  addressNumber: string
  complement: string
  district: string
  city: string
  state: string
}

type LockedDocument = { type: DocumentType; document: string; registeredAt: string }

type CepStatus = "idle" | "loading" | "not_found" | "unavailable"

const STATE_ITEMS = Object.fromEntries(BRAZIL_STATES.map((state) => [state.uf, state.uf]))

const DOCUMENT_OPTIONS: { value: DocumentType; title: string; description: string }[] = [
  { value: "cpf", title: "Pessoa física", description: "Cobrança no seu CPF" },
  { value: "cnpj", title: "Pessoa jurídica", description: "Cobrança no CNPJ da empresa" },
]

const CORREIOS_CEP_URL = "https://buscacepinter.correios.com.br/app/endereco/index.php"

/**
 * Dados de cobrança: CPF/CNPJ, nome/razão social e endereço. Usado no cadastro e em Configurações.
 * O CPF/CNPJ só é pedido na primeira vez (com confirmação); depois aparece travado.
 */
export function BillingProfileForm({
  action,
  defaults,
  lockedDocument,
  personName,
  accountEmail,
  submitLabel,
  pendingLabel = "Salvando...",
  columns = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  defaults: BillingFormValues
  lockedDocument: LockedDocument | null
  personName: string
  accountEmail: string
  submitLabel: string
  pendingLabel?: string
  /** Titular e endereço lado a lado em telas largas (Configurações). */
  columns?: boolean
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const [values, setValues] = useState<BillingFormValues>(defaults)
  const [legalNameTouched, setLegalNameTouched] = useState(Boolean(lockedDocument))
  const [cepStatus, setCepStatus] = useState<CepStatus>("idle")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const streetRef = useRef<HTMLInputElement>(null)
  const numberRef = useRef<HTMLInputElement>(null)
  const lastLookup = useRef<string | null>(normalizePostalCode(defaults.postalCode))
  const confirmedDocument = useRef<string | null>(null)

  const documentType = lockedDocument?.type ?? values.documentType
  const documentLabel = DOCUMENT_LABELS[documentType]
  const invalid = (name: string) => hasFieldError(state, name) || undefined

  function setField<K extends keyof BillingFormValues>(key: K, value: BillingFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  function changeDocumentType(next: DocumentType) {
    setValues((previous) => ({
      ...previous,
      documentType: next,
      document: maskDocument(next, previous.document),
      // Enquanto a pessoa não mexeu no nome, sugere o próprio nome para CPF e deixa em branco para CNPJ.
      legalName: legalNameTouched ? previous.legalName : next === "cpf" ? personName : "",
    }))
  }

  async function changePostalCode(raw: string) {
    const masked = maskPostalCode(raw)
    setField("postalCode", masked)
    const cep = normalizePostalCode(masked)
    if (!cep) {
      lastLookup.current = null
      setCepStatus("idle")
      return
    }
    if (cep === lastLookup.current) return
    lastLookup.current = cep
    setCepStatus("loading")
    const result = await lookupPostalCode(cep)
    if (lastLookup.current !== cep) return
    if (result.status !== "found") {
      setCepStatus(result.status)
      return
    }
    const { address } = result
    setValues((previous) => ({
      ...previous,
      street: address.street || previous.street,
      district: address.district || previous.district,
      city: address.city,
      state: address.state,
    }))
    setCepStatus("idle")
    // CEP de rua: falta só o número. CEP geral da cidade: a rua também.
    requestAnimationFrame(() => (address.street ? numberRef.current : streetRef.current)?.focus())
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (lockedDocument) return
    const document = normalizeDocument(values.document)
    // Documento inválido segue para o servidor, que devolve o erro no campo.
    if (!isValidDocument(values.documentType, document)) return
    if (confirmedDocument.current === `${values.documentType}:${document}`) return
    event.preventDefault()
    setConfirmOpen(true)
  }

  function confirmAndSubmit() {
    confirmedDocument.current = `${values.documentType}:${normalizeDocument(values.document)}`
    setConfirmOpen(false)
    formRef.current?.requestSubmit()
  }

  const holderSection = (
    <FieldSet>
      <FieldLegend>Titular da cobrança</FieldLegend>
      <FieldDescription>Quem paga a assinatura e recebe a nota fiscal.</FieldDescription>
      <FieldGroup>
        {lockedDocument ? (
          <Field>
            <FieldLabel htmlFor="document-locked">{documentLabel}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="document-locked"
                value={formatDocument(lockedDocument.type, lockedDocument.document)}
                readOnly
                aria-readonly
                className="cursor-default bg-muted/50 font-mono"
              />
              <InputGroupAddon align="inline-end">
                <LockIcon />
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              Vinculado a esta conta desde {formatDate(lockedDocument.registeredAt, "short")} e não pode ser
              alterado. Se houver algum erro, fale com o suporte.
            </FieldDescription>
          </Field>
        ) : (
          <>
            <RadioGroup
              name="documentType"
              value={values.documentType}
              onValueChange={(next) => changeDocumentType(next === "cnpj" ? "cnpj" : "cpf")}
              className="sm:grid-cols-2"
              aria-label="Tipo de cadastro"
            >
              {DOCUMENT_OPTIONS.map((option) => (
                <FieldLabel key={option.value} htmlFor={`documentType-${option.value}`}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{option.title}</FieldTitle>
                      <FieldDescription>{option.description}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={option.value} id={`documentType-${option.value}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
            <FieldError errors={fieldErrors(state, "documentType")} />
            <Field data-invalid={invalid("document")}>
              <FieldLabel htmlFor="document">{documentLabel}</FieldLabel>
              <Input
                id="document"
                name="document"
                value={values.document}
                onChange={(event) => setField("document", maskDocument(values.documentType, event.target.value))}
                inputMode={values.documentType === "cpf" ? "numeric" : "text"}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder={values.documentType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                className="font-mono"
                aria-invalid={invalid("document")}
                required
              />
              <FieldDescription>
                Confira com atenção: depois de salvo, o {documentLabel} fica vinculado a esta conta e não pode ser
                alterado.
                {values.documentType === "cnpj" ? " O novo CNPJ com letras também é aceito." : null}
              </FieldDescription>
              <FieldError errors={fieldErrors(state, "document")} />
            </Field>
          </>
        )}
        <Field data-invalid={invalid("legalName")}>
          <FieldLabel htmlFor="legalName">{documentType === "cpf" ? "Nome completo" : "Razão social"}</FieldLabel>
          <Input
            id="legalName"
            name="legalName"
            value={values.legalName}
            onChange={(event) => {
              setLegalNameTouched(true)
              setField("legalName", event.target.value)
            }}
            autoComplete={documentType === "cpf" ? "name" : "organization"}
            placeholder={documentType === "cpf" ? "Como está no documento" : "Como está no cartão CNPJ"}
            maxLength={150}
            aria-invalid={invalid("legalName")}
            required
          />
          <FieldError errors={fieldErrors(state, "legalName")} />
        </Field>
      </FieldGroup>
    </FieldSet>
  )

  const addressSection = (
    <FieldSet>
      <FieldLegend>Endereço</FieldLegend>
      <FieldDescription>O endereço de cobrança, que vai na nota fiscal.</FieldDescription>
      <FieldGroup className="gap-4">
        <Field data-invalid={invalid("postalCode")}>
          <FieldLabel htmlFor="postalCode">CEP</FieldLabel>
          <InputGroup className="sm:max-w-48">
            <InputGroupInput
              id="postalCode"
              name="postalCode"
              value={values.postalCode}
              onChange={(event) => void changePostalCode(event.target.value)}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              aria-invalid={invalid("postalCode")}
              required
            />
            <InputGroupAddon align="inline-end">
              {cepStatus === "loading" ? <Spinner /> : <MapPinIcon />}
            </InputGroupAddon>
          </InputGroup>
          {cepStatus === "not_found" ? (
            <FieldDescription>Não encontramos esse CEP. Confira ou preencha o endereço abaixo.</FieldDescription>
          ) : cepStatus === "unavailable" ? (
            <FieldDescription>Não deu para buscar o endereço agora. Preencha abaixo.</FieldDescription>
          ) : (
            <FieldDescription>
              <a href={CORREIOS_CEP_URL} target="_blank" rel="noreferrer">
                Não sei o CEP
              </a>
            </FieldDescription>
          )}
          <FieldError errors={fieldErrors(state, "postalCode")} />
        </Field>
        <Field data-invalid={invalid("street")}>
          <FieldLabel htmlFor="street">Rua ou avenida</FieldLabel>
          <Input
            ref={streetRef}
            id="street"
            name="street"
            value={values.street}
            onChange={(event) => setField("street", event.target.value)}
            autoComplete="address-line1"
            maxLength={150}
            aria-invalid={invalid("street")}
            required
          />
          <FieldError errors={fieldErrors(state, "street")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field data-invalid={invalid("addressNumber")}>
            <FieldLabel htmlFor="addressNumber">Número</FieldLabel>
            <Input
              ref={numberRef}
              id="addressNumber"
              name="addressNumber"
              value={values.addressNumber}
              onChange={(event) => setField("addressNumber", event.target.value)}
              placeholder="Ou S/N"
              maxLength={20}
              aria-invalid={invalid("addressNumber")}
              required
            />
            <FieldError errors={fieldErrors(state, "addressNumber")} />
          </Field>
          <Field data-invalid={invalid("complement")} className="sm:col-span-2">
            <FieldLabel htmlFor="complement">
              Complemento <span className="font-normal text-muted-foreground">(opcional)</span>
            </FieldLabel>
            <Input
              id="complement"
              name="complement"
              value={values.complement}
              onChange={(event) => setField("complement", event.target.value)}
              autoComplete="address-line2"
              placeholder="Sala, apto, bloco"
              maxLength={80}
              aria-invalid={invalid("complement")}
            />
            <FieldError errors={fieldErrors(state, "complement")} />
          </Field>
        </div>
        <Field data-invalid={invalid("district")}>
          <FieldLabel htmlFor="district">Bairro</FieldLabel>
          <Input
            id="district"
            name="district"
            value={values.district}
            onChange={(event) => setField("district", event.target.value)}
            maxLength={80}
            aria-invalid={invalid("district")}
            required
          />
          <FieldError errors={fieldErrors(state, "district")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field data-invalid={invalid("city")} className="sm:col-span-2">
            <FieldLabel htmlFor="city">Cidade</FieldLabel>
            <Input
              id="city"
              name="city"
              value={values.city}
              onChange={(event) => setField("city", event.target.value)}
              autoComplete="address-level2"
              maxLength={80}
              aria-invalid={invalid("city")}
              required
            />
            <FieldError errors={fieldErrors(state, "city")} />
          </Field>
          <Field data-invalid={invalid("state")}>
            <FieldLabel htmlFor="state">Estado</FieldLabel>
            <Select
              name="state"
              items={STATE_ITEMS}
              value={values.state || null}
              onValueChange={(next) => setField("state", typeof next === "string" ? next : "")}
            >
              <SelectTrigger id="state" className="w-full" aria-invalid={invalid("state")}>
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                {BRAZIL_STATES.map((item) => (
                  <SelectItem key={item.uf} value={item.uf}>
                    {item.name} ({item.uf})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={fieldErrors(state, "state")} />
          </Field>
        </div>
      </FieldGroup>
    </FieldSet>
  )

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <FormMessage state={state} />
        <div className={columns ? "grid gap-8 lg:grid-cols-2 lg:gap-10" : "flex flex-col gap-8"}>
          {holderSection}
          {addressSection}
        </div>
        <div>
          <SubmitButton pending={pending} pendingLabel={pendingLabel} className={columns ? undefined : "w-full"}>
            {submitLabel}
          </SubmitButton>
        </div>
      </form>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirme o {documentLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              Depois de salvo, ele fica vinculado à conta{" "}
              <span className="font-medium break-all text-foreground">{accountEmail}</span> e não poderá ser
              alterado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-center">
            <p className="font-mono text-lg font-semibold tracking-wide">
              {formatDocument(values.documentType, values.document)}
            </p>
            {values.legalName.trim() ? (
              <p className="mt-1 text-sm text-muted-foreground">{values.legalName.trim()}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Corrigir</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAndSubmit}>Está correto, salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
