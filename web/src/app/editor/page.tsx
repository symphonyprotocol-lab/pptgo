import { EditorClient } from "./editor-client"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

export async function generateMetadata() {
  return { title: translator(await getLocale())("editor.metaTitle") }
}

export default function EditorPage() {
  return <EditorClient />
}
