import { redirect } from "next/navigation"
import { currentUser } from "@/auth"
import { EditorClient } from "../editor-client"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

export async function generateMetadata() {
  return { title: translator(await getLocale())("editor.metaTitle") }
}

export default async function CloudEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // the deck API checks ownership on every call; this only saves a signed-out visitor
  // from watching the editor mount and immediately fail
  if (!(await currentUser())) redirect(`/login?next=/editor/${id}`)

  return <EditorClient deckId={id} />
}
