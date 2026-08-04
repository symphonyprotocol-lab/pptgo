# pptgo web

浏览器里的幻灯片编辑器，参考 [PPTist](https://github.com/pipipi-pikachu/PPTist) 的交互思路，用 Next.js + shadcn/ui 实现。
整个仓库的代码都在这个目录里，根目录的 `package.json` 只是把脚本转发过来。

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # vitest
```

**不配任何环境变量也能跑**：`/`、`/login`、`/editor` 都正常，只是一律按未登录处理
（开发模式下 `AUTH_SECRET` 有个写死的兜底值，见 `src/auth.ts`；生产模式没有兜底，缺了就报错）。

要真正登录和云端存稿，才需要 PostgreSQL 和 S3 兼容存储。最省事的办法是用仓库根目录的 compose
只起这两个：`docker compose up -d postgres rustfs`，然后 `cp .env.example .env.local`
填好 `AUTH_SECRET` 与 Google 凭据，`npm run db:migrate` 建表。

| 路由 | 作用 | 需要登录 |
|---|---|---|
| `/` | 落地页，第一屏是一块能真拖真缩放真旋转的画布 | 否 |
| `/login` | Google 登录 | 否 |
| `/dashboard` | 演示文稿列表：新建、重命名、复制、删除 | 是 |
| `/editor` | 编辑器，稿子存在浏览器 IndexedDB | 否 |
| `/editor/[id]` | 编辑器，稿子存在云端 | 是 |

## 结构

| 路径 | 作用 |
|---|---|
| `src/types/slides.ts` | 幻灯片 / 元素数据模型（text、image、shape、line、table、chart） |
| `src/store/editor.ts` | zustand store：幻灯片、选区、撤销重做、剪贴板、表格操作、动画 |
| `src/lib/` | 画布常量、形状库、几何、吸附、消毒、颜色、富文本、动画、存储 |
| `src/lib/export.ts` | PPTX 导出（[pptxgenjs](https://github.com/gitbrent/PptxGenJS)） |
| `src/lib/pptx-patch.ts` | 导出第二遍：回填 pptxgenjs 写不出的渐变、自定义几何、切换与动画 |
| `src/lib/ooxml-fill.ts` · `ooxml-geometry.ts` · `ooxml-timing.ts` · `svg-path.ts` | 上述四类 OOXML 片段的构造，以及 SVG path 解析 |
| `src/lib/import-pptx.ts` | PPTX 导入（jszip + DOMParser 解析 OOXML） |
| `src/lib/export-media.tsx` | 图片（PNG/ZIP）与 PDF（打印）导出 |
| `src/components/editor/` | 工具栏、页面列表、画布、属性面板、图层面板、放映视图 |
| `src/auth.ts` · `src/app/api/auth/` | Auth.js v5，Google 单一登录方式，会话存 PostgreSQL |
| `src/db/` · `drizzle/` | Drizzle schema 与 SQL 迁移 |
| `src/lib/s3.ts` · `src/lib/decks.ts` | 对象存储客户端，以及带归属校验的演示文稿数据层 |
| `src/app/api/decks/` | 列表 / 新建 / 读取 / 保存 / 重命名 / 复制 / 删除 / 缩略图 |
| `src/components/site/live-slide.tsx` | 首页第一屏那块可交互画布 |
| `src/components/site/` · `src/components/dashboard/` | 落地页与控制台的界面 |

编辑器本身不知道稿子存在哪：`EditorShell` 收一个 `DeckStorage`（`src/lib/deck-storage.ts`），
`/editor` 传 IndexedDB 版，`/editor/[id]` 传走 API 的版本。读取失败时自动保存会停用，
以免编辑器回落出来的空白稿覆盖掉那份读不出来的。

## 首页

首页不介绍编辑器，第一屏**就是**一块画布：标题是里面的一个文字元素，可以拖动、从八个把手缩放
（带和真画布同一套旋转补偿）、旋转，下面那条状态栏实时报选中元素的 x / y / w / h / 角度。
说「拖拽定位、拉动缩放」然后配一张截图，是最容易露怯的地方，所以干脆直接让它动。

它是独立实现的（`live-slide.tsx`），没有挂真正的 `EditorShell`——后者会带进 store、工具栏和整条导出
链路，访客在决定留下来之前不需要这些。画布内部一律用固定深色和编辑器真实的选中框颜色 `#2563eb`，
不吃主题；`overflow-hidden` 保证旋转出界的元素不会画到页面上。

第一屏之外没有功能卡片：等大卡片配序号、粗标题和三行正文，本身就是一张 PPT 的版式，
对一个做幻灯片的工具来说是件很奇怪的事。改成了一张发丝线分隔的规格表，更密、更好扫，
也塞得下编辑器真正做的那些事。

## 标识

标志（`src/components/site/logo.tsx`）是**一个 16:9 的框，加一个压在角上的控制点**。两部分都在说事：
框的比例正好是 24 × 13.5，也就是整个应用的坐标系比例，所以它读起来是一张幻灯片而不是随便一个方框；
控制点是这个产品的动词——pptgo 是块直接操作的画布，缩放把手是任何静态看图工具都不会画的东西。
合起来是「一张可以上手抓的幻灯片」，也就是整个卖点。

只用两个形状是为了能缩小：16px 时框还是框，把手还是角上一个亮点，仍然不会被误认成文档图标。
强调色只给把手——那是你真会去按的地方。

| 文件 | 用途 |
|---|---|
| `src/components/site/logo.tsx` | 页面内嵌的 SVG，尺寸用 `em`，跟着字号走 |
| `src/components/site/wordmark.tsx` | 标志 + Fraunces 字标的锁定组合 |
| `src/app/icon.svg` | 浏览器标签页图标，自带深色底（裸线框在未知的浏览器 chrome 上看不清），描边比内嵌版更粗一档 |
| `src/app/apple-icon.tsx` | 180×180 PNG，iOS 主屏用，同一套比例用 div 重建（Satori 只认 CSS 子集） |

编辑器工具栏里只放标志不放字标——那里没有横向空间，而这正是「只有两个形状」换来的好处。

## 主题

明暗两套主题，同一批 shadcn token，落地页、登录页、控制台和编辑器共用，没有第二套调色板：

- **明暗是同一套设计的两种光**：同一条色相轴（252）、同样收到 `--radius: 0.25rem` 的圆角
  （这是台仪器，不是卡片墙）、同样克制的青柠强调色，只是明度斜坡的方向反过来。
- **Darkroom**（`.dark`）是**石墨灰机身**（`--graphite-950/900/850/800`）加**骨白文字**（`--bone`），
  UI 退到背景里，因为整个界面上最该亮的是幻灯片本身——它是白的，是用户真正做出来的东西；
  幻灯片边缘用 `ring-white/15` 而不是深色描边，否则在暗背景上等于没有边。
- **Daylight**（`:root`）换成纸白与墨黑（`--paper` / `--ink`）。强调色不能照搬电光青柠——
  那个明度放在白纸上当文字看不见、当填充又刺眼，所以同一个色相沿斜坡压下来（`--volt` 从
  `oklch(0.855 …)` 到 `oklch(0.565 …)`）。
- 两套都给编辑器画布地板留了各自的 `--stage`，比任何面板再深/浅一档，让幻灯片浮在自己的光里。

**强调色只在按钮、聚焦环和选中态上花**，两套皆然。哪一套生效在首屏绘制前就由 `layout.tsx` 里
的内联脚本定好：默认跟随系统，可以用落地页头部的切换器覆盖，三态（system / light / dark）存在
localStorage，解析结果作为 `dark` class 落在 `<html>` 上（shadcn 组件自带的 `dark:` 分支就吃这个），
原始选择作为 `data-theme-pref` 落在同一个元素上——切换器自己的高亮读它，所以那个控件不需要客户端
状态，也不会在 hydration 前渲染错段。所以**改主题不需要动任何组件**，编辑器的工具栏、面板、
对话框全是跟着 token 走的。

字体：Fraunces（高对比衬线）只留给 wordmark——中文标题无论如何都会回落到系统黑体，
让衬线去做拉丁文的点缀比硬套在标题上更有效；正文与 UI 是 Geist Sans，元信息是 Geist Mono。

画布内部（含首页第一屏那块画布）刻意不吃主题：内容用固定的深色中性色，选中框用编辑器真实的
`#2563eb`。幻灯片是用户的文档，不是应用的表面。

画布坐标系固定为 1000 × 562.5（16:9），渲染时整体 CSS `scale`，导出时按 1000 单位 = 10 英寸换算。
导入非 16:9 的 PPTX 时按比例缩放并居中，不做拉伸。

## 已支持

**元素** 文字、形状（28 个预设几何 + 自由绘制）、图片、线条、表格、
图表（柱/条/折线/面积/散点/饼/环/雷达）、视频、音频、LaTeX 公式。

**画布** 拖拽、八向缩放（带旋转补偿）、旋转、框选、多选、组合；组合与多选可以整体缩放和旋转；
吸附对齐线、网格、标尺、缩放、右键菜单、锁定（锁定后仍可选中，从图层面板或属性面板解锁）。

**编辑** 分类型属性面板、图层面板、层级、对齐、等距分布、格式刷、超链接（网页 / 跳转到页）、
段内富文本（加粗 / 斜体 / 下划线 / 删除线 / 上下标 / 颜色 / 高亮 / 列表 / 链接）、
图片裁剪与着色、形状渐变、阴影与边框、表格合并拆分与增删行列、图表数据表格编辑、
撤销重做、快捷键、系统剪贴板（可直接粘贴外部图片和文字）、查找替换。

**页面** 缩略图、拖拽排序、复制删除、背景（纯色 / 渐变 / 图片，可应用到全部）、分节、
演讲者备注、切换动画、元素动画（进入 / 退出 / 强调）。

**放映** 翻页与动画分步、切换动画、画笔 / 荧光笔 / 橡皮 / 激光笔 / 黑板、计时器、自动放映、
缩略图导航、备注、全屏、视频音频播放、触屏左右滑动翻页。

**移动端** 画布全部走 pointer 事件（鼠标 / 触屏 / 触控笔同一套代码），双指捏合缩放；
窄屏时左右两栏收进抽屉，工具条换行并横向滚动。

**存取** IndexedDB 自动保存（图片是 dataURL，localStorage 的 5MB 配额撑不住）、
导入 PPTX 与 JSON、导出 PPTX / PNG / PDF / JSON。

**账号与云端** Google 登录（Auth.js v5，会话是 PostgreSQL 里的一行，退出即刻失效）、
控制台列出自己的演示文稿并可新建 / 重命名 / 复制 / 删除、
编辑器每次自动保存把整份文稿写进 S3 兼容存储，并每半分钟顺带更新一次首页缩略图。

**语言与主题** 中文 / English 两套文案（`src/lib/i18n/`，两张表按类型互相校验，缺一条是编译错误），
明暗两套主题，都默认跟随系统、可在落地页头部切换；语言存 cookie 而不是 localStorage，
因为落地页、控制台、登录页都是 server component，服务端得知道语言才能把第一个字节就渲染对。

## 存在哪

演示文稿正文（含内嵌图片，动辄几 MB）是对象存储里的一个 JSON 对象，
标题、页数、大小、修改时间这些控制台要排序和显示的字段在 PostgreSQL：

| | PostgreSQL | rustfs（S3 兼容） |
|---|---|---|
| 表 / 键 | `user`、`account`、`session`、`verificationToken`、`deck` | `decks/<id>/deck.json`、`decks/<id>/thumbnail.png` |

`deck` 行和对象一一对应。每次读写都在同一条 SQL 里按 `ownerId` 过滤，
所以别人的 id 和不存在的 id 返回一样的 404——没有“先取出来再判断归属”的路径。
桶不存在时由应用首次写入时创建，不需要额外的初始化容器。

## 导入保真度

导入解析 slide XML：文本框、预设形状、图片（含裁剪）、连接线、表格、分组（含子坐标空间换算）、
背景（纯色 / 渐变 / 图片）、备注、超链接，图表读 `ppt/charts/*` 的系列和分类，
配色按 slide → layout → master → theme 链解析 `clrScheme`（缺项回落到 PowerPoint 出厂值）。
非 16:9 的稿子等比缩放居中而不是拉伸。

## 导出保真度

导出走 pptxgenjs，形状映射到 OOXML 预设几何（`roundRect`、`star5` …），
文字导出为可编辑文本框，段内的加粗、颜色、字号、链接、上下标、列表都按 run 保留；
形状文字写在形状内部（而不是叠一个文本框），不透明度映射为 OOXML 的 transparency，
阴影、边框、图片裁剪 / 翻转、表格合并、图表、视频音频都是原生对象。

栅格化处理（视觉一致、但不再可编辑）：图片的 CSS 滤镜 / 着色 / 圆角在导出前烘焙进位图；
自由绘制的笔迹和 LaTeX 公式转成图片——OOXML 的自定义几何和 OMML 公式都不是 pptxgenjs 能生成的。

真正有损的只剩一项：**渐变**在 pptxgenjs 里没有对应 API，导出时取各色标的平均色
（形状仍是可重新上色的原生形状，而不是被栅格化成图片）。元素动画和切换动画也只在本编辑器的放映模式里生效。

## 测试

```bash
npm test
```

`src/**/*.test.ts`，jsdom 环境，188 个用例。覆盖 HTML 消毒（含越权提升的回归用例）、几何与旋转、
颜色转换、富文本 run 拆分、deck 迁移、语言协商、自由绘制路径、动画分步、图片烘焙的降级路径、
store（历史、层级、锁定、组合、表格、格式刷）、PPTX 导出（真的生成文件再解压断言 XML）、
PPTX 导入（现造一个 pptx 包再解析）、以及导出→导入的往返（含图表数据）。
