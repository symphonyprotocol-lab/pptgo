import type { Locale } from "./locale"

/**
 * Every user-facing string, in both languages.
 *
 * Chinese is written out rather than generated from the English, because this app was
 * authored in Chinese — the Chinese column is the original wording and the English is the
 * translation, not the other way round.
 *
 * Keys are grouped by where they appear. The two records are checked against each other
 * by the type below, so an English string added without its Chinese counterpart (or a key
 * deleted from one side) is a compile error rather than a blank label at runtime.
 */
const zh = {
  // ── site chrome ────────────────────────────────────────────────────────────
  "site.tagline": "在线幻灯片编辑器",
  "site.openEditor": "打开编辑器",
  "site.myDecks": "我的演示文稿",
  "site.openMyDecks": "打开我的演示文稿",
  "site.startWithoutSignIn": "不登录，直接开一份",
  "site.storageNote": "登录后稿子存进你自己的对象存储；不登录则留在本机浏览器，随时可导出备份。",
  "site.footerNote": "浏览器里的幻灯片编辑器 · 可自托管",
  "site.github": "在 GitHub 上查看源码",
  "site.signInWithGoogle": "使用 Google 账号登录",
  "site.signingIn": "正在跳转 Google…",

  // ── theme + language switches ──────────────────────────────────────────────
  "theme.group": "配色方案",
  "theme.system": "跟随系统",
  "theme.light": "浅色",
  "theme.dark": "深色",
  "lang.group": "语言",
  "lang.zh": "中文",
  "lang.en": "English",

  // ── landing: spec sheet ────────────────────────────────────────────────────
  "spec.heading": "规格",
  "spec.kicker": "What it does",
  "spec.elements": "元素",
  "spec.elements.body":
    "文字 · 图片 · 形状（28 种预设几何，另有自由绘）· 线条 · 表格 · 图表（柱 / 条 / 折线 / 面积 / 散点 / 饼 / 环 / 雷达）· 视频 · 音频 · LaTeX 公式",
  "spec.canvas": "画布",
  "spec.canvas.body":
    "拖拽 · 八向缩放（带旋转补偿）· 旋转 · 框选与多选 · 成组后整体缩放旋转 · 吸附参考线 · 网格 · 标尺 · 缩放 · 右键菜单 · 锁定 · 双击就地改字与改表格单元格",
  "spec.editing": "编辑",
  "spec.editing.body":
    "分类型属性面板 · 图层面板 · 层级 · 对齐 · 等距分布 · 格式刷 · 超链接 · 段内富文本（加粗 / 颜色 / 高亮 / 列表 / 链接 / 上下标）· 图片裁剪与着色 · 形状渐变 · 阴影 · 表格合并拆分 · 图表数据编辑 · 撤销重做 · 系统剪贴板 · 查找替换",
  "spec.slides": "页面",
  "spec.slides.body":
    "缩略图 · 拖拽排序 · 复制删除 · 分节 · 背景（纯色 / 渐变 / 图片，可应用到全部）· 演讲者备注 · 切换动画 · 逐元素进出场动画",
  "spec.present": "放映",
  "spec.present.body":
    "动画分步 · 切换 · 画笔 / 荧光笔 / 橡皮 / 激光笔 / 黑板 · 计时器 · 自动放映 · 缩略图导航 · 备注 · 全屏 · 音视频播放",
  "spec.io": "进出",
  "spec.io.body":
    "导入 PPTX 与 JSON；导出 PPTX（原生可编辑文本框，不是截图）、PNG、PDF、JSON",
  "spec.mobile": "移动端",
  "spec.mobile.body":
    "画布全程走 pointer 事件，鼠标、触屏、手写笔同一条代码路径 · 双指捏合缩放 · 侧栏收进抽屉 · 放映左右滑动翻页",
  "spec.account": "账号",
  "spec.account.body":
    "Google 登录后每次自动保存写进对象存储，控制台按修改时间排列并带首页缩略图 · 不登录也能用，稿子存在本机浏览器里",

  // ── landing: self-hosting ──────────────────────────────────────────────────
  "host.heading": "自己部署",
  "host.body":
    "一份 compose 起三个服务：Next.js、PostgreSQL，以及 S3 兼容的 rustfs。演示文稿正文是对象存储里的一个 JSON，标题、页数和修改时间是 Postgres 里的一行，两者都在你自己的机器上，没有第三方服务参与。",
  "host.reference": "编辑器交互参考 PPTist",
  "host.terminal": "terminal",
  // ── landing: the draggable demo slide ──────────────────────────────────────
  "demo.hintIdle": "拖一下、拉一下、转一下",
  "demo.hintTouched": "就是这样——这块画布跑的是编辑器本身",
  "demo.noSelection": "未选中",
  "demo.reset": "复位",
  "demo.element": "幻灯片元素，方向键可移动",
  "demo.kicker": "PPTGo · 在线幻灯片编辑器",
  "demo.titleLine1": "一整套幻灯片,",
  "demo.titleLine2": "在浏览器里做完",
  "demo.body": "拖拽定位、双击改字、右侧调样式。导出的是原生可编辑的 PPTX，不是一张张图片。",
} as const

const en: Record<keyof typeof zh, string> = {
  "site.tagline": "Slide editor in the browser",
  "site.openEditor": "Open editor",
  "site.myDecks": "My decks",
  "site.openMyDecks": "Open my decks",
  "site.startWithoutSignIn": "Start one without signing in",
  "site.storageNote":
    "Sign in and your decks go to your own object storage; stay signed out and they stay in this browser, exportable any time.",
  "site.footerNote": "A slide editor in the browser · self-hostable",
  "site.github": "View the source on GitHub",
  "site.signInWithGoogle": "Sign in with Google",
  "site.signingIn": "Redirecting to Google…",

  "theme.group": "Colour scheme",
  "theme.system": "Match system",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "lang.group": "Language",
  "lang.zh": "中文",
  "lang.en": "English",

  "spec.heading": "Spec",
  "spec.kicker": "What it does",
  "spec.elements": "Elements",
  "spec.elements.body":
    "Text · images · shapes (28 preset geometries, plus freehand) · lines · tables · charts (column / bar / line / area / scatter / pie / doughnut / radar) · video · audio · LaTeX formulas",
  "spec.canvas": "Canvas",
  "spec.canvas.body":
    "Drag · resize from eight handles (rotation-compensated) · rotate · marquee and multi-select · scale and rotate a whole group · snapping guides · grid · rulers · zoom · context menu · lock · double-click to edit text and table cells in place",
  "spec.editing": "Editing",
  "spec.editing.body":
    "Per-type property panel · layer panel · z-order · align · distribute · format painter · hyperlinks · inline rich text (bold / colour / highlight / lists / links / super- and subscript) · image crop and tint · shape gradients · shadows · merge and split table cells · chart data editing · undo and redo · system clipboard · find and replace",
  "spec.slides": "Slides",
  "spec.slides.body":
    "Thumbnails · drag to reorder · duplicate and delete · sections · backgrounds (solid / gradient / image, applicable to all) · speaker notes · transitions · per-element entrance and exit animations",
  "spec.present": "Presenting",
  "spec.present.body":
    "Step through animations · transitions · pen / highlighter / eraser / laser / blackboard · timer · autoplay · thumbnail navigation · notes · fullscreen · audio and video playback",
  "spec.io": "In and out",
  "spec.io.body":
    "Import PPTX and JSON; export PPTX (real editable text boxes, not screenshots), PNG, PDF and JSON",
  "spec.mobile": "Mobile",
  "spec.mobile.body":
    "The canvas runs on pointer events throughout, so mouse, touch and stylus share one code path · pinch to zoom · side panels fold into drawers · swipe to change slides while presenting",
  "spec.account": "Accounts",
  "spec.account.body":
    "Sign in with Google and every autosave writes to object storage; the dashboard lists decks by last edit with a thumbnail of the first slide · it also works signed out, with decks kept in this browser",

  "host.heading": "Self-hosting",
  "host.body":
    "One compose file brings up three services: Next.js, PostgreSQL, and rustfs for S3-compatible storage. A deck's contents are a JSON object in storage; its title, slide count and last-edited time are a row in Postgres. Both live on your machine, with no third-party service involved.",
  "host.reference": "Editor interactions modelled on PPTist",
  "host.terminal": "terminal",
  "demo.hintIdle": "Drag it, resize it, spin it",
  "demo.hintTouched": "That's it — this canvas is the editor itself",
  "demo.noSelection": "Nothing selected",
  "demo.reset": "Reset",
  "demo.element": "Slide element, arrow keys move it",
  "demo.kicker": "PPTGo · slide editor in the browser",
  "demo.titleLine1": "A whole deck,",
  "demo.titleLine2": "finished in the browser",
  "demo.body": "Drag to place, double-click to retype, style it on the right. What comes out is a real editable PPTX, not a stack of pictures.",
}

export type MessageKey = keyof typeof zh

export const messages: Record<Locale, Record<MessageKey, string>> = { zh, en }
