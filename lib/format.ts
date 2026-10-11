const TIME_ZONE = "America/Sao_Paulo"

export function formatDate(value: string | Date, style: "long" | "short" = "long") {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: style, timeZone: TIME_ZONE }).format(
    new Date(value)
  )
}

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(value))
}

export function pluralize(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" })

export function timeAgo(value: string | Date, now: Date = new Date()) {
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return "agora"
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute")
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour")
  if (abs < 86400 * 30) return relative.format(Math.round(seconds / 86400), "day")
  return formatDate(value, "short")
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—"
  if (seconds < 60) return `${Math.round(seconds)} s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${(seconds / 3600).toFixed(1).replace(".", ",")} h`
}
