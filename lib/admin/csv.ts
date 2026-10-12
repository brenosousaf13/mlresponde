/** CSV para Excel em português (separador ";", BOM UTF-8) e sem fórmulas injetadas (puro, testado). */

export type CsvValue = string | number | boolean | null | undefined

/** Células que começam com = + - @ (ou tab/CR) viram texto: evita "CSV injection" ao abrir no Excel. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ""
  let text = typeof value === "number" ? String(value).replace(".", ",") : String(value)
  if (typeof value === "boolean") text = value ? "sim" : "não"
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(";"))
  return `\uFEFF${lines.join("\r\n")}\r\n`
}
