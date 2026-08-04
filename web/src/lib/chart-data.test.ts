import { describe, expect, it } from "vitest"
import { parseChart, serializeChart } from "./chart-data"
import type { ChartElement } from "@/types/slides"

const chart = (data: ChartElement["data"]) => ({ data }) as ChartElement

describe("chart data", () => {
  it("round-trips through the TSV block", () => {
    const data = {
      categories: ["Q1", "Q2"],
      series: [
        { name: "North", values: [1, 2] },
        { name: "South", values: [3, 4] },
      ],
    }
    expect(parseChart(serializeChart(chart(data)))).toEqual(data)
  })

  it("accepts what a spreadsheet or a keyboard actually produces", () => {
    // commas and runs of spaces separate cells too, so pasted CSV and hand-typed columns
    // both land as data rather than as one long category name
    expect(parseChart("\tA\nQ1, 5\nQ2   7")).toEqual({
      categories: ["Q1", "Q2"],
      series: [{ name: "A", values: [5, 7] }],
    })
  })

  it("reads a missing or non-numeric value as zero rather than NaN", () => {
    expect(parseChart("\tA\tB\nQ1\t5\nQ2\t-\t8")).toEqual({
      categories: ["Q1", "Q2"],
      series: [
        { name: "A", values: [5, 0] },
        { name: "B", values: [0, 8] },
      ],
    })
  })

  it("refuses text that is not a table, so half-typed input never wipes a chart", () => {
    expect(parseChart("")).toBeNull()
    // a header on its own describes no categories
    expect(parseChart("\tA\tB")).toBeNull()
    // and a table with no series columns describes no numbers
    expect(parseChart("\nQ1\nQ2")).toBeNull()
  })
})
