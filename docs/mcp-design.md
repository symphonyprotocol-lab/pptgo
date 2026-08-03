# pptgo MCP 服务设计方案

让 AI agent 通过 MCP 完整地做出一份 PPT，并随时调整；人和 agent 共享一个实时预览界面。

已确定的四项决策：

1. 认证走**个人 API token**
2. deck 加 **`version` 字段做乐观锁**，编辑器**轮询**
3. **PPTX 导出暂不集成**进 MCP
4. 架构走**路线 2**：MCP endpoint 挂进 Next.js

---

## 0. 边界

**做**：deck 的创建、结构读取、整页写入、单元素修改、主题设置、预览页。

**不做（本期）**：PPTX 导出、`.pptx` 导入、图片上传、动画编排、演讲者备注之外的富文本混排。

**明确的非目标**：不重建旧的 SVG + ppt-master 管线。Agent 直接操作 `Deck` JSON，与 web 编辑器共用同一份数据模型和同一份存储。

---

## 1. 架构

```
Claude / 任意 MCP 客户端
        │  Streamable HTTP + Bearer token
        ▼
  POST/GET/DELETE  /api/mcp          ← Next.js route handler
        │
        │  同进程直接函数调用，不经 HTTP
        ▼
   lib/mcp/tools.ts  ──►  lib/decks.ts  ──►  Postgres（元数据 + version）
                                        └►  rustfs（deck.json）
                                                  ▲
  浏览器  /preview/[id]  ──轮询 version──────────┘
          /editor/[id]   ──轮询 version──────────┘
```

一个进程，一套存储，一套所有权校验。MCP 工具不再走 `fetch('/api/decks/...')`，而是直接调用 [`web/src/lib/decks.ts`](../web/src/lib/decks.ts) 里已有的函数——那里的每个读写都已经在同一条 SQL 里按 owner 过滤。

### 为什么 Next.js route handler 能直接承载 MCP

`@modelcontextprotocol/server` 2.0.0（正式版）导出：

```ts
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server"

const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
})
// handleRequest(req: Request): Promise<Response>
```

Next 16 的 route handler 签名是 `(request: Request) => Response | Promise<Response>`，支持 `GET` / `POST` / `DELETE`，且**默认不缓存**。两者签名逐字对齐，不需要 Node `req`/`res` 适配层，也不需要 Express。

> 注意版本线：`@modelcontextprotocol/sdk` 1.30.0 是旧包，它的 `StreamableHTTPServerTransport` 基于 Node `req`/`res`，接进 Next 要额外桥接。**用 2.0 的 `@modelcontextprotocol/server`**。实现时先确认 `WebStandardStreamableHTTPServerTransport` 的导出名与当前发布一致。

### 会话状态

MCP 的 Streamable HTTP 有会话（`Mcp-Session-Id`）。Next.js 是多实例、可能冷启动的运行时，进程内 `Map<sessionId, transport>` 在单实例 docker compose 下可用，横向扩展时会断。

**本期用有状态模式**（compose 是单实例），并在代码里把 session 存取抽成一个接口，将来换 Redis 只改一个文件。若要立刻无状态，把 `sessionIdGenerator` 设为 `undefined`，代价是每个请求重建 server 实例、无法用 server→client 的推送。

---

## 2. 认证：个人 API token

### 问题

现有 API 全部走 `currentUser()` → Auth.js 数据库 session + Google OAuth，凭证是浏览器 cookie。MCP 客户端没有浏览器，拿不到 cookie。

### 数据表

```ts
// web/src/db/schema.ts 新增
export const apiTokens = pgTable(
  "apiToken",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ownerId: text("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** 用户可读的名字，例如 "Claude Desktop" */
    name: text("name").notNull(),
    /** sha256(token)，明文只在创建时返回一次 */
    tokenHash: text("tokenHash").notNull().unique(),
    /** 明文前 8 位，仅用于列表里辨认，例如 "pptgo_7f3a…" */
    prefix: text("prefix").notNull(),
    lastUsedAt: timestamp("lastUsedAt", { mode: "date", withTimezone: true }),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("apiToken_owner_idx").on(t.ownerId)],
)
```

### token 形态

```
pptgo_<32 字节 base64url>
```

前缀让泄漏扫描器能识别。**只存 sha256**，明文仅在生成时返回一次——这和 session 表存的是 token 本身不同，因为 API token 生命周期长得多。

sha256 而非 bcrypt：token 是 32 字节高熵随机串，不可暴破，不需要慢哈希；而每个 MCP 请求都要校验一次，慢哈希会变成延迟来源。

### 校验路径

```ts
// web/src/lib/api-token.ts
export async function userFromBearer(request: Request): Promise<SessionUser | null>
```

从 `Authorization: Bearer <token>` 取值 → sha256 → 查 `apiToken` → 检查 `expiresAt` → join `user` 返回。异步更新 `lastUsedAt`（不阻塞请求，且做节流，否则每次调用都写一行）。

MCP 侧用 SDK 自带的 `requireBearerAuth({ verifier, requiredScopes })`——它在校验失败时返回符合规范的挑战 `Response`，比自己拼 401 更省事，也让客户端能正确提示。

### 生成入口

dashboard 增加 `/settings/tokens`：列出（名字、前缀、最后使用时间）、新建（弹出明文一次，附带可复制的客户端配置片段）、吊销。

### 作用域

本期**不做细粒度 scope**——一个 token 等于该用户的全部 deck 权限。理由：现在只有一种消费者。表里预留 `expiresAt` 已经够覆盖"临时授权"这个最常见的需求。真要加 scope，加一列 `scopes text[]` 即可，不改其它设计。

### 安全边界

- token 只在 `/api/mcp` 和（可选）`/api/decks/*` 上被接受，**不接受用它换 session cookie**
- 生产环境必须 HTTPS，否则 Bearer 明文过网
- 现有 `currentUser()` 保持不动，`/api/mcp` 用新的 `userFromBearer()`，两条认证路径互不污染

---

## 3. 并发：version 乐观锁 + 轮询

### 现状问题

[`editor-shell.tsx`](../web/src/components/editor/editor-shell.tsx) 的自动保存是：任意改动 → 600ms 防抖 → `PUT /api/decks/[id]` **整份替换**。无版本号、无冲突检测；编辑器只在挂载时 load 一次，没有任何回读机制。

后果：agent 写入 → 用户看不见；用户随手一动 → agent 的改动被整份覆盖，无提示。

### schema 变更

```ts
// deck 表新增
version: integer("version").notNull().default(1),
```

迁移用 `drizzle-kit generate`，存量行默认 1。**注意**：本仓库的容器启动走 [`web/scripts/migrate.mjs`](../web/scripts/migrate.mjs)（自实现的迁移记账），加完 SQL 后要确认它能吃下新迁移。

### 写入协议

`PUT /api/decks/[id]` 的 body 增加 `baseVersion`：

| 情况 | 行为 |
|---|---|
| `baseVersion === 当前 version` | 写入，`version += 1`，返回新 version |
| `baseVersion < 当前 version` | **409 Conflict**，返回当前 version |
| 缺省 `baseVersion` | 拒绝（400）。不给"强行覆盖"留默认路径 |

409 只回当前 version，**不回完整 deck**（初版方案说要回）。冲突时最常见的选择是"保留我的"，为另一种选择预先从桶里取出几 MB 幻灯片是白花；真要看新版本，客户端再发一次 `GET /api/decks/[id]` 即可。「用我的覆盖」也不需要新接口——客户端读一次当前 version 再用它当 `baseVersion` 写，语义就是覆盖，且中间若又有人写入仍会正确地再次 409。

**重命名也算一次写入**（初版方案漏了）。标题同时存在数据库行和文档里，所以 `renameDeck` 走同一套版本认领；仪表盘重命名时手上没有版本号，于是它自己读一个、输了重试一次，两次都输返回 409（"这份文稿正在被编辑"）而不是伪装成 404。**缩略图上传不算**：它不碰文档，若也递增版本，每 30 秒一次的缩略图会让所有读者误以为文稿变了并重新拉取。

版本号在**同一条 UPDATE 里做条件递增**，避免读-判断-写之间的竞态：

```sql
UPDATE deck SET version = version + 1, ... WHERE id = $1 AND ownerId = $2 AND version = $3
```

返回 0 行即冲突。这一点很重要：先 `SELECT` 再 `UPDATE` 在并发下仍会丢写。

写 S3 与写 Postgres 的顺序：**先条件递增 Postgres，再写 S3**。

> 本节初版写反了，说"先写 S3 再更新 Postgres"，实现时发现那样会制造它本要防止的损坏：两个写入者都基于 v3，A 先写 S3（内容 C_A）并抢到 v4，B 随后写 S3（覆盖成 C_B）才被 UPDATE 拒绝——于是桶里躺着 B 的内容，数据库却说这是 A 的 v4。**一次被拒绝的写入破坏了它没被允许改的东西。**
>
> 反过来（先抢版本号）时，被拒绝的写入者根本碰不到桶。代价是另一种失败：抢到版本号但 S3 上传失败，会留下"版本号变了、内容没变"的状态，读者白重载一次——那是浪费一次请求，不是丢一次编辑。实现里还加了条件回滚（`SET version = version - 1 WHERE version = <刚抢到的>`），把这种情况多数时候也消掉。
>
> 这个顺序有 `web/src/lib/decks.integration.test.ts` 盯着，它对着真实 Postgres + rustfs 断言"被拒绝的写入者没碰过桶"。

### 轻量 version 端点

```
GET /api/decks/[id]/version  →  { version: 7, updatedAt: "..." }
```

**只查 Postgres 一行，绝不读 S3。** 轮询是高频操作，读整份 deck 要打对象存储，成本完全不同。这个端点是整个轮询方案能成立的前提。

### 编辑器轮询状态机

编辑器持有 `localVersion`（最后一次成功保存/加载拿到的）。每 4 秒轮询：

| 远端 version | 本地脏 | 行为 |
|---|---|---|
| `=== localVersion` | — | 无事发生 |
| `> localVersion` | 否 | 静默重新 load，`loadDeck(normalizeDeck(deck))`，保住当前 slideIndex 和选中态 |
| `> localVersion` | 是 | **不自动覆盖**。顶部横幅："这份文稿在别处被修改了 · [查看新版本] [保留我的修改]" |

保存收到 409 时同样走冲突横幅，不静默丢弃任何一边。

轮询在页面 `visibilitychange` 隐藏时暂停——一个后台标签页不该每 4 秒打一次数据库。

### MCP 写入路径

Agent 的每次写入同样走 read-modify-write：读 S3 JSON → 改 → 条件写。两个连续的 `element_patch` 都基于 v3 时，第二个会拿到 409。

**工具层自动重试一次**（重读、重放这一次修改、再写），第二次仍冲突才把错误抛给模型。理由：agent 自己重试要多消耗一轮对话，而"重放一个 element patch"是幂等且语义明确的操作。`slide_write` 这种整页替换**不自动重试**——那可能覆盖别人刚写的内容，必须让模型知道。

---

## 4. 预览界面

### 人怎么看

新增 `/preview/[id]`，只读，复用编辑器现有的 slide 渲染组件（不挂 canvas 交互层）：

- 主视图渲染当前页，底部缩略图轨道
- 复用第 3 节的 version 轮询，但间隔更短（1.5 秒）——生成过程要跟得上
- **检测到新版本后，自动跳到变化的那一页**：客户端比对新旧 slides 数组，找出新增或内容变化的第一页并切过去。这样人不用手动翻，就能看着 agent 一页页写
- 顶部状态条：`v7 · 12 页 · 3 秒前更新`
- 一个"在编辑器中打开"按钮

不需要登录态之外的东西：`/preview/[id]` 走 `currentUser()`，和 dashboard 同一套 cookie。

**为什么是轮询而不是 SSE**：编辑器已经要轮询（第 3 节），预览页复用同一个端点和同一套逻辑，零额外服务端状态。SSE 要在 Next route handler 里维持长连接，还要处理 compose 重启后的重连——收益是省几百毫秒延迟，不值。真要做，第 6 阶段再换，接口不用改。

### Agent 怎么"看" —— 需要讲清楚的取舍

**LLM 看不到网页像素。** 把幻灯片渲染成图片喂回模型，需要 canvas 或无头浏览器——这和决策 3（暂不集成导出）撞的是同一个依赖。所以本期 agent 的"看"分三层，都不是像素：

**第一层：结构回读（本期实现，主力）**

`deck_outline` 返回紧凑的结构摘要，而不是完整 JSON：

```json
{
  "version": 7,
  "title": "Q3 复盘",
  "previewUrl": "https://…/preview/abc123",
  "slides": [
    { "id": "s1", "index": 0, "section": "开篇",
      "elements": [
        { "id": "e1", "type": "text", "at": [80, 120, 840, 90], "text": "Q3 业务复盘" },
        { "id": "e2", "type": "text", "at": [80, 230, 500, 60], "text": "2026 年 10 月" }
      ] }
  ]
}
```

文字截断到 80 字，坐标压成 `[left, top, width, height]`，不返回颜色/字体/阴影。一份 20 页的 deck 摘要控制在 3–5k token 量级，agent 可以反复调用来确认自己写了什么、下一步改哪里。这是 agent 感知 deck 状态的**主要**手段。

**第二层：预览 URL 回传（本期实现）**

每个写工具的返回值都带 `previewUrl` 和新的 `version`。Agent 把链接给人，人在浏览器里实时看着生成过程。这是"人和 agent 共享一个预览界面"在本期的真实形态——**共享的是同一个 URL 和同一份状态，不是同一双眼睛**。

**第三层：MCP Apps 内嵌 iframe（第 5 阶段，可选）**

MCP Apps（`ui://` 资源）能让预览页直接嵌在对话里。这里有个路线 2 带来的红利：旧 MCP server 的文档记录过一个死结——claude.ai 网页版能渲染 MCP Apps 但够不到本地 stdio server，Claude Desktop 两者都行但只有它行。**路线 2 是远程 HTTP server，claude.ai 现在够得到了**，所以这个死结自己解开了。

但仍要如实说明：**Claude Code 和 Codex CLI 不渲染 MCP Apps**。所以它是增强，不能是唯一路径，第一、二层必须先做扎实。

### 生成过程的可见性

要让"看到生成过程"真正成立，agent 的写入必须是**增量、逐页**的，而不是憋到最后一次性 `deck_write` 整份。这是工具面设计的直接约束——见下节：**不提供整份 deck 写入工具**。

---

## 5. MCP 工具面

粒度取"页级读写 + 元素级补丁"。页是 agent 天然的思考单位，也是让预览页能一页页动起来的粒度。

| 工具 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `deck_list` | — | summary[] | 只有元数据，不含内容 |
| `deck_create` | `title`, `slideCount?` | `id`, `version`, `previewUrl` | 建空 deck |
| `deck_outline` | `deckId` | 见上节 | **agent 的眼睛**，写之前先读 |
| `slide_read` | `deckId`, `slideId` | 完整 slide JSON | 要改细节时才调 |
| `slide_write` | `deckId`, `slideId?`, `baseVersion`, `slide` | 新 version | 新建或整页替换 |
| `slide_delete` | `deckId`, `slideId`, `baseVersion` | 新 version | |
| `slide_move` | `deckId`, `slideId`, `toIndex`, `baseVersion` | 新 version | |
| `element_patch` | `deckId`, `slideId`, `elementId`, `patch`, `baseVersion` | 新 version | 改属性，冲突自动重试一次 |
| `deck_theme` | `deckId`, `theme`, `baseVersion` | 新 version | 字体、主色、背景 |
| `deck_preview` | `deckId` | `previewUrl` | 支持的 host 上额外返回 `ui://` 资源 |

**刻意不提供 `deck_write`（整份写入）**：它会让 agent 憋一次性输出，预览页看不到过程；也会让每次修改都传输整份文档（上限 25MB）。

参数校验用 zod，schema 从 [`web/src/types/slides.ts`](../web/src/types/slides.ts) 手写映射一份——TypeScript 类型运行时不存在，必须有独立的运行时 schema。默认值填充复用 [`factory.ts`](../web/src/lib/factory.ts) 的 `createTextElement` 等构造器，不重新发明一遍元素默认值。

### 文本写入的 sanitize 取舍

`TextElement.content` 存的是 HTML，`normalizeDeck` → `sanitizeHtml` 用**真实 DOM** 解析来消毒。服务端没有 DOM。

两条路：

- **(a) 服务端装 jsdom**：`jsdom` 已经是 web 的 devDependency（^29.1.1），提升为 dependency 即可。完整复用现有 sanitize 逻辑，agent 能写富文本。代价是镜像变大、每次消毒有解析开销。
- **(b) MCP 只收纯文本**（推荐）：`slide_write` / `element_patch` 的文字字段收纯文本，服务端只做 `&<>` 转义再包成 HTML。加粗、颜色、对齐这些走元素属性（`bold` / `color` / `align` 本来就是 `TextElement` 上的字段），不需要行内标签。

选 (b)。理由：agent 生成的文案 99% 是整段统一样式，行内混排（一句话里三种颜色）是人在编辑器里做的事；而 (b) 把一整类 XSS 风险从服务端移除了——没有 HTML 进来，就不需要消毒 HTML。真需要富文本时再走 (a)，接口不用变。

---

## 6. 文件清单

新增：

```
web/src/app/api/mcp/route.ts              MCP endpoint（POST/GET/DELETE）
web/src/app/api/decks/[id]/version/route.ts   轻量 version 查询
web/src/app/preview/[id]/page.tsx         预览页
web/src/app/settings/tokens/page.tsx      token 管理
web/src/lib/mcp/server.ts                 McpServer 构建 + session 管理
web/src/lib/mcp/tools.ts                  十个工具的实现
web/src/lib/mcp/schema.ts                 zod schema
web/src/lib/mcp/outline.ts                deck → 紧凑摘要
web/src/lib/api-token.ts                  token 生成与校验
web/src/components/preview/*              只读渲染 + 轮询
web/drizzle/0001_*.sql                    apiToken 表 + deck.version
```

修改：

```
web/src/db/schema.ts                      apiToken 表、deck.version
web/src/lib/decks.ts                      写入带条件版本递增
web/src/app/api/decks/[id]/route.ts       PUT 收 baseVersion，冲突返回 409
web/src/lib/deck-storage.ts               cloudDeckStorage 带上 version
web/src/components/editor/editor-shell.tsx  轮询 + 冲突横幅
web/package.json                          + @modelcontextprotocol/server, zod
```

---

## 7. 分阶段

| 阶段 | 内容 | 可验证的产出 |
|---|---|---|
| 1 ✅ | `deck.version` + 条件递增 + 409 + version 端点 | 两个标签页同开一份 deck，改动不再互相吞掉 |
| 2 ✅ | 编辑器轮询 + 冲突横幅 | 手工 `curl` 改一份 deck，编辑器 4 秒内自己更新 |
| 3 | `apiToken` 表 + 校验 + 管理页 | `curl -H "Authorization: Bearer …"` 能列出 deck |
| 4 | `/api/mcp` + 十个工具 | Claude 连上后能从零建出一份 10 页 deck |
| 5 | `/preview/[id]` + 自动跳页 | 人开着预览页，看着 agent 一页页写出来 |
| 6 | 可选：MCP Apps `ui://`、SSE 替换轮询、PPTX 导出 | — |

阶段 1–2 独立于 MCP，先做完就能解决"编辑器互相覆盖"这个现存 bug；阶段 3 之后才有 MCP。每一阶段都能单独合并。

---

## 8. 风险与已知取舍

**read-modify-write 的成本**：每次 `element_patch` 都要从 S3 读整份 JSON 再写回。一份带图的 deck 有几 MB，改一个标题也要搬运整份。本期接受——单用户单 agent 的量级下不是瓶颈。真成问题时的解法是在进程内加一个短 TTL 的 deck 缓存，而不是拆分存储结构。

**session 的横向扩展**：进程内 `Map` 在多实例部署下会断。compose 是单实例，本期不处理，但把 session 存取抽成接口。

**轮询的数据库压力**：每个打开的编辑器/预览页 4 秒一次单行查询。十几个并发用户完全无压力；上千并发要换 SSE 或 Redis pub/sub。

**agent 看不到渲染结果**：这是本期最实质的限制。Agent 靠 `deck_outline` 的结构摘要工作，看不到排版是否溢出、元素是否重叠。缓解办法是在 `deck_outline` 里带上简单的几何校验（元素超出画布边界、元素互相重叠面积超过阈值），把"看排版"降级成"报异常"。**建议纳入阶段 4**，成本很低但能挡掉大部分低级排版事故。

**PPTX 导出缺席**：决策 3 明确暂不集成。届时补上的路径是清楚的——`buildPptx` 已经验证能在 jsdom 无 canvas 下跑通（188 个测试全过），装上 `canvas` 包可补齐图片滤镜、圆角、freehand 和 LaTeX 公式的栅格化。

**文档需要新增一节**：根 README 已在 `f1806c0` 清理过，现在正确地把旧 MCP server 描述成已删除的历史，`.claude/commands/pptgo.md` 那个指向七个不存在工具的孤儿命令也一并删了。本方案落地时要给 README 补一节新的 MCP 说明——**写的是这份设计里的 HTTP endpoint 加 token，不要复用旧那节的任何内容**，两者除了名字没有关系。
