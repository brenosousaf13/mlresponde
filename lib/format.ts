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
  const sign = seconds < 0 ? -1 : 1
  const abs = Math.abs(seconds)
  if (abs < 60) return "agora"
  // Arredonda antes de escolher a unidade: 59,6 min vira "há 1 hora", não "há 60 minutos".
  const minutes = Math.round(abs / 60)
  if (minutes < 60) return relative.format(sign * minutes, "minute")
  const hours = Math.round(abs / 3600)
  if (hours < 24) return relative.format(sign * hours, "hour")
  const days = Math.round(abs / 86400)
  if (days < 30) return relative.format(sign * days, "day")
  return formatDate(value, "short")
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—"
  if (seconds < 60) return `${Math.round(seconds)} s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${(seconds / 3600).toFixed(1).replace(".", ",")} h`
}

const numberFormat = new Intl.NumberFormat("pt-BR")

/** 1234 → "1.234". */
export function formatNumber(value: number) {
  return numberFormat.format(value)
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: TIME_ZONE })

export function formatTime(value: string | Date) {
  return timeFormat.format(new Date(value))
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
})

/** Dia no fuso de São Paulo, no formato AAAA-MM-DD (para agrupar perguntas por dia). */
export function dayKey(value: string | Date) {
  return dayKeyFormat.format(new Date(value))
}

function previousDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** "Hoje", "Ontem" ou "Quinta-feira, 8 de outubro" (com o ano quando não for o ano atual). */
export function dayLabel(value: string | Date, now: Date = new Date()) {
  const key = dayKey(value)
  const today = dayKey(now)
  if (key === today) return "Hoje"
  if (key === previousDayKey(today)) return "Ontem"
  const text = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
    timeZone: TIME_ZONE,
  }).format(new Date(value))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Horário curto para listas agrupadas por dia: relativo hoje ("há 2 horas"), hora nos dias anteriores. */
export function listTime(value: string | Date, now: Date = new Date()) {
  return dayKey(value) === dayKey(now) ? timeAgo(value, now) : formatTime(value)
}
