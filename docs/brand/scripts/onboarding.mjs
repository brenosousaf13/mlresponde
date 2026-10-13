/**
 * Imagens do tour de boas-vindas (components/app/welcome-tour.tsx).
 *
 * Originais em docs/brand/onboarding/passo-N.png (1254 px, fundo transparente). passo-2-com-fundo.png é a versão
 * original do robô com fundo branco, guardada só como referência.
 * Gera public/tour/passo-N.png (640 px): recorta as margens e centraliza cada desenho num quadrado transparente,
 * com o mesmo peso visual entre os passos (ícones com fundo ficam um pouco menores que os desenhos só de traço,
 * porque "pesam" mais).
 *
 * Rodar na raiz do projeto: node docs/brand/scripts/onboarding.mjs
 */
import { mkdir } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const SIZE = 640
const ORIGINAIS = "docs/brand/onboarding"
const SAIDA = "public/tour"

// Fração do quadrado ocupada pelo lado maior do desenho.
const PASSOS = [
  { arquivo: "passo-1.png", escala: 0.74 }, // balão de conversa num quadrado grafite
  { arquivo: "passo-2.png", escala: 0.8 }, // robô (só traço)
  { arquivo: "passo-3.png", escala: 0.74 }, // escudo num quadrado sage
  { arquivo: "passo-4.png", escala: 0.84 }, // lojas ligadas ao painel (só traço)
]

/** Caixa do conteúdo visível (ignora pixels quase transparentes). */
async function contentBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 12) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

await mkdir(SAIDA, { recursive: true })
for (const passo of PASSOS) {
  const origem = path.join(ORIGINAIS, passo.arquivo)
  const box = await contentBox(origem)
  const lado = Math.round(SIZE * passo.escala)
  const desenho = await sharp(origem)
    .extract(box)
    .resize({ width: lado, height: lado, fit: "inside", kernel: "lanczos3" })
    .png()
    .toBuffer({ resolveWithObject: true })
  const left = Math.round((SIZE - desenho.info.width) / 2)
  const top = Math.round((SIZE - desenho.info.height) / 2)
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: desenho.data, left, top }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(SAIDA, passo.arquivo))
  console.log(`${passo.arquivo}: desenho ${desenho.info.width}x${desenho.info.height} em ${SIZE}x${SIZE}`)
}
