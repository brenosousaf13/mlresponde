// Importa um perfil exportado da v1 (scripts/v1-para-v2/exportar.mjs) para o Supabase de TESTES da v2.
//
// Uso:
//   node scripts/v1-para-v2/importar.mjs --projeto ookosqyfazobiwmopiix \
//     --export docs/v2/privado/v1-para-v2/<nome>.export.json \
//     [--assistente docs/v2/privado/v1-para-v2/<nome>.assistente.json] \
//     --email <login novo na v2> --loja "<nome da loja>" [--cobranca-ficticia] [--substituir]
//
// Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local (ambiente de TESTES) e só continua se o
// projeto da URL for o informado em --projeto. Cria um login novo (e-mail confirmado, senha aleatória mostrada uma
// vez), organização com cortesia, conta(s) ML SEM tokens (não respondem nada; aparecem como "reconectar"), perguntas,
// respostas ensinadas e a configuração do Assistente. Mapeamento: lib/migration/v1.ts e CEREBRO.md §6.3.
import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"

import { createClient } from "@supabase/supabase-js"

import { PROFILE_QUESTIONS, SETUP_STEP_COUNT } from "../../lib/assistant/questions.ts"
import {
  countByStatus,
  fictitiousCnpj,
  itemTitlesFromJobs,
  mapQuestionJob,
  mapTrainingExamples,
} from "../../lib/migration/v1.ts"

const BRIEFING_LIMIT = 5000

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index > -1 ? process.argv[index + 1] : undefined
}
const flag = (name) => process.argv.includes(`--${name}`)

function fail(message) {
  console.error(message)
  process.exit(1)
}

const projectRef = arg("projeto")
const exportPath = arg("export")
const assistantPath = arg("assistente")
const loginEmail = arg("email")?.trim().toLowerCase()
const storeName = arg("loja")?.trim()
if (!projectRef || !exportPath || !loginEmail || !storeName) {
  fail("Faltou --projeto, --export, --email ou --loja.")
}

process.loadEnvFile(".env.local")
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) fail("O .env.local precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.")
const host = new URL(url).host
if (host.split(".")[0] !== projectRef) fail(`O .env.local aponta para ${host}, não para o projeto ${projectRef}. Nada foi feito.`)
if (process.env.V1_SUPABASE_URL && new URL(process.env.V1_SUPABASE_URL).host === host) {
  fail("O destino é o mesmo projeto da v1. Nada foi feito.")
}

const exported = JSON.parse(readFileSync(exportPath, "utf8"))
if (exported.format !== "maanu-v1-export@1") fail("Arquivo de exportação em formato desconhecido.")
const assistant = assistantPath ? JSON.parse(readFileSync(assistantPath, "utf8")) : null

// ---------- Valida a configuração do Assistente com o roteiro da v2 ----------
if (assistant) {
  for (const [id, answer] of Object.entries(assistant.store_profile ?? {})) {
    const question = PROFILE_QUESTIONS.find((candidate) => candidate.id === id)
    if (!question) fail(`Assistente: pergunta desconhecida "${id}".`)
    const known = new Set((question.options ?? []).map((option) => option.value))
    if (!Array.isArray(answer.options) || answer.options.some((option) => !known.has(option))) {
      fail(`Assistente: opção inválida em "${id}".`)
    }
    if (question.kind === "choice" && answer.options.length > 1) fail(`Assistente: "${id}" aceita uma opção só.`)
    if (typeof answer.text !== "string" || answer.text.length > question.maxLength) {
      fail(`Assistente: "${id}" passou de ${question.maxLength} caracteres.`)
    }
  }
  if (!assistant.store_profile?.store_name?.text) fail("Assistente: falta o nome da loja (store_name).")
  if ((assistant.store_briefing ?? "").length > BRIEFING_LIMIT) fail("Assistente: store_briefing passou de 5.000 caracteres.")
  if (assistant.v1_fallback_markers && !Array.isArray(assistant.v1_fallback_markers)) {
    fail("Assistente: v1_fallback_markers precisa ser uma lista de textos.")
  }
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function must(promise, step) {
  const { data, error } = await promise
  if (error) throw new Error(`${step}: ${error.message}`)
  return data
}

async function findAuthUser(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = data.users.find((user) => user.email?.toLowerCase() === email)
    if (found || data.users.length < 1000) return found ?? null
  }
}

const sellers = exported.ml_credentials.map((credential) => Number(credential.seller_id))

// ---------- Importação anterior (só remove o que é do mesmo login) ----------
const previousUser = await findAuthUser(loginEmail)
const existingAccounts = await must(
  supabase.from("ml_accounts").select("id, organization_id, ml_user_id").in("ml_user_id", sellers),
  "conferir contas ML"
)
const previousOrgIds = previousUser
  ? (await must(supabase.from("organization_members").select("organization_id").eq("user_id", previousUser.id), "organizações"))
      .map((row) => row.organization_id)
  : []
const foreign = existingAccounts.filter((account) => !previousOrgIds.includes(account.organization_id))
if (foreign.length) {
  fail(`A conta ML ${foreign.map((account) => account.ml_user_id).join(", ")} já existe em outra organização da v2. Nada foi feito.`)
}
if (previousUser) {
  if (!flag("substituir")) fail(`O login ${loginEmail} já existe. Use --substituir para apagar a importação anterior e refazer.`)
  for (const organizationId of previousOrgIds) {
    const members = await must(
      supabase.from("organization_members").select("user_id").eq("organization_id", organizationId),
      "membros"
    )
    if (members.some((member) => member.user_id !== previousUser.id)) {
      fail("A organização do login anterior tem outros membros. Remova à mão. Nada foi feito.")
    }
  }
  for (const organizationId of previousOrgIds) {
    await must(supabase.from("organizations").delete().eq("id", organizationId), "apagar organização anterior")
  }
  const { error } = await supabase.auth.admin.deleteUser(previousUser.id)
  if (error) throw error
}

// ---------- Login, organização e perfil ----------
const password = randomBytes(12).toString("base64url")
const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email: loginEmail,
  password,
  email_confirm: true,
  user_metadata: { full_name: "" },
})
if (createError) throw createError
const userId = created.user.id

const membership = await must(
  supabase.from("organization_members").select("organization_id").eq("user_id", userId).single(),
  "organização criada pelo cadastro"
)
const organizationId = membership.organization_id
const now = new Date().toISOString()
const v1CreatedAt = exported.user.created_at

await must(
  supabase
    .from("organizations")
    .update({
      name: storeName.slice(0, 120),
      billing_exempt: true,
      ml_accounts_limit: Math.max(1, sellers.length),
      created_at: v1CreatedAt,
    })
    .eq("id", organizationId),
  "organização"
)
await must(
  supabase
    .from("profiles")
    .update({ onboarding_completed_at: now, tour_completed_at: now, created_at: v1CreatedAt })
    .eq("id", userId),
  "perfil"
)

if (flag("cobranca-ficticia")) {
  await must(
    supabase.from("billing_profiles").insert({
      organization_id: organizationId,
      document_type: "cnpj",
      document: fictitiousCnpj(`${projectRef}:${loginEmail}`),
      legal_name: `${storeName} (dados fictícios de teste)`.slice(0, 150),
      postal_code: "01001000",
      street: "Endereço fictício (importação de teste)",
      address_number: "0",
      district: "Sé",
      city: "São Paulo",
      state: "SP",
      registered_by: userId,
    }),
    "dados de cobrança fictícios"
  )
}

// ---------- Contas ML (sem tokens), perguntas e respostas ensinadas ----------
const titles = itemTitlesFromJobs(exported.question_jobs)
const summary = []
for (const credential of exported.ml_credentials) {
  const knowledge = exported.knowledge_base.find((item) => item.seller_id === credential.seller_id)?.content ?? ""
  const briefing = assistant ? (assistant.store_briefing ?? "") : knowledge.length <= BRIEFING_LIMIT ? knowledge : ""
  if (!assistant && knowledge.length > BRIEFING_LIMIT) {
    console.warn(`Base de conhecimento da conta ${credential.seller_id} tem ${knowledge.length} caracteres (limite 5.000): não importada. Use --assistente.`)
  }

  const account = await must(
    supabase
      .from("ml_accounts")
      .insert({
        organization_id: organizationId,
        ml_user_id: Number(credential.seller_id),
        site_id: "MLB",
        status: "active",
        token_status: "invalid",
        last_refresh_error: "Conta importada da v1 sem tokens: reconecte pelo Mercado Livre para voltar a responder.",
        last_refresh_error_at: now,
        connected_by: userId,
        auto_reply_enabled: false,
        store_briefing: briefing,
        created_at: credential.created_at,
        ...(assistant
          ? {
              store_profile: assistant.store_profile,
              store_setup_step: SETUP_STEP_COUNT,
              store_profile_completed_at: now,
              answer_tone: assistant.answer_tone ?? "cordial",
              answer_greeting: assistant.answer_greeting ?? "",
              answer_signature: assistant.answer_signature ?? "",
              answer_mode: assistant.answer_mode ?? "careful",
              fallback_answer: assistant.fallback_answer ?? "",
              ai_confidence_threshold: assistant.ai_confidence_threshold ?? 0.75,
            }
          : {}),
      })
      .select("id")
      .single(),
    `conta ML ${credential.seller_id}`
  )
  const target = { organizationId, mlAccountId: account.id }

  const questions = exported.question_jobs
    .filter((job) => job.seller_id === credential.seller_id)
    .map((job) => mapQuestionJob(job, target, { fallbackMarkers: assistant?.v1_fallback_markers ?? [] }))
  for (let start = 0; start < questions.length; start += 500) {
    await must(supabase.from("ml_questions").insert(questions.slice(start, start + 500)), "perguntas")
  }

  const examples = mapTrainingExamples(
    exported.training_examples.filter((example) => example.seller_id === credential.seller_id),
    target,
    titles
  )
  if (examples.rows.length) await must(supabase.from("ai_examples").insert(examples.rows), "respostas ensinadas")

  summary.push({
    conta_ml: credential.seller_id,
    perguntas: countByStatus(questions),
    respostas_ensinadas: examples.rows.length,
    exemplos_descartados: examples.skipped,
    base_de_conhecimento_v1: `${knowledge.length} caracteres`,
    assistente: assistant ? "configuração convertida (concluída)" : briefing ? "Outras informações" : "vazio",
  })
}

await must(
  supabase.from("admin_organization_notes").upsert({
    organization_id: organizationId,
    notes: [
      `Importada da v1 (produção) em ${now.slice(0, 10)} para teste, por scripts/v1-para-v2/importar.mjs.`,
      `Usuário v1: ${exported.user.id} (o e-mail original não foi copiado). Exportado em ${exported.exported_at.slice(0, 10)}.`,
      `Contas ML: ${sellers.join(", ")} — SEM tokens (não respondem nada; a v1 continua respondendo esse cliente).`,
      assistant ? "Assistente: base de conhecimento da v1 convertida para a configuração guiada (revisar)." : "",
      flag("cobranca-ficticia") ? "Dados de cobrança FICTÍCIOS (CNPJ e endereço de teste)." : "",
    ]
      .filter(Boolean)
      .join("\n"),
  }),
  "nota interna"
)

console.log(JSON.stringify({ organizacao: organizationId, login: loginEmail, senha: password, contas: summary }, null, 2))

