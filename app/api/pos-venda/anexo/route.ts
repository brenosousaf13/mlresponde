import { NextResponse, type NextRequest } from "next/server"

import { getAppContext } from "@/lib/dal/app-context"
import { fetchMessageAttachment } from "@/lib/mercadolivre/messages"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ATTACHMENT_ID = /^[A-Za-z0-9_.\-]{3,250}$/

/**
 * Abre um anexo de uma conversa de pós-venda. O token do ML fica no servidor: o navegador só recebe o arquivo, e só se
 * a conversa for da organização do usuário (RLS) e o anexo estiver numa mensagem dela.
 */
export async function GET(request: NextRequest) {
  const context = await getAppContext()
  if (!context.features.pos_venda) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const conversationId = request.nextUrl.searchParams.get("c") ?? ""
  const attachmentId = request.nextUrl.searchParams.get("id") ?? ""
  if (!UUID.test(conversationId) || !ATTACHMENT_ID.test(attachmentId)) return NextResponse.json({ error: "invalid" }, { status: 400 })

  const supabase = await createClient()
  const { data: conversation } = await supabase
    .from("ml_conversations")
    .select("id, ml_account_id, ml_accounts(site_id)")
    .eq("id", conversationId)
    .eq("organization_id", context.organization.id)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const { data: messages } = await supabase
    .from("ml_conversation_messages")
    .select("attachments")
    .eq("conversation_id", conversation.id)
  const known = (messages ?? []).some(
    (message) => Array.isArray(message.attachments) && message.attachments.some((item) => (item as { id?: string } | null)?.id === attachmentId)
  )
  if (!known) return NextResponse.json({ error: "not_found" }, { status: 404 })

  try {
    const upstream = await fetchMessageAttachment(conversation.ml_account_id, attachmentId, conversation.ml_accounts?.site_id || "MLB")
    if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "unavailable" }, { status: 502 })
    const type = upstream.headers.get("content-type") ?? "application/octet-stream"
    // Só abre direto no navegador o que é seguro exibir; o resto é baixado.
    const inline = /^(image\/(png|jpe?g)|application\/pdf|text\/plain)/i.test(type)
    const filename = attachmentId.replace(/^[^_]*_/, "")
    return new NextResponse(upstream.body, {
      headers: {
        "content-type": type,
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/"/g, "")}"`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    console.error("[pos-venda] anexo:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
