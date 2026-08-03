import "server-only"

/**
 * Reading a request body.
 *
 * `request.json()` and `request.arrayBuffer()` buffer whatever arrives before anyone gets
 * to look at it, so a size check written after the parse is not a limit — it is a report
 * on how much memory was already spent. Both readers below count bytes as they arrive and
 * stop at the ceiling, which is what makes the ceiling real.
 */

export type BodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "too-large" | "malformed" }

const TOO_LARGE = { ok: false, reason: "too-large" } as const
const MALFORMED = { ok: false, reason: "malformed" } as const

/**
 * The raw body, capped at `maxBytes`.
 *
 * `Content-Length` is checked first because it is free, but it is a claim rather than a
 * fact — it can be absent on a chunked body and wrong on any body — so the running total
 * during the read is what actually enforces the limit.
 */
export async function readBytes(
  request: Request,
  maxBytes: number,
): Promise<BodyResult<Uint8Array>> {
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) return TOO_LARGE

  const reader = request.body?.getReader()
  if (!reader) return { ok: true, value: new Uint8Array(0) }

  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        // stop the sender rather than draining a body we have already rejected
        await reader.cancel().catch(() => {})
        return TOO_LARGE
      }
      chunks.push(value)
    }
  } catch {
    return MALFORMED
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, value: body }
}

/** The body parsed as a JSON object, capped at `maxBytes`. Arrays and scalars are malformed. */
export async function readJsonObject(
  request: Request,
  maxBytes: number,
): Promise<BodyResult<Record<string, unknown>>> {
  const body = await readBytes(request, maxBytes)
  if (!body.ok) return body

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body.value))
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return MALFORMED
    return { ok: true, value: parsed as Record<string, unknown> }
  } catch {
    return MALFORMED
  }
}
