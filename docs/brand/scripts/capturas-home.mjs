/**
 * Captura as telas REAIS do app (com dados fictícios, vitrine `app/demo-print`) para a página de vendas.
 *
 * Como usar (computador de desenvolvimento):
 *   1. `npm run dev` (a vitrine só existe em desenvolvimento);
 *   2. `node docs/brand/scripts/capturas-home.mjs [http://localhost:3000]`
 * Precisa de `playwright-core` e `sharp` (defina PLAYWRIGHT_MODULES com a pasta node_modules que os contém, se não
 * estiverem no projeto) e do Microsoft Edge instalado (ou defina BROWSER_EXE). Grava WebP em `public/home/`.
 * As fotos dos anúncios fictícios (`demo-*.mlstatic.com`) são trocadas por ilustrações simples durante a captura.
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import { join, resolve } from "node:path"

const base = process.argv[2] ?? "http://localhost:3000"
const modules = process.env.PLAYWRIGHT_MODULES ?? resolve("node_modules")
const require = createRequire(join(modules, "x.js"))
const { chromium } = require("playwright-core")
const sharp = require("sharp")

const exe = process.env.BROWSER_EXE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
const out = resolve("public/home")
mkdirSync(out, { recursive: true })

/** Largura final das imagens (px); o resto é redimensionado para economizar banda. */
const WIDTHS = { desktop: 2000, mobile: 780 }

const SHOTS = [
  { name: "recuperador-visao", path: "/recuperador", w: 1440, h: 900 },
  { name: "recuperador-devolucoes", path: "/recuperador", variant: "devolucoes", w: 1440, h: 900 },
  { name: "recuperador-raio-x", path: "/recuperador", variant: "raio-x", w: 1440, h: 980 },
  { name: "perguntas", path: "/perguntas", w: 1440, h: 900 },
  { name: "reputacao", path: "/reputacao", w: 1440, h: 900 },
  { name: "resultados", path: "/resultados", w: 1440, h: 980 },
  { name: "mobile-recuperador", path: "/recuperador", w: 390, h: 844, mobile: true },
  { name: "mobile-devolucoes", path: "/recuperador", variant: "devolucoes", w: 390, h: 844, mobile: true },
  { name: "mobile-perguntas", path: "/perguntas", w: 390, h: 844, mobile: true },
  { name: "mobile-reputacao", path: "/reputacao", w: 390, h: 844, mobile: true },
  { name: "mobile-resultados", path: "/resultados", w: 390, h: 844, mobile: true },
]

const ICONS = {
  tenis: '<path d="M14 62c0-6 3-9 8-10l10-3 8-12 8 6 10 4c10 2 18 6 20 12v7H14z" fill="#0F172A"/><path d="M14 69h64v5H14z" fill="#1FAF9A"/><path d="M40 43l6 5M47 47l6 4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
  jaqueta: '<path d="M34 24l-16 8-6 30 12 3 3-14v30h42V51l3 14 12-3-6-30-16-8-8 7h-16z" fill="#3B6FA0"/><path d="M50 31v47" stroke="#fff" stroke-width="2" opacity=".7"/><circle cx="50" cy="42" r="1.6" fill="#fff"/><circle cx="50" cy="54" r="1.6" fill="#fff"/><circle cx="50" cy="66" r="1.6" fill="#fff"/>',
  fone: '<path d="M22 58V50a28 28 0 0156 0v8" fill="none" stroke="#0F172A" stroke-width="6" stroke-linecap="round"/><rect x="16" y="52" width="16" height="26" rx="7" fill="#1FAF9A"/><rect x="68" y="52" width="16" height="26" rx="7" fill="#1FAF9A"/>',
  tacas: '<path d="M26 22h22c0 18-4 28-11 30-7-2-11-12-11-30z" fill="#9FD7C8"/><path d="M37 52v20M28 74h18" stroke="#0F172A" stroke-width="3" stroke-linecap="round"/><path d="M56 30h20c0 16-3 25-10 27-7-2-10-11-10-27z" fill="#C7E9E0"/><path d="M66 57v17M58 76h16" stroke="#0F172A" stroke-width="3" stroke-linecap="round"/>',
  mochila: '<rect x="26" y="26" width="48" height="56" rx="14" fill="#0F172A"/><path d="M38 26v-4a12 12 0 0124 0v4" fill="none" stroke="#0F172A" stroke-width="5"/><rect x="34" y="54" width="32" height="20" rx="6" fill="#1FAF9A"/><path d="M34 44h32" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>',
  cafeteira: '<rect x="28" y="20" width="44" height="14" rx="5" fill="#0F172A"/><rect x="34" y="34" width="32" height="40" rx="6" fill="#9FB4C7"/><rect x="38" y="52" width="24" height="22" rx="4" fill="#5A3B2A"/><rect x="24" y="74" width="52" height="8" rx="4" fill="#0F172A"/>',
}

function illustration(slug) {
  const body = ICONS[slug] ?? ICONS.tenis
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#F4F6F8"/>${body}</svg>`
}

const browser = await chromium.launch({ executablePath: exe, headless: true })

// ONLY="mobile-reputacao,mobile-resultados" refaz só essas capturas (as outras ficam como estão).
const only = process.env.ONLY?.split(",").map((name) => name.trim())

for (const shot of SHOTS) {
  if (only && !only.includes(shot.name)) continue
  const context = await browser.newContext({
    viewport: { width: shot.w, height: shot.h },
    deviceScaleFactor: shot.mobile ? 3 : 2,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  })
  const page = await context.newPage()
  await page.route("**/_next/image**", async (route) => {
    const url = new URL(route.request().url()).searchParams.get("url") ?? ""
    const slug = /demo-([a-z]+)-F/.exec(url)?.[1]
    if (!slug) return route.continue()
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: illustration(slug) })
  })
  await page.goto(`${base}${shot.path}?demo-print=${shot.variant ?? "1"}`, { waitUntil: "networkidle" })
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" })
  await page.waitForTimeout(1600)
  const png = await page.screenshot({ type: "png" })
  const width = shot.mobile ? WIDTHS.mobile : WIDTHS.desktop
  await sharp(png).resize({ width, withoutEnlargement: true }).webp({ quality: 86 }).toFile(join(out, `${shot.name}.webp`))
  if (!shot.mobile) await sharp(png).resize({ width: 1000 }).webp({ quality: 82 }).toFile(join(out, `${shot.name}-1000.webp`))
  console.log("ok", shot.name)
  await context.close()
}

await browser.close()