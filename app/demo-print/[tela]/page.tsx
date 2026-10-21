import { notFound } from "next/navigation"

import { QuestionsScreen } from "../_screens/perguntas"
import { RecoveryOverviewScreen, RecoveryReturnsScreen, RecoveryXrayScreen } from "../_screens/recuperador"
import { ReputationScreen } from "../_screens/reputacao"
import { ResultsScreen } from "../_screens/resultados"

/** `/<tela>?demo-print=<variante>`: a variante escolhe a aba (ex.: `/recuperador?demo-print=raio-x`). */
const SCREENS: Record<string, Record<string, () => React.ReactNode>> = {
  recuperador: { "1": RecoveryOverviewScreen, devolucoes: RecoveryReturnsScreen, "raio-x": RecoveryXrayScreen },
  perguntas: { "1": QuestionsScreen },
  reputacao: { "1": ReputationScreen },
  resultados: { "1": ResultsScreen },
}

export default async function DemoPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ tela: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (process.env.NODE_ENV === "production") notFound()
  const { tela } = await params
  const variant = (await searchParams)["demo-print"]
  const Screen = SCREENS[tela]?.[typeof variant === "string" && variant ? variant : "1"]
  if (!Screen) notFound()
  return <Screen />
}