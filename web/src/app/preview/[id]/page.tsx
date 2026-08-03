import { redirect } from "next/navigation"
import { currentUser } from "@/auth"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"
import { PreviewClient } from "./preview-client"

export async function generateMetadata() {
  return { title: translator(await getLocale())("preview.metaTitle") }
}

/**
 * Where a person watches a deck being written.
 *
 * The link an MCP tool hands back points here. It is read-only and it is the *same* deck
 * the editor opens — one document, one version counter — so what an agent writes appears
 * here within a poll, and what someone types in the editor appears here too.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // the deck API checks ownership on every call; this only saves a signed-out visitor from
  // watching the page mount and immediately fail
  if (!(await currentUser())) redirect(`/login?next=/preview/${id}`)

  return <PreviewClient deckId={id} />
}
