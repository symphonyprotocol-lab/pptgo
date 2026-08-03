import { headers } from "next/headers"
import Link from "next/link"
import { ArrowRight, KeyRound } from "lucide-react"
import { currentUser } from "@/auth"
import { SITE_SHELL, SiteHeader } from "@/components/site/site-header"
import { Wordmark } from "@/components/site/wordmark"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"
import type { MessageKey } from "@/lib/i18n/messages"

/**
 * The site measure, so the wordmark in the bar and the heading under it start on the same
 * vertical line. Prose is kept readable by `max-w-prose` on the paragraphs themselves
 * rather than by narrowing the page — the same thing the landing page's spec sheet does,
 * where the rules run the full measure and the text inside them does not.
 */
const SHELL = SITE_SHELL

export async function generateMetadata() {
  return { title: translator(await getLocale())("mcp.metaTitle") }
}

/**
 * The origin to print in the config snippets.
 *
 * `AUTH_URL` first, for the same reason the MCP server builds its preview links from it:
 * behind compose the container's own host name is `web:3000`, which is not an address the
 * reader can paste anywhere. The request is the fallback for a deployment that never set
 * it — which is every `npm run dev`, where the request host is exactly right.
 */
async function publicOrigin(): Promise<string> {
  const configured = process.env.AUTH_URL
  if (configured) return configured.replace(/\/+$/, "")

  const header = await headers()
  const host = header.get("x-forwarded-host") ?? header.get("host") ?? "localhost:3000"
  const proto = header.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

const TOOLS: { key: string; label: MessageKey; body: MessageKey }[] = [
  { key: "read", label: "mcp.toolsRead", body: "mcp.toolsReadBody" },
  { key: "write", label: "mcp.toolsWrite", body: "mcp.toolsWriteBody" },
  { key: "preview", label: "mcp.toolsPreview", body: "mcp.toolsPreviewBody" },
]

const TROUBLE: { key: string; label: MessageKey; body: MessageKey }[] = [
  { key: "401", label: "mcp.trouble401", body: "mcp.trouble401Body" },
  { key: "origin", label: "mcp.troubleOrigin", body: "mcp.troubleOriginBody" },
  { key: "tools", label: "mcp.troubleTools", body: "mcp.troubleToolsBody" },
]

/**
 * How to point an agent at this deployment.
 *
 * Public on purpose: someone deciding whether to sign up should be able to read what the
 * MCP side actually does first, and a self-hoster needs the endpoint before they have an
 * account on their own instance.
 */
export default async function McpGuidePage() {
  const t = translator(await getLocale())
  const [user, origin] = await Promise.all([currentUser(), publicOrigin()])
  const endpoint = `${origin}/api/mcp`

  return (
    <main className="flex-1 bg-background text-foreground">
      <SiteHeader user={user} />

      <div className={`py-12 lg:py-16 ${SHELL}`}>
        <div className="border-b border-foreground/20 pb-6">
          <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">
            {t("mcp.kicker")}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
            {t("mcp.heading")}
          </h1>
          <p className="mt-4 max-w-prose text-sm leading-[1.95] text-muted-foreground">
            {t("mcp.intro")}
          </p>
        </div>

        <Step n={1} title={t("mcp.step1")} body={t("mcp.step1Body")}>
          <Link
            href="/settings/tokens"
            className="inline-flex h-10 items-center gap-2 border border-border px-4 text-sm font-medium transition-colors hover:border-primary hover:bg-muted"
          >
            <KeyRound className="size-4" />
            {t("mcp.step1Cta")}
            <ArrowRight className="size-3.5" />
          </Link>
        </Step>

        <Step n={2} title={t("mcp.step2")} body={t("mcp.step2Body")}>
          <Snippet label={t("mcp.endpointLabel")} code={endpoint} />
        </Step>

        <Step n={3} title={t("mcp.step3")} body={t("mcp.step3Body")}>
          <div className="space-y-5">
            <Snippet
              label={t("mcp.claudeCode")}
              note={t("mcp.claudeCodeBody")}
              code={`claude mcp add --transport http pptgo ${endpoint} \\\n  --header "Authorization: Bearer pptgo_YOUR_TOKEN"`}
            />
            <Snippet
              label={t("mcp.json")}
              note={t("mcp.jsonBody")}
              code={`{
  "mcpServers": {
    "pptgo": {
      "type": "http",
      "url": "${endpoint}",
      "headers": {
        "Authorization": "Bearer pptgo_YOUR_TOKEN"
      }
    }
  }
}`}
            />
            <Snippet
              label={t("mcp.codex")}
              note={t("mcp.codexBody")}
              code={`export PPTGO_TOKEN=pptgo_YOUR_TOKEN\n\ncodex mcp add pptgo --url ${endpoint} \\\n  --bearer-token-env-var PPTGO_TOKEN`}
            />
            <Snippet
              label="~/.codex/config.toml"
              note={t("mcp.codexTomlBody")}
              code={`[mcp_servers.pptgo]
url = "${endpoint}"
bearer_token_env_var = "PPTGO_TOKEN"`}
            />
          </div>
        </Step>

        <Section heading={t("mcp.toolsHeading")} body={t("mcp.toolsBody")}>
          <dl className="divide-y divide-border border-y border-border">
            {TOOLS.map((row) => (
              <div
                key={row.key}
                className="grid gap-1.5 py-5 transition-colors hover:bg-card sm:grid-cols-[7rem_1fr] sm:gap-8"
              >
                <dt className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase sm:pt-1">
                  {t(row.label)}
                </dt>
                <dd className="text-sm leading-[1.95] text-muted-foreground">{t(row.body)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section heading={t("mcp.previewHeading")} body={t("mcp.previewBody")} />

        <Section heading={t("mcp.troubleHeading")}>
          <dl className="divide-y divide-border border-y border-border">
            {TROUBLE.map((row) => (
              <div key={row.key} className="grid gap-1.5 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <dt className="text-sm font-medium sm:pt-0.5">{t(row.label)}</dt>
                <dd className="text-sm leading-[1.95] text-muted-foreground">{t(row.body)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <footer className="border-t border-border">
        <div
          className={`flex flex-col gap-3 py-8 font-mono text-[11px] tracking-wider text-muted-foreground sm:flex-row sm:items-center sm:justify-between ${SHELL}`}
        >
          <Wordmark />
          <p>{t("site.footerNote")}</p>
        </div>
      </footer>
    </main>
  )
}

function Step({
  n,
  title,
  body,
  children,
}: {
  n: number
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10 border-b border-border pb-10">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
          {String(n).padStart(2, "0")}
        </span>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      </div>
      <p className="mt-3 max-w-prose text-sm leading-[1.95] text-muted-foreground">{body}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Section({
  heading,
  body,
  children,
}: {
  heading: string
  body?: string
  children?: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold tracking-tight">{heading}</h2>
      {body && (
        <p className="mt-3 max-w-prose text-sm leading-[1.95] text-muted-foreground">{body}</p>
      )}
      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}

/** A labelled block of something to copy. Scrolls itself rather than the page. */
function Snippet({ label, note, code }: { label: string; note?: string; code: string }) {
  return (
    <div className="border border-border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          <span className="size-1.5 rounded-full bg-primary" />
          {label}
        </span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-[1.9] text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  )
}
