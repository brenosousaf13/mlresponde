/**
 * Gera os arquivos da marca maanu a partir de docs/brand/scripts/vetores.json (criado por vetorizar.py).
 *
 * Uso (na raiz do projeto): node docs/brand/scripts/gerar.mjs
 * Usa o `sharp` que já vem com o Next.js. Grava:
 *   public/brand/*            logos SVG/PNG para uso fora do app
 *   app/icon.svg, app/favicon.ico, app/apple-icon.png, app/opengraph-image.png (+ .alt.txt)
 *   components/brand/logo-paths.ts   caminhos usados pelos componentes <LogoWordmark/> e <LogoMark/>
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "../../..")
const out = (rel) => path.join(ROOT, rel)
const GRAPHITE = "#0F172A"
const TEAL = "#1FAF9A"
const WHITE = "#FFFFFF"
const SLATE = "#A0AEC0"

const vectors = JSON.parse(fs.readFileSync(path.join(HERE, "vetores.json"), "utf8"))
const WORD = vectors.wordmark
const MARK = vectors.mark

const glyph = (g, fg) =>
  `<path fill="${fg}" d="${g.path}"/><circle cx="${g.dot.cx}" cy="${g.dot.cy}" r="${g.dot.r}" fill="${TEAL}"/>`
const standalone = (g, fg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="maanu"><title>maanu</title>${glyph(g, fg)}</svg>\n`
/** "m." centralizado num quadrado 100×100; `width` = quanto do quadrado o símbolo ocupa. */
const tile = ({ bg, fg, width, rx }) => {
  const s = width / MARK.width
  const x = (100 - width) / 2
  const y = (100 - MARK.height * s) / 2 + 1.5 // compensa o ponto, que pesa embaixo
  const rect = bg ? `<rect width="100" height="100"${rx ? ` rx="${rx}"` : ""} fill="${bg}"/>` : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${rect}<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(5)})">${glyph(MARK, fg)}</g></svg>\n`
}
const pngSquare = (svg, size) => sharp(Buffer.from(svg), { density: 1200 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
const pngWide = (svg, width) => sharp(Buffer.from(svg), { density: 600 }).resize({ width }).png({ compressionLevel: 9 }).toBuffer()

/** .ico com PNGs dentro (formato aceito por todos os navegadores atuais). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4) // planos
    e.writeUInt16LE(32, 6) // bits por pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

function openGraph() {
  const W = 1200
  const H = 630
  const logoW = 520
  const logoH = (logoW * WORD.height) / WORD.width
  const lx = (W - logoW) / 2
  const ly = 232
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<radialGradient id="g1" cx="0.92" cy="1.05" r="0.75"><stop offset="0" stop-color="${TEAL}" stop-opacity="0.45"/><stop offset="0.55" stop-color="${TEAL}" stop-opacity="0.08"/><stop offset="1" stop-color="${TEAL}" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="0.05" cy="-0.1" r="0.6"><stop offset="0" stop-color="#1E293B" stop-opacity="0.9"/><stop offset="1" stop-color="#1E293B" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="${GRAPHITE}"/>
<rect width="${W}" height="${H}" fill="url(#g2)"/>
<rect width="${W}" height="${H}" fill="url(#g1)"/>
<g transform="translate(${lx.toFixed(2)} ${ly}) scale(${(logoW / WORD.width).toFixed(5)})">${glyph(WORD, WHITE)}</g>
<text x="${W / 2}" y="${(ly + logoH + 78).toFixed(1)}" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="21" font-weight="500" letter-spacing="7" fill="${SLATE}">RESPOSTAS AUTOMÁTICAS COM IA PARA MARKETPLACES</text>
</svg>`
}

function logoPaths() {
  const block = (name, g) =>
    `export const ${name} = {\n  width: ${g.width},\n  height: ${g.height},\n  path: ${JSON.stringify(g.path)},\n  dot: { cx: ${g.dot.cx}, cy: ${g.dot.cy}, r: ${g.dot.r} },\n} as const\n`
  return `// Gerado por docs/brand/scripts/gerar.mjs a partir dos originais em docs/brand. Não editar à mão.\n\n${block("WORDMARK", WORD)}\n${block("MARK", MARK)}`
}

async function main() {
  fs.mkdirSync(out("public/brand"), { recursive: true })
  const favicon = tile({ bg: GRAPHITE, fg: WHITE, width: 70, rx: 22 }) // aba do navegador: aparece em temas claro e escuro
  const appIcon = tile({ bg: WHITE, fg: GRAPHITE, width: 66, rx: 22 }) // ícone de app, como na apresentação da marca

  fs.writeFileSync(out("public/brand/maanu-logo.svg"), standalone(WORD, GRAPHITE))
  fs.writeFileSync(out("public/brand/maanu-logo-branco.svg"), standalone(WORD, WHITE))
  fs.writeFileSync(out("public/brand/maanu-m.svg"), standalone(MARK, GRAPHITE))
  fs.writeFileSync(out("public/brand/maanu-m-branco.svg"), standalone(MARK, WHITE))
  fs.writeFileSync(out("public/brand/maanu-icone.svg"), appIcon)
  fs.writeFileSync(out("public/brand/maanu-logo.png"), await pngWide(standalone(WORD, GRAPHITE), 1200))
  fs.writeFileSync(out("public/brand/maanu-logo-branco.png"), await pngWide(standalone(WORD, WHITE), 1200))
  fs.writeFileSync(out("public/brand/maanu-icone-512.png"), await pngSquare(appIcon, 512))

  fs.writeFileSync(out("app/icon.svg"), favicon)
  const sizes = [16, 32, 48]
  fs.writeFileSync(out("app/favicon.ico"), ico(await Promise.all(sizes.map(async (size) => ({ size, data: await pngSquare(favicon, size) })))))
  // iPhone: quadrado cheio (o iOS arredonda sozinho).
  fs.writeFileSync(out("app/apple-icon.png"), await pngSquare(tile({ bg: WHITE, fg: GRAPHITE, width: 62 }), 180))
  fs.writeFileSync(out("app/opengraph-image.png"), await sharp(Buffer.from(openGraph())).png({ compressionLevel: 9 }).toBuffer())
  fs.writeFileSync(out("app/opengraph-image.alt.txt"), "maanu — Respostas automáticas com IA para marketplaces")

  fs.writeFileSync(out("components/brand/logo-paths.ts"), logoPaths())
  console.log("ok: arquivos da marca gerados")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
