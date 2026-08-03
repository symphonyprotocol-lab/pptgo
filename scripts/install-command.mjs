// Installs the generated /pptgo command into ~/.claude/commands so every
// Claude Code session sees it, not just sessions opened in this repo.
// Re-run after editing prompts/pptgo.md (build regenerates the source copy).
import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(homedir(), ".claude", "commands", "pptgo.md");

await mkdir(dirname(target), { recursive: true });
await copyFile(join(root, ".claude/commands/pptgo.md"), target);

console.log(`installed ${target}`);
console.log("MCP server (one time, all projects):");
console.log(
  `  claude mcp add --scope user pptgo -e PPT_MASTER_HOME=${root}/vendor/ppt-master ` +
    `-e PPTGO_PYTHON=${root}/vendor/venv/bin/python -- node ${root}/dist/index.js`,
);
