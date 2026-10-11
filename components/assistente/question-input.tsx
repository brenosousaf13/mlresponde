"use client"

import { CheckIcon } from "lucide-react"

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ProfileAnswer } from "@/lib/assistant/profile"
import type { ProfileQuestion } from "@/lib/assistant/questions"

export const EMPTY_ANSWER: ProfileAnswer = { options: [], text: "" }

function Counter({ length, max }: { length: number; max: number }) {
  if (length < max * 0.6) return null
  return (
    <span className={length > max ? "text-destructive" : undefined}>
      {length.toLocaleString("pt-BR")}/{max.toLocaleString("pt-BR")}
    </span>
  )
}

export function ProfileQuestionInput({
  question,
  value,
  onChange,
  onSubmit,
  autoFocus,
  disabled,
}: {
  question: ProfileQuestion
  value: ProfileAnswer
  onChange: (value: ProfileAnswer) => void
  /** Enter (campo curto) ou Ctrl+Enter (texto longo). */
  onSubmit?: () => void
  autoFocus?: boolean
  disabled?: boolean
}) {
  const id = `question-${question.id}`
  const submitOnCtrlEnter = (event: React.KeyboardEvent) => {
    if (onSubmit && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSubmit()
    }
  }

  if (question.kind === "text") {
    return (
      <Field>
        <Input
          id={id}
          aria-label={question.title}
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
          onKeyDown={(event) => {
            if (onSubmit && event.key === "Enter") {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder={question.placeholder}
          maxLength={question.maxLength}
          autoFocus={autoFocus}
          disabled={disabled}
          className="h-10 text-base md:text-sm"
        />
      </Field>
    )
  }

  if (question.kind === "textarea") {
    return (
      <Field>
        <Textarea
          id={id}
          aria-label={question.title}
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
          onKeyDown={submitOnCtrlEnter}
          placeholder={question.placeholder}
          rows={question.maxLength > 2000 ? 8 : 5}
          autoFocus={autoFocus}
          disabled={disabled}
          className="min-h-32 text-base md:text-sm"
        />
        <FieldDescription className="flex justify-between gap-2">
          <span>Escreva do seu jeito, com frases curtas.</span>
          <Counter length={value.text.length} max={question.maxLength} />
        </FieldDescription>
      </Field>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <ToggleGroup
        multiple={question.kind === "multi"}
        value={value.options}
        onValueChange={(options) => onChange({ ...value, options: options as string[] })}
        spacing={2}
        className="w-full flex-wrap"
        aria-label={question.title}
        disabled={disabled}
      >
        {question.options?.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            variant="outline"
            className="h-auto min-h-9 bg-card px-3 py-2 whitespace-normal aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
          >
            <CheckIcon className="hidden group-aria-pressed/toggle:block" />
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="-mt-2 text-xs text-muted-foreground">
        {question.kind === "multi" ? "Pode marcar mais de uma opção." : "Escolha uma opção."}
      </p>
      <Field>
        <FieldLabel htmlFor={id}>{question.detailsLabel ?? "Detalhes (opcional)"}</FieldLabel>
        <Textarea
          id={id}
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
          onKeyDown={submitOnCtrlEnter}
          placeholder={question.placeholder}
          rows={3}
          disabled={disabled}
          className="text-base md:text-sm"
        />
        <FieldDescription className="flex justify-end">
          <Counter length={value.text.length} max={question.maxLength} />
        </FieldDescription>
      </Field>
    </div>
  )
}
