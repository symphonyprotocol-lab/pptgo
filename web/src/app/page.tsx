import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { currentUser } from "@/auth"
import { signInWithGoogle } from "@/app/actions/auth"
import { GithubLink } from "@/components/site/github-link"
import { GoogleButton } from "@/components/site/google-button"
import { LiveSlide } from "@/components/site/live-slide"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { Wordmark } from "@/components/site/wordmark"

/**
 * One measure for the whole page. The rules between sections run the full width of the
 * viewport, so any section whose content sat on a different measure made those rules
 * read as misalignment rather than as structure — the wordmark, the slide and the spec
 * rows all have to start on the same vertical line.
 */
const SHELL = "mx-auto w-full max-w-6xl px-5 sm:px-8"

/**
 * A spec sheet rather than feature cards. Six equal tiles, each with a numeral, a bold
 * line and three lines of body, is the layout of a slide — which is a strange thing for a
 * slide tool's homepage to be. This reads like the back of a manual instead: dense, ruled,
 * scannable, and it fits far more of what the editor actually does.
 */
const SPEC: { key: string; label: string; body: string }[] = [
  {
    key: "elements",
    label: "元素",
    body: "文字 · 图片 · 形状（28 种预设几何，另有自由绘）· 线条 · 表格 · 图表（柱 / 条 / 折线 / 面积 / 散点 / 饼 / 环 / 雷达）· 视频 · 音频 · LaTeX 公式",
  },
  {
    key: "canvas",
    label: "画布",
    body: "拖拽 · 八向缩放（带旋转补偿）· 旋转 · 框选与多选 · 成组后整体缩放旋转 · 吸附参考线 · 网格 · 标尺 · 缩放 · 右键菜单 · 锁定 · 双击就地改字与改表格单元格",
  },
  {
    key: "editing",
    label: "编辑",
    body: "分类型属性面板 · 图层面板 · 层级 · 对齐 · 等距分布 · 格式刷 · 超链接 · 段内富文本（加粗 / 颜色 / 高亮 / 列表 / 链接 / 上下标）· 图片裁剪与着色 · 形状渐变 · 阴影 · 表格合并拆分 · 图表数据编辑 · 撤销重做 · 系统剪贴板 · 查找替换",
  },
  {
    key: "slides",
    label: "页面",
    body: "缩略图 · 拖拽排序 · 复制删除 · 分节 · 背景（纯色 / 渐变 / 图片，可应用到全部）· 演讲者备注 · 切换动画 · 逐元素进出场动画",
  },
  {
    key: "present",
    label: "放映",
    body: "动画分步 · 切换 · 画笔 / 荧光笔 / 橡皮 / 激光笔 / 黑板 · 计时器 · 自动放映 · 缩略图导航 · 备注 · 全屏 · 音视频播放",
  },
  {
    key: "io",
    label: "进出",
    body: "导入 PPTX 与 JSON；导出 PPTX（原生可编辑文本框，不是截图）、PNG、PDF、JSON",
  },
  {
    key: "mobile",
    label: "移动端",
    body: "画布全程走 pointer 事件，鼠标、触屏、手写笔同一条代码路径 · 双指捏合缩放 · 侧栏收进抽屉 · 放映左右滑动翻页",
  },
  {
    key: "account",
    label: "账号",
    body: "Google 登录后每次自动保存写进对象存储，控制台按修改时间排列并带首页缩略图 · 不登录也能用，稿子存在本机浏览器里",
  },
]

export default async function Home() {
  const user = await currentUser()

  return (
    <main className="flex-1 bg-background text-foreground">
      {/* the bar is the app's own chrome height, not a marketing header */}
      <header className="border-b border-border">
        <div className={`flex h-14 items-center justify-between gap-4 ${SHELL}`}>
          <div className="flex items-baseline gap-4">
            <Wordmark />
            <span className="hidden font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase sm:block">
              在线幻灯片编辑器
            </span>
          </div>
          <nav className="flex items-center gap-3 sm:gap-5">
            {/* the two icon controls share a size and a rule, so they read as one cluster */}
            <div className="flex items-center gap-2">
              <GithubLink />
              <ThemeToggle />
            </div>
            <Link
              href="/editor"
              className="hidden font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:text-primary sm:block"
            >
              打开编辑器
            </Link>
            {/* on a phone the bar cannot hold the mark, the controls and a filled button
                without wrapping — and the same call to action is one screen down at full
                width, so this copy of it is the one that goes */}
            <div className="hidden sm:block">
              {user ? (
                <Link
                  href="/dashboard"
                  className="inline-flex h-8 items-center gap-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-all hover:shadow-[0_0_24px_-4px_var(--volt)]"
                >
                  我的演示文稿
                  <ArrowRight className="size-3" />
                </Link>
              ) : (
                <form action={signInWithGoogle}>
                  <input type="hidden" name="next" value="/dashboard" />
                  <GoogleButton className="h-8 w-auto gap-2 px-3 text-xs" />
                </form>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* ── the slide is the hero: the headline is an element you can drag ──── */}
      <section className="relative">
        <div className="stage-glow pointer-events-none absolute inset-0" />
        <div className="hairline-grid pointer-events-none absolute inset-0" />

        <div className={`relative pt-8 pb-12 lg:pt-10 ${SHELL}`}>
          {/* a 16:9 sheet at full width is 648px tall on a wide screen, which would push
              everything else off a laptop display — so it is also capped by the height
              left over, the same fit the editor's own canvas does */}
          <LiveSlide style={{ maxWidth: "calc((100dvh - 19rem) * 16 / 9)" }} />

          <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {user ? (
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 items-center justify-center gap-2 border border-primary bg-primary px-6 text-base font-medium text-primary-foreground transition-all hover:-translate-y-px hover:shadow-[0_0_32px_-4px_var(--volt)]"
                >
                  打开我的演示文稿
                  <ArrowRight className="size-4" />
                </Link>
              ) : (
                <form action={signInWithGoogle}>
                  <input type="hidden" name="next" value="/dashboard" />
                  <GoogleButton size="large" className="w-full px-6 sm:w-auto" />
                </form>
              )}
              <Link
                href="/editor"
                className="inline-flex h-12 items-center justify-center gap-2 border border-border px-6 text-base font-medium transition-colors hover:border-foreground/40 hover:bg-muted"
              >
                不登录，直接开一份
              </Link>
            </div>

            <p className="max-w-sm font-mono text-[11px] leading-relaxed text-muted-foreground">
              登录后稿子存进你自己的对象存储；不登录则留在本机浏览器，随时可导出备份。
            </p>
          </div>
        </div>
      </section>

      {/* ── spec sheet ───────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className={SHELL}>
          <div className="flex items-baseline justify-between gap-4 py-6">
            <h2 className="text-lg font-bold tracking-tight">规格</h2>
            <span className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground uppercase">
              What it does
            </span>
          </div>

          <dl className="divide-y divide-border border-y border-border">
            {SPEC.map((row) => (
              <div
                key={row.key}
                className="group grid gap-1.5 py-5 transition-colors hover:bg-card sm:grid-cols-[9rem_1fr] sm:gap-8"
              >
                <dt className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase sm:pt-1">
                  {row.label}
                </dt>
                <dd className="text-sm leading-[1.95] text-muted-foreground">{row.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── self-hosting ─────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className={`grid gap-8 py-14 lg:grid-cols-[1fr_1.1fr] lg:gap-16 ${SHELL}`}>
          <div>
            <h2 className="text-lg font-bold tracking-tight">自己部署</h2>
            <p className="mt-4 text-sm leading-[1.9] text-muted-foreground">
              一份 compose 起三个服务：Next.js、PostgreSQL，以及 S3 兼容的 rustfs。
              演示文稿正文是对象存储里的一个 JSON，标题、页数和修改时间是 Postgres 里的一行，
              两者都在你自己的机器上，没有第三方服务参与。
            </p>
            <a
              href="https://github.com/pipipi-pikachu/PPTist"
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 border-b border-border pb-0.5 text-sm transition-colors hover:border-primary hover:text-primary"
            >
              编辑器交互参考 PPTist
              <ArrowRight className="size-3.5" />
            </a>
          </div>

          <div className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
              <span className="size-1.5 rounded-full bg-primary" />
              terminal
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-[1.9] text-foreground">
              <code>
                <span className="text-muted-foreground">$ </span>cp .env.example .env
                {"\n"}
                <span className="text-muted-foreground">$ </span>docker compose up -d
                {"\n\n"}
                <span className="text-muted-foreground">
                  {"# web       → :3000\n"}
                  {"# postgres  → :5433\n"}
                  {"# rustfs    → :9100 / :9101"}
                </span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div
          className={`flex flex-col gap-3 py-8 font-mono text-[11px] tracking-wider text-muted-foreground sm:flex-row sm:items-center sm:justify-between ${SHELL}`}
        >
          <Wordmark />
          <p>浏览器里的幻灯片编辑器 · 可自托管</p>
        </div>
      </footer>
    </main>
  )
}
