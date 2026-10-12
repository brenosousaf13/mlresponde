import { MessageCircleIcon } from "lucide-react"

import { formatWhatsapp } from "@/lib/validation/forms"
import { cn } from "@/lib/utils"

/** Abre a conversa no WhatsApp (número salvo sem +55). */
export function WhatsappLink({ digits, className }: { digits: string | null | undefined; className?: string }) {
  if (!digits) return <span className="text-muted-foreground">—</span>
  return (
    <a
      href={`https://wa.me/55${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 whitespace-nowrap text-brand-teal-ink hover:underline", className)}
    >
      <MessageCircleIcon className="size-3.5" />
      {formatWhatsapp(digits)}
    </a>
  )
}
