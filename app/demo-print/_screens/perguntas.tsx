import { InboxList, InboxListFooter, InboxListToolbar, type ListQuestion } from "@/components/perguntas/inbox-list"
import { InboxTabs } from "@/components/perguntas/inbox-tabs"
import { PageHeader } from "@/components/app/page-header"
import { QuestionDetail, type AccountInfo, type DetailQuestion } from "@/components/perguntas/question-detail"
import { SyncButton } from "@/components/perguntas/sync-button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

import { DEMO_ACCOUNT_ID, PRODUCTS, ago } from "../_data"

const MIN = 1 / 60

const ACCOUNT: AccountInfo = {
  nickname: "CASA.AURORA",
  greeting: "Olá, tudo bem?",
  signature: "Abraço, Casa Aurora Store",
}

type Seed = {
  id: string
  product: keyof typeof PRODUCTS
  text: string
  /** Horas atrás em que o comprador perguntou. */
  askedHoursAgo: number
  /** Segundos até a resposta. */
  tookSeconds?: number
  answer?: string
  source?: "ai" | "manual"
  review?: boolean
  confidence?: number
  draft?: string
}

const SEEDS: Seed[] = [
  {
    id: "q1",
    product: "tenis",
    text: "Boa tarde! Esse tênis tem no 42? Chega antes de sábado?",
    askedHoursAgo: 3 * MIN,
    tookSeconds: 6,
    source: "ai",
    confidence: 0.96,
    answer:
      "Temos sim o tamanho 42, em estoque e pronto para envio. Pedindo hoje, o Mercado Envios entrega antes de sábado na maior parte do país. Qualquer dúvida, é só chamar!",
  },
  {
    id: "q2",
    product: "mochila",
    text: "Cabe notebook de 15,6? A alça é acolchoada?",
    askedHoursAgo: 11 * MIN,
    tookSeconds: 5,
    source: "ai",
    confidence: 0.94,
    answer:
      "Cabe sim! O compartimento interno acolchoado foi feito para notebooks de até 15,6 polegadas e as alças são acolchoadas. Pode comprar tranquilo!",
  },
  {
    id: "q3",
    product: "cafeteira",
    text: "Qual a voltagem? Serve em 220V?",
    askedHoursAgo: 24 * MIN,
    tookSeconds: 7,
    source: "ai",
    confidence: 0.98,
    answer: "A cafeteira é bivolt (110V/220V) e troca de voltagem sozinha, então serve em qualquer tomada. Bom café!",
  },
  {
    id: "q4",
    product: "jaqueta",
    text: "Vocês emitem nota fiscal no CNPJ da minha empresa? Preciso para fardamento, são 12 peças.",
    askedHoursAgo: 38 * MIN,
    review: true,
    confidence: 0.58,
    draft:
      "Emitimos nota fiscal em todas as vendas, no CPF ou no CNPJ informado na compra. Para 12 peças, posso conferir o estoque dos tamanhos e te passar as condições.",
  },
  {
    id: "q5",
    product: "jaqueta",
    text: "Se não servir, vocês aceitam troca?",
    askedHoursAgo: 66 * MIN,
    tookSeconds: 6,
    source: "ai",
    confidence: 0.95,
    answer:
      "Aceitamos sim! Se não servir, você pode solicitar a troca ou devolução pelo Mercado Livre em até 30 dias, sem custo. É só abrir a solicitação na sua compra.",
  },
  {
    id: "q6",
    product: "fone",
    text: "Tem outra cor além do preto? Queria o branco.",
    askedHoursAgo: 2.4,
    tookSeconds: 410,
    source: "manual",
    answer: "Temos o branco chegando na semana que vem! Se quiser, deixo ele reservado para você. Abraço, Casa Aurora Store",
  },
  {
    id: "q7",
    product: "tacas",
    text: "Vem em caixa de presente?",
    askedHoursAgo: 5.2,
    tookSeconds: 5,
    source: "ai",
    confidence: 0.93,
    answer: "Vem em caixa individual protegida, ótima para presente. Se quiser, pode pedir embalagem de presente no chat após a compra!",
  },
  {
    id: "q8",
    product: "tenis",
    text: "Entrega para Manaus? Quanto tempo demora?",
    askedHoursAgo: 17.1,
    tookSeconds: 6,
    source: "ai",
    confidence: 0.92,
    answer:
      "Entregamos para todo o Brasil pelo Mercado Envios, inclusive Manaus. O prazo aparece direto no anúncio, ao digitar o CEP. Qualquer dúvida, é só chamar!",
  },
  {
    id: "q9",
    product: "cafeteira",
    text: "Tem garantia? De quanto tempo?",
    askedHoursAgo: 19.4,
    tookSeconds: 7,
    source: "ai",
    confidence: 0.97,
    answer: "Tem garantia de 12 meses direto com a fábrica, e ainda 7 dias para desistir da compra. Pode comprar tranquilo!",
  },
]

function toQuestion(seed: Seed): DetailQuestion {
  const product = PRODUCTS[seed.product]
  const asked = ago(seed.askedHoursAgo)
  const answered = seed.tookSeconds ? new Date(Date.parse(asked) + seed.tookSeconds * 1000).toISOString() : null
  const composed = seed.answer && seed.source === "ai" ? `${ACCOUNT.greeting} ${seed.answer} ${ACCOUNT.signature}` : (seed.answer ?? null)
  return {
    id: seed.id,
    ml_account_id: DEMO_ACCOUNT_ID,
    item_id: product.id,
    item_title: product.title,
    item_permalink: null,
    item_thumbnail: product.thumb,
    question_text: seed.text,
    question_created_at: asked,
    created_at: asked,
    status: seed.review ? "needs_review" : "answered",
    review_reason: seed.review ? "low_confidence" : null,
    ai_draft: seed.draft ?? null,
    ai_confidence: seed.confidence ?? null,
    ai_reason: seed.review ? "Pedido em grande quantidade e para empresa: vale confirmar estoque e condições antes de prometer." : null,
    answer_text: composed,
    answer_source: seed.source ?? null,
    answered_at: answered,
    fallback_reason: null,
  }
}

const QUESTIONS = SEEDS.map(toQuestion)
const LIST: ListQuestion[] = QUESTIONS

export function QuestionsScreen() {
  const selected = QUESTIONS[0]
  return (
    <>
      <PageHeader
        title="Perguntas"
        description="Tudo o que os compradores perguntaram, quem respondeu e o que ainda está esperando você."
        actions={<SyncButton />}
      />
      <InboxTabs active="todas" counts={{ responder: 1, ia: 1284, voce: 96, todas: 1391 }} hrefFor={() => "#"} />
      <div
        data-fill-viewport
        className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)] lg:grid-rows-[minmax(0,1fr)]"
      >
        <Card className="flex gap-0 py-0 lg:min-h-0">
          <InboxListToolbar
            tab="todas"
            total={1391}
            search=""
            hidden={{ aba: "todas" }}
            clearSearchHref="#"
            order="recentes"
            toggleOrderHref="#"
            item={null}
            clearItemHref="#"
            fallbackFilter={null}
            accounts={null}
          />
          <ScrollArea className="lg:min-h-0 lg:flex-1">
            <InboxList
              questions={LIST}
              selectedId={selected.id}
              accounts={{ [DEMO_ACCOUNT_ID]: ACCOUNT }}
              showAccount={false}
              hrefFor={() => "#"}
            />
          </ScrollArea>
          <InboxListFooter from={1} to={50} total={1391} prevHref={null} nextHref="#" />
        </Card>
        <QuestionDetail
          question={selected}
          account={ACCOUNT}
          taught={null}
          showAccount={false}
          backHref="#"
          nextHref="#"
          itemHref={null}
          className="flex lg:min-h-0"
        />
      </div>
    </>
  )
}