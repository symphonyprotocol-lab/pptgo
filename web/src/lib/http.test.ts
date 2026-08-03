import { describe, expect, it } from "vitest"
import { readBytes, readJsonObject } from "./http"

/** A request whose body arrives in chunks, so the size guard is exercised mid-stream. */
function chunked(chunks: string[], headers: Record<string, string> = {}): Request {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  // `duplex` is required by fetch for a streaming body
  return new Request("http://test/x", {
    method: "POST",
    body,
    headers,
    // @ts-expect-error -- not in the DOM lib's RequestInit yet
    duplex: "half",
  })
}

const json = (value: unknown) =>
  new Request("http://test/x", { method: "POST", body: JSON.stringify(value) })

describe("readBytes", () => {
  it("returns the whole body when it fits", async () => {
    const result = await readBytes(chunked(["abc", "def"]), 100)
    expect(result.ok).toBe(true)
    expect(result.ok && new TextDecoder().decode(result.value)).toBe("abcdef")
  })

  it("rejects a body that outgrows the limit part way through", async () => {
    // no Content-Length on a streamed body, so only the running total can catch this
    const result = await readBytes(chunked(["12345", "67890"]), 6)
    expect(result).toEqual({ ok: false, reason: "too-large" })
  })

  it("rejects on a Content-Length over the limit without reading the body", async () => {
    const result = await readBytes(chunked(["x"], { "content-length": "999999" }), 10)
    expect(result).toEqual({ ok: false, reason: "too-large" })
  })

  it("accepts an empty body", async () => {
    const result = await readBytes(new Request("http://test/x", { method: "POST" }), 10)
    expect(result.ok && result.value.byteLength).toBe(0)
  })
})

describe("readJsonObject", () => {
  it("parses an object", async () => {
    const result = await readJsonObject(json({ title: "hi" }), 1000)
    expect(result).toEqual({ ok: true, value: { title: "hi" } })
  })

  it("rejects malformed JSON", async () => {
    const request = new Request("http://test/x", { method: "POST", body: "{oh no" })
    expect(await readJsonObject(request, 1000)).toEqual({ ok: false, reason: "malformed" })
  })

  // the routes destructure the result, and `body.value.deck` on an array or a number is
  // not a type error at runtime — it is `undefined`, which reads as "no deck sent"
  it("rejects JSON that is not an object", async () => {
    expect(await readJsonObject(json([1, 2]), 1000)).toEqual({ ok: false, reason: "malformed" })
    expect(await readJsonObject(json("nope"), 1000)).toEqual({ ok: false, reason: "malformed" })
    expect(await readJsonObject(json(null), 1000)).toEqual({ ok: false, reason: "malformed" })
  })

  it("reports an oversized body as too-large rather than malformed", async () => {
    const big = json({ pad: "x".repeat(500) })
    expect(await readJsonObject(big, 50)).toEqual({ ok: false, reason: "too-large" })
  })
})
