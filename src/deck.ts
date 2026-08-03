import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import type { Config } from "./config.js";

export interface SlideInfo {
  /** Page id, i.e. the SVG file name without extension (`P01`). */
  id: string;
  file: string;
  bytes: number;
}

export interface DeckState {
  project: string;
  projectDir: string;
  slidesDir: string;
  slides: SlideInfo[];
  canExport: boolean;
}

/** ppt-master writes authored slides here; we keep the same layout when standalone. */
export const SLIDES_SUBDIR = "svg_output";

export function projectDir(cfg: Config, project: string): string {
  // Accept either a bare project name or an absolute/relative path to a project.
  if (project.includes("/") || project.includes("\\")) return resolve(project);
  return join(cfg.workspace, project);
}

/** Natural sort so P2 comes before P10. */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export async function listProjects(cfg: Config): Promise<{ name: string; slides: number }[]> {
  if (!existsSync(cfg.workspace)) return [];
  const entries = await readdir(cfg.workspace, { withFileTypes: true });
  const out: { name: string; slides: number }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const slidesDir = join(cfg.workspace, entry.name, SLIDES_SUBDIR);
    let slides = 0;
    if (existsSync(slidesDir)) {
      slides = (await readdir(slidesDir)).filter((f) => f.toLowerCase().endsWith(".svg")).length;
    }
    out.push({ name: entry.name, slides });
  }
  return out.sort((a, b) => naturalCompare(a.name, b.name));
}

export async function readDeck(cfg: Config, project: string): Promise<DeckState> {
  const dir = projectDir(cfg, project);
  const slidesDir = join(dir, SLIDES_SUBDIR);
  const slides: SlideInfo[] = [];
  if (existsSync(slidesDir)) {
    const files = (await readdir(slidesDir))
      .filter((f) => f.toLowerCase().endsWith(".svg"))
      .sort(naturalCompare);
    for (const file of files) {
      const info = await stat(join(slidesDir, file));
      slides.push({ id: basename(file, ".svg"), file, bytes: info.size });
    }
  }
  return {
    project: basename(dir),
    projectDir: dir,
    slidesDir,
    slides,
    canExport: Boolean(cfg.pptMasterHome),
  };
}

export async function readSlide(cfg: Config, project: string, page: string): Promise<string> {
  const path = join(projectDir(cfg, project), SLIDES_SUBDIR, `${page}.svg`);
  if (!existsSync(path)) throw new Error(`Slide ${page} not found in project ${project}`);
  return readFile(path, "utf8");
}

export async function writeSlide(
  cfg: Config,
  project: string,
  page: string,
  svg: string,
): Promise<string> {
  if (!/^[A-Za-z0-9_-]+$/.test(page)) {
    throw new Error(`Invalid page id "${page}" — use characters, digits, "-" or "_" (e.g. P03)`);
  }
  if (!/<svg[\s>]/i.test(svg) || !/<\/svg>/i.test(svg)) {
    throw new Error("Content does not look like a complete SVG document");
  }
  const slidesDir = join(projectDir(cfg, project), SLIDES_SUBDIR);
  await mkdir(slidesDir, { recursive: true });
  const path = join(slidesDir, `${page}.svg`);
  await writeFile(path, svg, "utf8");
  return path;
}

export async function createProject(cfg: Config, name: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid project name "${name}" — use characters, digits, "-" or "_"`);
  }
  const dir = join(cfg.workspace, name);
  await mkdir(join(dir, SLIDES_SUBDIR), { recursive: true });
  return dir;
}

// --- text runs -------------------------------------------------------------
// The editor lets the user click any text on a slide and retype it. Runs are
// enumerated in document order: every <tspan> inside a <text>, or the <text>
// itself when it has no tspans. The browser walks the parsed DOM in the same
// order, so a run index means the same thing on both sides.

export interface TextRun {
  index: number;
  text: string;
}

interface RunRange {
  start: number;
  end: number;
}

function findRunRanges(svg: string): RunRange[] {
  const ranges: RunRange[] = [];
  const openText = /<text\b[^>]*?(\/?)>/gi;
  let match: RegExpExecArray | null;
  while ((match = openText.exec(svg))) {
    if (match[1] === "/") continue; // self-closing <text/> holds no content
    const contentStart = match.index + match[0].length;
    const closeIdx = svg.indexOf("</text", contentStart);
    if (closeIdx === -1) continue;
    const block = svg.slice(contentStart, closeIdx);

    const tspan = /<tspan\b[^>]*?(\/?)>/gi;
    let inner: RegExpExecArray | null;
    let found = false;
    while ((inner = tspan.exec(block))) {
      if (inner[1] === "/") continue;
      const innerStart = inner.index + inner[0].length;
      const innerClose = block.indexOf("</tspan", innerStart);
      if (innerClose === -1) continue;
      found = true;
      ranges.push({ start: contentStart + innerStart, end: contentStart + innerClose });
    }
    if (!found) ranges.push({ start: contentStart, end: closeIdx });
    openText.lastIndex = closeIdx;
  }
  return ranges;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function encodeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function listTextRuns(svg: string): TextRun[] {
  return findRunRanges(svg).map((r, index) => ({
    index,
    text: decodeEntities(svg.slice(r.start, r.end)).trim(),
  }));
}

/** Replaces the text of one run, leaving every attribute and sibling untouched. */
export function patchTextRun(svg: string, index: number, text: string): string {
  const ranges = findRunRanges(svg);
  const target = ranges[index];
  if (!target) throw new Error(`Text run ${index} does not exist (slide has ${ranges.length})`);
  return svg.slice(0, target.start) + encodeText(text) + svg.slice(target.end);
}
