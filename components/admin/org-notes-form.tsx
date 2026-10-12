"use client"

import { useActionState } from "react"
import { toast } from "sonner"

import { saveOrganizationNotes } from "@/app/admin/actions"
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback"
import { Textarea } from "@/components/ui/textarea"
import type { FormState } from "@/lib/validation/forms"

/** Notas internas sobre o cliente (só a equipe vê). */
export function OrgNotesForm({ organizationId, notes }: { organizationId: string; notes: string }) {
  const [state, action, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await saveOrganizationNotes(organizationId, previous, formData)
    if (result.ok) toast.success(result.message ?? "Notas salvas.")
    return result
  }, {})

  return (
    <form action={action} className="flex flex-col gap-3">
      <Textarea
        name="notes"
        defaultValue={state.values?.notes ?? notes}
        maxLength={5000}
        rows={5}
        placeholder="Ex.: cliente da v1, paga por Pix todo dia 5, prefere contato à tarde."
        aria-label="Notas internas"
      />
      {state.ok ? null : <FormMessage state={state} />}
      <SubmitButton pending={pending} pendingLabel="Salvando..." variant="outline" className="self-end">
        Salvar notas
      </SubmitButton>
    </form>
  )
}
