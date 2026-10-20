import { describe, expect, it } from "vitest"

import { COLOR_PERKS, LIMITS } from "@/lib/reputation/thresholds"
import {
  DEMO_CLAIMS,
  DEMO_SALES,
  DEMO_SCALE_MAX,
  demoSentence,
  demoZones,
  formatPercent,
  perksFor,
  simulateClaims,
  thresholdsCheckedLabel,
} from "@/lib/site/reputation-demo"

describe("simulador do Escudo de Reputação (página de vendas)", () => {
  it("usa os limites oficiais de 60 dias numa loja com mais de 100 vendas", () => {
    expect(DEMO_SALES).toBeGreaterThan(100)
    const zones = demoZones()
    expect(zones.map((zone) => zone.band)).toEqual(["green", "yellow", "orange", "red"])
    expect(zones[0].to).toBe(LIMITS.claims[60].green)
    expect(zones[2].to).toBe(LIMITS.claims[60].orange)
    expect(zones[3].to).toBe(DEMO_SCALE_MAX)
    expect(DEMO_SCALE_MAX).toBeGreaterThan(LIMITS.claims[60].orange)
  })

  it("começa no verde, com folga", () => {
    const state = simulateClaims(DEMO_CLAIMS.initial)
    expect(state.band).toBe("green")
    expect(state.slack).toBe(4)
    expect(demoSentence(state)).toBe("Você aguenta mais 4 reclamações antes de cair para amarelo.")
  })

  it("no limite exato ainda é verde, sem folga", () => {
    const state = simulateClaims(6)
    expect(state.band).toBe("green")
    expect(demoSentence(state)).toBe("Sem folga: mais 1 reclamação e a cor cai para amarelo.")
  })

  it("passou do limite: cai de cor e mostra a folga até a próxima", () => {
    const yellow = simulateClaims(7)
    expect(yellow.band).toBe("yellow")
    expect(yellow.slack).toBe(6)
    expect(yellow.toImprove).toBe(1)
    expect(simulateClaims(14).band).toBe("orange")
    expect(demoSentence(simulateClaims(23))).toBe("Você aguenta mais 1 reclamação antes de cair para vermelho.")
  })

  it("no vermelho mostra quantas precisam sair da conta", () => {
    const red = simulateClaims(DEMO_CLAIMS.max)
    expect(red.band).toBe("red")
    expect(red.slack).toBeNull()
    expect(demoSentence(red)).toBe("Para voltar ao laranja, 6 reclamações precisam sair da conta.")
    expect(demoSentence(simulateClaims(25))).toBe("Para voltar ao laranja, 1 reclamação precisa sair da conta.")
  })

  it("o que cada cor libera segue as regras do app", () => {
    expect(COLOR_PERKS.length).toBeGreaterThanOrEqual(4)
    const status = (band: Parameters<typeof perksFor>[0]) => perksFor(band).map((perk) => perk.status)
    expect(status("green")).toEqual(["on", "on", "on", "on"])
    expect(status("yellow")).toEqual(["partial", "on", "on", "off"])
    expect(status("orange")).toEqual(["off", "off", "off", "off"])
    expect(status("red")).toEqual(["off", "off", "off", "off"])
    expect(perksFor("green")[0].detail).toBe("até 50%")
    expect(perksFor("yellow")[0].detail).toBe("até 40%")
  })

  it("textos de apoio", () => {
    expect(formatPercent(0.045)).toBe("4,5%")
    expect(formatPercent(0.02)).toBe("2%")
    expect(thresholdsCheckedLabel()).toBe("outubro de 2026")
  })
})
