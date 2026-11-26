const TEN_MINUTES = 10 * 60_000
export const RECOVERY_429_DEFERRAL_CAP = 5_000

/**
 * Adiamento best-effort por instância, inclusive para reclamações ainda sem recovery_returns.
 * Outra instância (ou uma reiniciada) pode reler antes. Não muda a fila nem persiste no banco.
 */
export class Recovery429Deferrals {
  private readonly untilByClaim = new Map<number, number>()

  constructor(private readonly random: () => number = () => Math.random()) {}

  prune(now: number): void {
    for (const [claimId, until] of this.untilByClaim) {
      if (until <= now) this.untilByClaim.delete(claimId)
    }
  }

  defer(claimId: number, now: number): void {
    this.prune(now)
    // Reinserir deixa a entrada renovada por último; ao lotar, sai a mais antiga.
    this.untilByClaim.delete(claimId)
    if (this.untilByClaim.size >= RECOVERY_429_DEFERRAL_CAP) {
      this.untilByClaim.delete(this.untilByClaim.keys().next().value!)
    }
    this.untilByClaim.set(claimId, now + TEN_MINUTES * (1 + 0.5 * this.random()))
  }

  isDeferred(claimId: number, now: number): boolean {
    const until = this.untilByClaim.get(claimId)
    if (until === undefined) return false
    if (until <= now) {
      this.untilByClaim.delete(claimId)
      return false
    }
    return true
  }

  get size(): number {
    return this.untilByClaim.size
  }
}
