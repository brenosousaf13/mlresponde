/**
 * Fotos da revisão de devolução (puro, testado em tests/unit/recovery.test.ts): o navegador reduz cada foto para JPG de
 * até 1.600 px no maior lado antes de enviar, para 5 fotos de celular caberem no limite da Server Action (4 MB).
 */

export const PHOTO_MAX_SIDE = 1600
export const PHOTO_QUALITY = 0.8

/** Tamanho final mantendo a proporção; nunca aumenta a foto. */
export function fitWithin(width: number, height: number, maxSide: number = PHOTO_MAX_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Nome do arquivo reduzido: o original sem extensão + ".jpg". */
export function photoName(original: string, index: number): string {
  const base = original.replace(/\.[^.]*$/, "").trim()
  return (base || "foto-" + (index + 1)) + ".jpg"
}
