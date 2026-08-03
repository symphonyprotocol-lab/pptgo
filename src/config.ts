import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface Config {
  /** Root of a checked-out hugohe3/ppt-master repo, or null when unavailable. */
  pptMasterHome: string | null;
  /** Python interpreter used to run ppt-master scripts. */
  python: string;
  /** Directory holding deck projects. */
  workspace: string;
}

/**
 * ppt-master keeps its runnable scripts under `skills/ppt-master/scripts/`.
 * We treat the presence of the SVG->PPTX exporter as proof of a usable checkout.
 */
export function scriptsDir(home: string): string {
  return join(home, "skills", "ppt-master", "scripts");
}

function looksLikePptMaster(dir: string): boolean {
  return existsSync(join(scriptsDir(dir), "svg_to_pptx.py"));
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawHome = env.PPT_MASTER_HOME?.trim();
  let pptMasterHome: string | null = null;
  if (rawHome) {
    const abs = resolve(rawHome.replace(/^~(?=\/|$)/, homedir()));
    if (looksLikePptMaster(abs)) pptMasterHome = abs;
  }

  const workspace = env.PPTGO_WORKSPACE?.trim()
    ? resolve(env.PPTGO_WORKSPACE.trim().replace(/^~(?=\/|$)/, homedir()))
    : pptMasterHome
      ? join(pptMasterHome, "projects")
      : join(homedir(), ".pptgo", "projects");

  return {
    pptMasterHome,
    python: env.PPTGO_PYTHON?.trim() || "python3",
    workspace,
  };
}

/** Human-readable note appended to tool output when ppt-master is not wired up. */
export const NO_PPT_MASTER_HINT =
  "PPT_MASTER_HOME is not set to a valid ppt-master checkout, so PPTX export is unavailable. " +
  "Clone https://github.com/hugohe3/ppt-master, install its requirements, and set PPT_MASTER_HOME in the MCP server config.";
