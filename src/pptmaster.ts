import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { scriptsDir, type Config } from "./config.js";

const execFileAsync = promisify(execFile);

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Runs one ppt-master script, e.g. `runScript(cfg, "svg_to_pptx.py", [projectDir])`.
 * The ppt-master repo root is used as cwd because several scripts resolve
 * `templates/` and `projects/` relative to it.
 */
export async function runScript(
  cfg: Config,
  script: string,
  args: string[],
  timeoutMs = 10 * 60 * 1000,
): Promise<RunResult> {
  if (!cfg.pptMasterHome) {
    return { ok: false, stdout: "", stderr: "ppt-master is not configured" };
  }
  const scriptPath = join(scriptsDir(cfg.pptMasterHome), script);
  try {
    const { stdout, stderr } = await execFileAsync(cfg.python, [scriptPath, ...args], {
      cwd: cfg.pptMasterHome,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr || e.message || String(err),
    };
  }
}

/** Keeps command output small enough to stay out of the model's way. */
export function tail(text: string, lines = 12): string {
  const trimmed = text.trimEnd();
  if (!trimmed) return "";
  const parts = trimmed.split("\n");
  return parts.slice(-lines).join("\n");
}
