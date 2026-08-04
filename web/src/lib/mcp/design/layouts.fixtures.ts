import type { LayoutId, LayoutSpec } from "./layouts"

/**
 * One filled-in example of every page type, in both scripts.
 *
 * Chinese matters here rather than being decoration: a full-width glyph is twice a Latin
 * letter, so a slot that comfortably holds an English heading holds half as much Chinese.
 * Every fitting decision in the layouts is one that could be right in one script and wrong
 * in the other, and a fixture set in only one of them would never say so.
 */
const IMAGE = "https://example.test/photo.jpg"

const CHART = {
  chartType: "column" as const,
  categories: ["Q1", "Q2", "Q3", "Q4"],
  series: [{ name: "Revenue", values: [12, 19, 24, 31] }],
}

export const ENGLISH: Record<LayoutId, LayoutSpec> = {
  cover: {
    layout: "cover",
    title: "Rebuilding onboarding for the enterprise tier",
    subtitle: "What changed, what it cost, and what we would do again",
    meta: "Platform team · March 2026",
  },
  agenda: {
    layout: "agenda",
    title: "What we will cover",
    items: [
      "Where the funnel leaks today",
      "The three changes we shipped",
      "Results after ninety days",
      "What we are asking for",
      "Risks we are carrying",
      "Timeline to the next review",
    ],
  },
  section: { layout: "section", title: "Where the funnel leaks", number: "01", kicker: "Diagnosis" },
  statement: {
    layout: "statement",
    text: "Two thirds of the accounts that churn never finish the first invitation flow.",
    attribution: "Product analytics, rolling 12 months",
  },
  bullets: {
    layout: "bullets",
    title: "Three changes we shipped",
    kicker: "Q1 delivery",
    points: [
      "Invitations now resolve to a workspace before the account is created, which removes the empty-state screen entirely.",
      "SSO discovery runs on the email domain rather than waiting for an admin to configure it.",
      "The setup checklist is five steps rather than eleven, and four of them are now optional.",
    ],
  },
  "two-column": {
    layout: "two-column",
    title: "Before and after the invitation change",
    left: {
      heading: "How it worked",
      body: "An invited user created an account, landed in an empty workspace, and had to ask the person who invited them for a link. Roughly a third never came back.",
    },
    right: {
      heading: "How it works now",
      body: "The invitation carries the workspace. The first screen after sign-up is the team's actual content, and the inviter is notified rather than chased.",
    },
  },
  cards: {
    layout: "cards",
    title: "Three pillars of the programme",
    cards: [
      { heading: "Reduce friction", body: "Fewer required steps before a user sees something worth looking at." },
      { heading: "Prove value early", body: "Real data in the workspace within the first session, not after import." },
      { heading: "Close the loop", body: "Tell the person who invited them that the invitation worked." },
    ],
  },
  kpis: {
    layout: "kpis",
    title: "Ninety days after launch",
    kpis: [
      { value: "-31%", label: "Drop-off before first workspace", note: "vs. the quarter before" },
      { value: "4.2d", label: "Median time to first shared document", note: "was 11 days" },
      { value: "+18%", label: "Seats activated per account", note: "same acquisition spend" },
    ],
  },
  "chart-focus": {
    layout: "chart-focus",
    title: "Revenue held through the migration",
    chart: CHART,
    takeaway: "The dip everyone expected in Q2 did not arrive; growth resumed a quarter early.",
  },
  "chart-plus-text": {
    layout: "chart-plus-text",
    title: "Where the growth came from",
    chart: CHART,
    points: [
      "Expansion within existing accounts, not new logos.",
      "The enterprise tier alone accounts for two thirds of it.",
      "Self-serve revenue is flat and has been for three quarters.",
    ],
  },
  "image-full": {
    layout: "image-full",
    image: IMAGE,
    title: "The workspace on day one",
    subtitle: "What an invited user sees in the first ten seconds",
  },
  "image-split": {
    layout: "image-split",
    title: "One screen carries the whole change",
    image: IMAGE,
    body: "Everything a new user needed to be told is now shown instead.",
    points: ["No empty state", "No configuration before value", "The inviter is told it worked"],
  },
  timeline: {
    layout: "timeline",
    title: "How the programme runs",
    steps: [
      { when: "Q1", what: "Invitation flow rebuilt and shipped behind a flag" },
      { when: "Q2", what: "SSO discovery, then a staged rollout to the enterprise tier" },
      { when: "Q3", what: "Checklist reduction and the first full measurement window" },
      { when: "Q4", what: "Migration of the remaining self-serve accounts" },
    ],
  },
  comparison: {
    layout: "comparison",
    title: "Rebuild or patch",
    left: {
      heading: "Patch the current flow",
      points: ["Ships in three weeks", "Leaves the empty state in place", "No migration risk"],
    },
    right: {
      heading: "Rebuild the flow",
      points: ["Ships in a quarter", "Removes the empty state entirely", "Needs a staged rollout"],
    },
  },
  matrix: {
    layout: "matrix",
    title: "Where to spend the next quarter",
    axes: { x: "Effort", y: "Impact" },
    quadrants: [
      { heading: "Do now", body: "Invitation links and SSO discovery." },
      { heading: "Plan properly", body: "The full self-serve migration." },
      { heading: "Fill gaps with", body: "Checklist copy and empty-state art." },
      { heading: "Decline", body: "The admin console redesign, again." },
    ],
  },
  table: {
    layout: "table",
    title: "Cost of each option",
    rows: [
      ["Option", "Engineering", "Ships", "Risk"],
      ["Patch", "3 weeks", "This quarter", "Low"],
      ["Rebuild", "1 quarter", "Next quarter", "Medium"],
      ["Do nothing", "—", "—", "High"],
    ],
    caption: "Engineering estimates are two-person-team weeks.",
  },
  quote: {
    layout: "quote",
    text: "We did not have an onboarding problem. We had a problem that only showed up during onboarding.",
    attribution: "Head of Platform, retrospective",
  },
  closing: {
    layout: "closing",
    title: "Thank you",
    subtitle: "Questions, and the migration plan in detail",
    meta: "platform@example.com",
  },
}

export const CHINESE: Record<LayoutId, LayoutSpec> = {
  cover: {
    layout: "cover",
    title: "为企业版重建新用户引导流程",
    subtitle: "改了什么、代价是什么、哪些做法值得再来一次",
    meta: "平台团队 · 2026 年 3 月",
  },
  agenda: {
    layout: "agenda",
    title: "本次内容",
    items: ["漏斗目前在哪里流失", "我们上线的三项改动", "九十天后的结果", "我们的请求", "正在承担的风险", "下次评审的时间线"],
  },
  section: { layout: "section", title: "漏斗在哪里流失", number: "01", kicker: "诊断" },
  statement: {
    layout: "statement",
    text: "三分之二流失的账号，从未走完第一次邀请流程。",
    attribution: "产品分析，滚动十二个月",
  },
  bullets: {
    layout: "bullets",
    title: "我们上线的三项改动",
    kicker: "第一季度交付",
    points: [
      "邀请链接现在先解析到工作区再创建账号，空状态页面被彻底移除。",
      "单点登录的发现基于邮箱域名，不再等待管理员手动配置。",
      "设置清单从十一步减到五步，其中四步是可选的。",
    ],
  },
  "two-column": {
    layout: "two-column",
    title: "邀请流程改动前后",
    left: { heading: "原来的做法", body: "被邀请的人先注册账号，落在一个空工作区里，还要回头向邀请人再要一次链接。大约三分之一的人再也没有回来。" },
    right: { heading: "现在的做法", body: "邀请本身携带工作区。注册后的第一屏就是团队真实的内容，而邀请人会收到通知，不需要被追着问。" },
  },
  cards: {
    layout: "cards",
    title: "计划的三个支柱",
    cards: [
      { heading: "减少摩擦", body: "在用户看到值得一看的东西之前，少走几步。" },
      { heading: "尽早证明价值", body: "第一次会话内就有真实数据，而不是等导入完成。" },
      { heading: "闭环反馈", body: "告诉邀请人，邀请成功了。" },
    ],
  },
  kpis: {
    layout: "kpis",
    title: "上线九十天后",
    kpis: [
      { value: "-31%", label: "进入工作区前的流失", note: "对比上一季度" },
      { value: "4.2 天", label: "首次共享文档的中位耗时", note: "此前为 11 天" },
      { value: "+18%", label: "每账号激活席位数", note: "获客投入不变" },
    ],
  },
  "chart-focus": {
    layout: "chart-focus",
    title: "迁移期间收入保持稳定",
    chart: CHART,
    takeaway: "所有人预期的第二季度下滑并没有出现，增长提前一个季度恢复。",
  },
  "chart-plus-text": {
    layout: "chart-plus-text",
    title: "增长来自哪里",
    chart: CHART,
    points: ["来自存量客户的扩张，而非新签", "仅企业版就贡献了其中三分之二", "自助渠道收入连续三个季度持平"],
    side: "right",
  },
  "image-full": {
    layout: "image-full",
    image: IMAGE,
    title: "第一天的工作区",
    subtitle: "被邀请的人在最初十秒里看到什么",
  },
  "image-split": {
    layout: "image-split",
    title: "一屏就能承载整个改动",
    image: IMAGE,
    body: "过去需要告诉新用户的一切，现在直接展示出来。",
    points: ["没有空状态", "价值出现在配置之前", "邀请人会被告知成功了"],
    side: "left",
  },
  timeline: {
    layout: "timeline",
    title: "计划如何推进",
    steps: [
      { when: "第一季度", what: "重建邀请流程，以开关方式上线" },
      { when: "第二季度", what: "单点登录发现，随后向企业版分批放量" },
      { when: "第三季度", what: "精简清单，完成第一个完整观测窗口" },
      { when: "第四季度", what: "迁移剩余的自助账号" },
    ],
  },
  comparison: {
    layout: "comparison",
    title: "重建还是打补丁",
    left: { heading: "在现有流程上打补丁", points: ["三周内上线", "空状态仍然保留", "没有迁移风险"] },
    right: { heading: "重建整个流程", points: ["需要一个季度", "彻底移除空状态", "需要分批放量"] },
  },
  matrix: {
    layout: "matrix",
    title: "下个季度把时间花在哪里",
    axes: { x: "投入", y: "影响" },
    quadrants: [
      { heading: "立刻做", body: "邀请链接与单点登录发现。" },
      { heading: "认真规划", body: "完整的自助迁移。" },
      { heading: "有空再补", body: "清单文案与空状态插图。" },
      { heading: "拒绝", body: "又一次的管理后台改版。" },
    ],
  },
  table: {
    layout: "table",
    title: "各方案的代价",
    rows: [
      ["方案", "工程投入", "上线时间", "风险"],
      ["打补丁", "三周", "本季度", "低"],
      ["重建", "一个季度", "下季度", "中"],
      ["不动", "—", "—", "高"],
    ],
    caption: "工程估算按两人小组的周数计。",
  },
  quote: {
    layout: "quote",
    text: "我们没有引导流程的问题，我们有的是一个只在引导阶段暴露出来的问题。",
    attribution: "平台负责人，复盘会",
  },
  closing: { layout: "closing", title: "谢谢", subtitle: "欢迎提问，以及详细的迁移计划", meta: "platform@example.com" },
}
