/**
 * Fotos de anúncio do Mercado Livre (puro, testado em tests/unit/ml-images.test.ts).
 *
 * O ML devolve `thumbnail` com http:// (e às vezes não manda mais o `secure_thumbnail`). O next/image só otimiza
 * endereços https do mlstatic (next.config.ts); um http virava erro 400 e a foto aparecia quebrada.
 */
const ML_IMAGE_HOST = /(^|\.)mlstatic\.com$/i

/** Endereço https da foto, ou null quando não é uma foto do ML (a tela mostra o ícone de pacote). */
export function mlImageUrl(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null

  let url: URL
  try {
    url = new URL(raw.startsWith("//") ? `https:${raw}` : raw)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (!ML_IMAGE_HOST.test(url.hostname)) return null

  url.protocol = "https:"
  return url.toString()
}
