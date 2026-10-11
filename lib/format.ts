const TIME_ZONE = "America/Sao_Paulo"

export function formatDate(value: string | Date, style: "long" | "short" = "long") {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: style, timeZone: TIME_ZONE }).format(
    new Date(value)
  )
}

export function pluralize(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
