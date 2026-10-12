// Exporta o perfil completo de UM usuário da v1 (produção) para um arquivo JSON local — SOMENTE LEITURA.
//
// Uso (PowerShell; as chaves ficam só na memória do terminal, nunca em arquivo):
//   $env:V1_SUPABASE_URL = "https://<projeto-v1>.supabase.co"
//   $env:V1_SUPABASE_SERVICE_ROLE_KEY = "<service role da v1>"
//   node scripts/v1-para-v2/exportar.mjs --usuario <uuid ou e-mail> --saida docs/v2/privado/v1-para-v2/<nome>.export.json
//
// Segurança:
//   * Só faz requisições GET (função get abaixo); não existe nenhum caminho de escrita neste arquivo.
//   * NÃO exporta tokens do Mercado Livre (access/refresh): a v2 usa outro app do ML e outra chave de criptografia;
//     reaproveitar o refresh token também derrubaria a conexão da v1 (o ML troca o refresh token a cada uso).
//   * O arquivo tem dados de clientes: a saída precisa ficar em docs/v2/privado/ (fora do git — o repositório é público).
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index > -1 ? process.argv[index + 1] : undefined
}

const baseUrl = process.env.V1_SUPABASE_URL
const key = process.env.V1_SUPABASE_SERVICE_ROLE_KEY
const userRef = arg("usuario")
const output = arg("saida")

if (!baseUrl || !key || !userRef || !output) {
  console.error("Faltou V1_SUPABASE_URL, V1_SUPABASE_SERVICE_ROLE_KEY, --usuario ou --saida.")
  process.exit(1)
}

const privateDir = path.resolve("docs/v2/privado")
const outputPath = path.resolve(output)
if (!outputPath.startsWith(privateDir + path.sep)) {
  console.error(`A saída precisa ficar dentro de ${privateDir} (dados de clientes não podem ir para o git).`)
  process.exit(1)
}

const host = new URL(baseUrl).host

async function get(pathAndQuery) {
  const url = new URL(pathAndQuery, baseUrl)
  if (url.host !== host) throw new Error("Endereço inesperado.")
  const response = await fetch(url, { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!response.ok) throw new Error(`GET ${url.pathname} → ${response.status} ${await response.text()}`)
  return response.json()
}

async function getAll(table, query) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const page = await get(`/rest/v1/${table}?${query}&offset=${offset}&limit=1000`)
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

const inList = (values) => `in.(${values.map((value) => `"${value}"`).join(",")})`

const { users } = await get("/auth/v1/admin/users?per_page=1000")
const user = users.find((candidate) => candidate.id === userRef || candidate.email?.toLowerCase() === userRef.toLowerCase())
if (!user) {
  console.error("Usuário não encontrado na v1.")
  process.exit(1)
}

// Sem access_token/refresh_token: só o que identifica a conta e a configuração.
const credentials = await getAll(
  "ml_credentials",
  `select=seller_id,auto_reply_enabled,created_at,updated_at&user_id=eq.${user.id}&order=created_at.asc`
)
const sellers = credentials.map((credential) => credential.seller_id)
if (!sellers.length) {
  console.error("Esse usuário não tem conta do Mercado Livre conectada na v1.")
  process.exit(1)
}

const knowledgeBase = await getAll(
  "knowledge_base",
  `select=seller_id,content,created_at,updated_at&or=(user_id.eq.${user.id},seller_id.${inList(sellers)})&order=created_at.asc`
)
const trainingExamples = await getAll(
  "training_examples",
  `select=seller_id,question_id,item_id,question_text,answer_text,created_at&user_id=eq.${user.id}&order=created_at.asc`
)
const questionJobs = await getAll(
  "question_jobs",
  `select=question_id,item_id,seller_id,question_text,status,ai_response,error_message,item_title,item_url,created_at,updated_at&seller_id=${inList(sellers)}&order=created_at.asc`
)

const exported = {
  format: "maanu-v1-export@1",
  exported_at: new Date().toISOString(),
  source_project: host.split(".")[0],
  user: {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
    user_metadata: user.user_metadata ?? {},
  },
  ml_credentials: credentials,
  knowledge_base: knowledgeBase,
  training_examples: trainingExamples,
  question_jobs: questionJobs,
}

mkdirSync(path.dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(exported, null, 2), "utf8")
console.log(
  JSON.stringify({
    arquivo: path.relative(process.cwd(), outputPath),
    contas_ml: sellers,
    base_de_conhecimento: knowledgeBase.map((item) => `${item.seller_id}: ${item.content.length} caracteres`),
    exemplos: trainingExamples.length,
    perguntas: questionJobs.length,
  })
)
