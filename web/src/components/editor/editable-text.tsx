"use client"

import { useCallback, useEffect, useRef, type CSSProperties } from "react"
import {
  Bold,
  Eraser,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from "lucide-react"
import { PRESET_COLORS } from "@/lib/constants"
import { sanitizeHtml } from "@/lib/sanitize"
import { useT } from "@/lib/i18n/client"
import type { MessageKey } from "@/lib/i18n/messages"

interface Props {
  html: string
  style: CSSProperties
  scale: number
  onCommit: (html: string, contentHeight: number) => void
}

/** `execCommand` is deprecated but is still the only API that edits a live selection in place. */
function exec(command: string, value?: string) {
  document.execCommand("styleWithCSS", false, "true")
  document.execCommand(command, false, value)
}

export function EditableText({ html, style, scale, onCommit }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const committed = useRef(false)
  const commitTimer = useRef<number | null>(null)
  /**
   * What the box is holding, kept up to date as it is typed into.
   *
   * The commit cannot read it back off the node, because the commit that matters happens
   * on the way out: React has already detached the node by the time an effect cleanup
   * runs, so `ref.current` is null at exactly the moment the last edit would be lost.
   */
  const latest = useRef<{ html: string; height: number } | null>(null)
  /** so the flush below calls the current commit rather than the first render's */
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  })

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.innerHTML = html
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [html])

  const snapshot = () => {
    const node = ref.current
    if (node) latest.current = { html: node.innerHTML, height: node.scrollHeight }
  }

  const commit = useCallback(() => {
    const value = latest.current
    // nothing was typed, so there is nothing to write back over what the element says
    if (committed.current || !value) return
    committed.current = true
    onCommitRef.current(sanitizeHtml(value.html), value.height)
  }, [])

  /**
   * Write back on the way out, not only when a blur settles.
   *
   * Editing hardly ever ends with a settled blur: clicking anywhere else takes the pointer
   * through a handler that clears `editingId`, and this box is gone before the deferred
   * commit can fire. Cancelling the pending timer and stopping there is what threw away
   * everything the user had just typed.
   */
  useEffect(() => {
    return () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current)
      commit()
    }
  }, [commit])

  /** Clicking a toolbar button blurs the editor; hold the commit until focus settles. */
  const deferBlur = () => {
    commitTimer.current = window.setTimeout(commit, 120)
  }
  const cancelBlur = () => {
    if (commitTimer.current) {
      window.clearTimeout(commitTimer.current)
      commitTimer.current = null
    }
  }

  const run = (command: string, value?: string) => {
    cancelBlur()
    ref.current?.focus()
    exec(command, value)
    snapshot()
  }

  return (
    <>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-editing-text
        style={{ ...style, outline: "none", cursor: "text", overflow: "visible" }}
        onBlur={deferBlur}
        onInput={snapshot}
        // While this box is open it owns its own pointer. The canvas clears `editingId` on
        // any pointer down that reaches it, so without this a click to place the caret read
        // as a click away and closed the editor on the first character.
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Escape") {
            e.preventDefault()
            ref.current?.blur()
          }
          const mod = e.metaKey || e.ctrlKey
          if (mod && e.key.toLowerCase() === "b") {
            e.preventDefault()
            exec("bold")
          }
          if (mod && e.key.toLowerCase() === "i") {
            e.preventDefault()
            exec("italic")
          }
          if (mod && e.key.toLowerCase() === "u") {
            e.preventDefault()
            exec("underline")
          }
        }}
        onPaste={(e) => {
          e.preventDefault()
          const html = e.clipboardData.getData("text/html")
          if (html) {
            // keep the formatting, but only what the sanitiser allows through
            document.execCommand("insertHTML", false, sanitizeHtml(html))
            return
          }
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"))
        }}
      />
      <InlineToolbar scale={scale} onCommand={run} onEnter={cancelBlur} />
    </>
  )
}

function InlineToolbar({
  scale,
  onCommand,
  onEnter,
}: {
  scale: number
  onCommand: (command: string, value?: string) => void
  onEnter: () => void
}) {
  const t = useT()
  const buttons: { icon: React.ReactNode; title: MessageKey; command: string }[] = [
    { icon: <Bold className="size-3.5" />, title: "editor.bold", command: "bold" },
    { icon: <Italic className="size-3.5" />, title: "editor.italic", command: "italic" },
    { icon: <Underline className="size-3.5" />, title: "editor.underline", command: "underline" },
    {
      icon: <Strikethrough className="size-3.5" />,
      title: "editor.strikethrough",
      command: "strikeThrough",
    },
    { icon: <Subscript className="size-3.5" />, title: "editor.subscript", command: "subscript" },
    {
      icon: <Superscript className="size-3.5" />,
      title: "editor.superscript",
      command: "superscript",
    },
    {
      icon: <List className="size-3.5" />,
      title: "editor.bulletList",
      command: "insertUnorderedList",
    },
    {
      icon: <ListOrdered className="size-3.5" />,
      title: "editor.numberedList",
      command: "insertOrderedList",
    },
  ]

  return (
    <div
      className="absolute left-0 flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md"
      style={{
        bottom: "100%",
        marginBottom: 6 / scale,
        transform: `scale(${1 / scale})`,
        transformOrigin: "bottom left",
        zIndex: 200,
      }}
      onMouseDown={(event) => {
        // keep the selection alive while a button is pressed
        event.preventDefault()
        event.stopPropagation()
        onEnter()
      }}
    >
      {buttons.map((button) => (
        <button
          key={button.command}
          title={t(button.title)}
          onClick={() => onCommand(button.command)}
          className="flex size-6 items-center justify-center rounded hover:bg-accent"
        >
          {button.icon}
        </button>
      ))}

      <ColorButton
        icon={<Palette className="size-3.5" />}
        title={t("editor.textColor")}
        onPick={(color) => onCommand("foreColor", color)}
      />
      <ColorButton
        icon={<Highlighter className="size-3.5" />}
        title={t("editor.highlight")}
        onPick={(color) => onCommand("hiliteColor", color)}
      />

      <button
        title={t("editor.link")}
        onClick={() => {
          const url = window.prompt(t("editor.linkPrompt"))
          if (url) onCommand("createLink", url)
          else onCommand("unlink")
        }}
        className="flex size-6 items-center justify-center rounded hover:bg-accent"
      >
        <Link2 className="size-3.5" />
      </button>
      <button
        title={t("editor.clearFormat")}
        onClick={() => onCommand("removeFormat")}
        className="flex size-6 items-center justify-center rounded hover:bg-accent"
      >
        <Eraser className="size-3.5" />
      </button>
    </div>
  )
}

function ColorButton({
  icon,
  title,
  onPick,
}: {
  icon: React.ReactNode
  title: string
  onPick: (color: string) => void
}) {
  return (
    <div className="group relative">
      <button
        title={title}
        className="flex size-6 items-center justify-center rounded hover:bg-accent"
      >
        {icon}
      </button>
      <div className="absolute left-0 top-full z-10 hidden grid-cols-6 gap-1 rounded-md border bg-popover p-1.5 shadow-md group-hover:grid">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onPick(color)}
            className="size-4 rounded-sm border"
            style={{ background: color }}
          />
        ))}
      </div>
    </div>
  )
}
