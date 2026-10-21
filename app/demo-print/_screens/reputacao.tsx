import { ShieldCheckIcon } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { AlertsCard, ColorValueCard, ForecastCard, ShipmentsCard } from "@/components/reputacao/overview-cards"
import { RefreshReputationButton } from "@/components/reputacao/refresh-button"
import { ReputationTabs } from "@/components/reputacao/reputation-tabs"
import { ThermometerCard } from "@/components/reputacao/thermometer-card"
import type { ReputationPageData } from "@/lib/dal/reputation"
import { computeSlack, type ReputationReading } from "@/lib/reputation/metrics"

import { DEMO_ACCOUNT_ID, PRODUCTS, ago, inHours } from "../_data"

const READING: ReputationReading = {
  levelId: "5_green",
  color: "green",
  powerSellerStatus: "gold",
  protected: false,
  protectionEndDate: null,
  realColor: null,
  periodDays: 60,
  salesCompleted: 412,
  metrics: {
    claims: { value: 3, rate: 0.0073 },
    cancellations: { value: 2, rate: 0.0049 },
    delayed: { value: 21, rate: 0.051 },
  },
}

const ALERTS = [
  {
    id: "a1",
    kind: "claim_due_soon",
    severity: "urgent",
    title: "Responda a reclamação até hoje às 21:00",
    body: "O comprador de “" + PRODUCTS.jaqueta.title + "” está aguardando. A maanu já leu a conversa e sugeriu uma resposta.",
    opened_at: ago(1.2),
    data: {},
  },
  {
    id: "a2",
    kind: "shipment_at_risk",
    severity: "urgent",
    title: "1 envio vence em 3 horas",
    body: "Despache “" + PRODUCTS.cafeteira.title + "” até as 20:30 para não contar como atraso.",
    opened_at: ago(2.5),
    data: {},
  },
  {
    id: "a3",
    kind: "claim_excluded",
    severity: "info",
    title: "Uma reclamação saiu da sua conta",
    body: "O Mercado Livre deixou de contar uma reclamação na sua reputação. Sua folga voltou a aumentar.",
    opened_at: ago(20),
    data: {},
  },
] as unknown as ReputationPageData["alerts"]

const COLOR_VALUE: ReputationPageData["colorValue"] = {
  discount: 412.8,
  coveredDays: 30,
  since: null,
  shipments: 87,
  monthlyEstimate: 690,
} as ReputationPageData["colorValue"]

const SHIPMENTS = [
  {
    shipment_id: 1,
    ml_order_id: 2000012345678,
    pack_id: null,
    item_title: PRODUCTS.cafeteira.title,
    sla_expected_at: inHours(3),
    logistic_type: "xd_drop_off",
  },
  {
    shipment_id: 2,
    ml_order_id: 2000012345901,
    pack_id: null,
    item_title: PRODUCTS.tenis.title + " Tam. 41",
    sla_expected_at: inHours(26),
    logistic_type: "drop_off",
  },
  {
    shipment_id: 3,
    ml_order_id: 2000012346122,
    pack_id: null,
    item_title: PRODUCTS.tacas.title,
    sla_expected_at: inHours(30),
    logistic_type: "drop_off",
  },
] as unknown as ReputationPageData["shipments"]

export function ReputationScreen() {
  const slack = computeSlack(READING)
  return (
    <>
      <PageHeader
        title="Escudo de Reputação"
        description="Quanto falta para a sua cor cair, os despachos perto do prazo e quando cada reclamação sai da conta."
        actions={<RefreshReputationButton accountId={DEMO_ACCOUNT_ID} />}
      />
      <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheckIcon className="size-3.5" />
          Atualizado há 4 minutos
        </span>
      </div>
      <ReputationTabs active="visao" openClaims={2} needsYou hrefFor={() => "#"} />
      <div className="grid gap-4 xl:grid-cols-3">
        <ThermometerCard reading={READING} slack={slack} className="xl:col-span-2" />
        <div className="xl:relative xl:min-h-[32rem]">
          <div className="grid gap-4 md:grid-cols-2 xl:absolute xl:inset-0 xl:flex xl:flex-col">
            <AlertsCard alerts={ALERTS} accountId={DEMO_ACCOUNT_ID} className="xl:min-h-52 xl:flex-1" />
            <ColorValueCard value={COLOR_VALUE} />
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ShipmentsCard shipments={SHIPMENTS} now={new Date()} />
        <ForecastCard
          forecast={{ entries: [], counted: 0 } as unknown as ReputationPageData["forecast"]}
          claimsValue={3}
          periodDays={60}
          searching={false}
        />
      </div>
    </>
  )
}