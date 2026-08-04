import type { ChartElement } from "@/types/slides"

/** Chart data is edited as a small TSV block — quick to retype, and paste-friendly from a spreadsheet. */
export function serializeChart(el: ChartElement): string {
  const header = ["", ...el.data.series.map((s) => s.name)].join("\t")
  const rows = el.data.categories.map((category, i) =>
    [category, ...el.data.series.map((s) => s.values[i] ?? 0)].join("\t"),
  )
  return [header, ...rows].join("\n")
}

export function parseChart(text: string): ChartElement["data"] | null {
  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length)
  if (lines.length < 2) return null

  const split = (line: string) => line.split(/\t|\s{2,}|,/).map((cell) => cell.trim())
  const header = split(lines[0])
  const names = header.slice(1)
  if (!names.length) return null

  const categories: string[] = []
  const series = names.map((name) => ({ name, values: [] as number[] }))

  for (const line of lines.slice(1)) {
    const cells = split(line)
    categories.push(cells[0] ?? "")
    names.forEach((_, i) => {
      const value = Number(cells[i + 1])
      series[i].values.push(Number.isFinite(value) ? value : 0)
    })
  }
  return { categories, series }
}
