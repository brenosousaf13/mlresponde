import { BookOpenIcon, ExternalLinkIcon } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { EXCLUSION_CASES, EXCLUSION_HOW_TO, EXCLUSION_RULES_URL, NOT_EXCLUDABLE } from "@/lib/reputation/exclusions"
import { formatRate } from "@/lib/reputation/presentation"
import {
  LEADER_LIMITS,
  LIMITS,
  METRIC_KEYS,
  METRIC_LABELS,
  MIN_SALES_FOR_REPUTATION,
  SIXTY_DAY_MIN_SALES,
  THRESHOLDS_CHECKED_AT,
} from "@/lib/reputation/thresholds"

/** Regras oficiais do ML que o Escudo usa (limites, folga, exclusões) e o que a maanu lê. */
export function HowItWorks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpenIcon className="size-4" />
          Como funciona
        </CardTitle>
        <CardDescription>
          Regras oficiais do Mercado Livre para o Brasil, conferidas em {formatDate(THRESHOLDS_CHECKED_AT + "T12:00:00Z")}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion>
          <AccordionItem value="limites">
            <AccordionTrigger>Os limites de cada cor</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                A cor é a pior das três métricas. Com {SIXTY_DAY_MIN_SALES} vendas ou mais nos últimos 60 dias, a medição é pelos
                últimos 60 dias; senão, pelos últimos 365. Sem {MIN_SALES_FOR_REPUTATION} vendas em 365 dias, a conta fica sem cor.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Métrica (limite máximo de cada cor)</TableHead>
                    <TableHead className="text-right">Verde</TableHead>
                    <TableHead className="text-right">Amarelo</TableHead>
                    <TableHead className="text-right">Laranja</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {METRIC_KEYS.flatMap((key) =>
                    (key === "claims" ? ([60] as const) : ([60, 365] as const)).map((period) => (
                      <TableRow key={key + period}>
                        <TableCell className="whitespace-normal">
                          {METRIC_LABELS[key].title}
                          <span className="block text-xs text-muted-foreground">
                            {key === "claims" ? "60 ou 365 dias" : period + " dias"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatRate(LIMITS[key][period].green)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatRate(LIMITS[key][period].yellow)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatRate(LIMITS[key][period].orange)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <p className="text-sm text-muted-foreground">
                MercadoLíder: reclamações abaixo de {formatRate(LEADER_LIMITS.claims)}, cancelamentos abaixo de{" "}
                {formatRate(LEADER_LIMITS.cancellations)} e atrasos abaixo de {formatRate(LEADER_LIMITS.delayed)}, além do verde.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="folga">
            <AccordionTrigger>Como a folga é calculada</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                Folga = limite da sua cor × vendas do período − problemas que já contam, arredondado para baixo. É quantos
                problemas cabem antes de a cor cair, se as vendas continuarem como estão.
              </p>
              <p>
                As vendas usadas na conta vêm do próprio ML (problemas ÷ percentual). Quando não dá para calcular assim, usamos as
                vendas concluídas do período; nos atrasos isso aparece como “aprox.”, porque o ML só conta os envios pelo Mercado
                Envios.
              </p>
              <p>
                Cada problema sai da conta quando a venda fica mais velha que o período (60 ou 365 dias). As datas da linha do
                tempo são estimativas.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="exclusoes">
            <AccordionTrigger>As 11 reclamações que podem não contar</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3 text-sm">
              <p className="text-muted-foreground">O ML analisa e pode tirar da conta quando a reclamação foi:</p>
              <ol className="list-decimal space-y-1 pl-5">
                {EXCLUSION_CASES.map((item) => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ol>
              <p className="text-muted-foreground">Estas o ML não analisa (contam sempre):</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {NOT_EXCLUDABLE.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">Como pedir: {EXCLUSION_HOW_TO}</p>
              <a
                href={EXCLUSION_RULES_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Regras de exclusão no Mercado Livre
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="dados">
            <AccordionTrigger>O que a maanu lê (e o que nunca faz)</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                Lemos no Mercado Livre o seu termômetro (a cada 30 minutos), a situação e o prazo dos envios das vendas pagas (a cada
                10 a 30 minutos), o desconto do frete de cada envio e as reclamações em que você é o vendedor (a cada 5 minutos).
              </p>
              <p>
                Endereço, telefone e documento do comprador não são lidos. Nesta tela nada é enviado ao comprador nem ao Mercado
                Livre: a maanu só avisa.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
