import { App } from "@modelcontextprotocol/ext-apps";

interface Slide {
  id: string;
  file: string;
  bytes: number;
}

interface DeckState {
  project: string;
  projectDir: string;
  slides: Slide[];
  canExport: boolean;
}

const app = new App({ name: "pptgo-editor", version: "0.1.0" });

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const rail = el("rail");
const stage = el("stage");
const side = el("side");
const editText = el<HTMLTextAreaElement>("editText");
const askText = el<HTMLTextAreaElement>("askText");

let deck: DeckState | null = null;
let currentPage = "";
let selectedRun = -1;
let runNodes: Element[] = [];
const svgCache = new Map<string, string>();

function status(message: string): void {
  el("status").textContent = message;
}

function reportSize(): void {
  try {
    void app.sendSizeChanged({ height: document.body.scrollHeight });
  } catch {
    /* host may not support size negotiation */
  }
}

/** Tool results carry JSON in structuredContent, with a text fallback. */
function payload(result: unknown): any {
  const res = result as { structuredContent?: unknown; content?: { type: string; text?: string }[] };
  if (res?.structuredContent) return res.structuredContent;
  const text = res?.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  const result = await app.callServerTool({ name, arguments: args });
  const data = payload(result);
  if ((result as { isError?: boolean }).isError) {
    throw new Error(data?.text ?? data?.error ?? `${name} failed`);
  }
  return data;
}

// --- rendering -------------------------------------------------------------

/** Enumerates editable runs in the same order the server does. */
function collectRuns(root: ParentNode): Element[] {
  const runs: Element[] = [];
  root.querySelectorAll("text").forEach((textEl) => {
    const tspans = textEl.querySelectorAll("tspan");
    if (tspans.length) tspans.forEach((t) => runs.push(t));
    else runs.push(textEl);
  });
  return runs;
}

function mountSvg(container: HTMLElement, svg: string): void {
  container.innerHTML = svg;
  const node = container.querySelector("svg");
  if (!node) return;
  // Let the slide scale to the column while keeping its aspect ratio.
  const width = node.getAttribute("width");
  const height = node.getAttribute("height");
  if (!node.getAttribute("viewBox") && width && height) {
    node.setAttribute("viewBox", `0 0 ${parseFloat(width)} ${parseFloat(height)}`);
  }
  node.removeAttribute("width");
  node.removeAttribute("height");
}

function renderRail(): void {
  rail.innerHTML = "";
  if (!deck) return;
  for (const slide of deck.slides) {
    const button = document.createElement("button");
    button.className = "thumb" + (slide.id === currentPage ? " active" : "");
    button.innerHTML = `<div class="ph">${slide.id}</div><span class="tag">${slide.id}</span>`;
    button.onclick = () => void openSlide(slide.id);
    rail.appendChild(button);

    const cached = svgCache.get(slide.id);
    if (cached) {
      const holder = document.createElement("div");
      mountSvg(holder, cached);
      const svgNode = holder.querySelector("svg");
      if (svgNode) button.replaceChild(svgNode, button.firstChild!);
    }
  }
}

/**
 * SVG text only reacts to clicks that land on a glyph outline, which makes
 * small text nearly unclickable. Overlay one transparent box per run instead.
 */
function layoutHitBoxes(canvas: HTMLElement, overlay: HTMLElement): void {
  const base = canvas.getBoundingClientRect();
  overlay.innerHTML = "";
  if (!base.width) return; // not laid out yet; the ResizeObserver will retry
  runNodes.forEach((node, index) => {
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const hit = document.createElement("div");
    hit.className = "hit";
    hit.style.left = `${box.left - base.left}px`;
    hit.style.top = `${box.top - base.top}px`;
    hit.style.width = `${box.width}px`;
    hit.style.height = `${box.height}px`;
    hit.onclick = (event) => {
      event.stopPropagation();
      selectRun(index);
    };
    overlay.appendChild(hit);
  });
}

function renderStage(svg: string): void {
  stage.innerHTML = "";
  const canvas = document.createElement("div");
  canvas.id = "canvas";
  mountSvg(canvas, svg);
  const overlay = document.createElement("div");
  overlay.id = "overlay";
  canvas.appendChild(overlay);
  stage.appendChild(canvas);

  runNodes = collectRuns(canvas);
  // Glyph-level listener as a fallback for anything the overlay misses.
  runNodes.forEach((node, index) =>
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      selectRun(index);
    }),
  );

  const relayout = () => layoutHitBoxes(canvas, overlay);
  requestAnimationFrame(relayout);
  new ResizeObserver(relayout).observe(canvas);
  reportSize();
}

function selectRun(index: number): void {
  runNodes.forEach((n) => n.classList.remove("pptgo-hit"));
  selectedRun = index;
  const node = runNodes[index];
  if (!node) return;
  node.classList.add("pptgo-hit");
  editText.value = (node.textContent ?? "").trim();
  side.classList.add("open");
  editText.focus();
  status(`已选中第 ${index + 1} 段文字`);
}

// --- actions ---------------------------------------------------------------

async function loadDeck(project: string): Promise<void> {
  status("加载中…");
  deck = await call("deck_state", { project });
  el("deckName").textContent = deck!.project;
  el("deckMeta").textContent = `${deck!.slides.length} 页`;
  el<HTMLButtonElement>("btnExport").disabled = !deck!.canExport;
  renderRail();
  if (deck!.slides.length) {
    await openSlide(currentPage && deck!.slides.some((s) => s.id === currentPage) ? currentPage : deck!.slides[0].id);
    status(deck!.canExport ? "" : "未配置 PPT_MASTER_HOME，导出不可用");
    void prefetchThumbs();
  } else {
    stage.innerHTML = `<div class="empty">这个项目还没有幻灯片。<br>让 Claude 用 slide_write 写入第一页。</div>`;
    status("");
  }
}

/** Fills the thumbnail rail one slide at a time, without blocking the stage. */
async function prefetchThumbs(): Promise<void> {
  if (!deck) return;
  const project = deck.project;
  for (const slide of deck.slides) {
    if (svgCache.has(slide.id)) continue;
    try {
      const data = await call("slide_svg", { project, page: slide.id });
      svgCache.set(slide.id, String(data?.svg ?? ""));
      if (deck?.project === project) renderRail();
    } catch {
      return;
    }
  }
}

async function openSlide(page: string): Promise<void> {
  if (!deck) return;
  currentPage = page;
  side.classList.remove("open");
  let svg = svgCache.get(page);
  if (!svg) {
    status(`读取 ${page}…`);
    const data = await call("slide_svg", { project: deck.project, page });
    svg = String(data?.svg ?? "");
    svgCache.set(page, svg);
  }
  renderStage(svg);
  renderRail();
  status("");
}

async function saveText(): Promise<void> {
  if (!deck || selectedRun < 0) return;
  status("保存中…");
  const data = await call("slide_patch_text", {
    project: deck.project,
    page: currentPage,
    index: selectedRun,
    text: editText.value,
  });
  const svg = String(data?.svg ?? "");
  svgCache.set(currentPage, svg);
  renderStage(svg);
  renderRail();
  side.classList.remove("open");
  status("已保存");
}

async function exportPptx(): Promise<void> {
  if (!deck) return;
  status("正在导出 PPTX，首次运行可能需要一两分钟…");
  el<HTMLButtonElement>("btnExport").disabled = true;
  try {
    const data = await call("deck_export", { project: deck.project });
    status(data?.pptx ? `已导出：${data.pptx}` : (data?.message ?? "导出结束"));
  } finally {
    el<HTMLButtonElement>("btnExport").disabled = false;
  }
}

async function askClaude(): Promise<void> {
  if (!deck) return;
  const instruction = askText.value.trim();
  if (!instruction) return;
  await app.sendMessage({
    role: "user",
    content: [
      {
        type: "text",
        text: `请修改项目 ${deck.project} 的第 ${currentPage} 页：${instruction}\n改完用 slide_write 写回 ${currentPage}，然后用 deck_open 重新打开预览。`,
      },
    ],
  });
  askText.value = "";
  status("已发送给 Claude");
}

function wire(): void {
  el("btnReload").onclick = () => {
    svgCache.clear();
    if (deck) void loadDeck(deck.project).catch((e) => status(String(e.message ?? e)));
  };
  el("btnFull").onclick = () => {
    void app.requestDisplayMode({ mode: "fullscreen" }).catch(() => status("当前宿主不支持全屏"));
  };
  el("btnExport").onclick = () => void exportPptx().catch((e) => status(String(e.message ?? e)));
  el("btnSave").onclick = () => void saveText().catch((e) => status(String(e.message ?? e)));
  el("btnCancel").onclick = () => {
    side.classList.remove("open");
    runNodes.forEach((n) => n.classList.remove("pptgo-hit"));
  };
  el("btnAsk").onclick = () => void askClaude().catch((e) => status(String(e.message ?? e)));
}

function applyTheme(theme: unknown): void {
  if (theme === "dark" || theme === "light") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function bootstrap(input: unknown): void {
  const project = (input as { project?: string })?.project;
  if (project && project !== deck?.project) {
    void loadDeck(project).catch((e) => status(String(e.message ?? e)));
  }
}

app.ontoolinput = (params) => bootstrap(params.arguments);
app.ontoolresult = (params) => {
  const data = payload(params);
  if (data?.project) bootstrap(data);
};
// Some hosts deliver render data through the legacy lifecycle message.
window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as { type?: string; payload?: { renderData?: any } };
  if (data?.type === "ui-lifecycle-iframe-render-data") {
    applyTheme(data.payload?.renderData?.theme);
    bootstrap(data.payload?.renderData?.toolInput);
  }
});

wire();
void app
  .connect()
  .then(() => {
    applyTheme((app as unknown as { hostContext?: { theme?: string } }).hostContext?.theme);
    status("");
  })
  .catch((e: unknown) => status(`连接宿主失败：${String(e)}`));
