/**
 * Claude Code headless (`claude -p`) — tumcha Claude login vaparto, vegli API key nako.
 * API key / Vertex vaparaycha asel tar fakt env badla (ANTHROPIC_API_KEY, CLAUDE_CODE_USE_VERTEX).
 */
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";

const CLAUDE = process.env.CLAUDE_BIN || "claude";
const MODEL = process.env.CEO_MODEL; // nasel tar Claude Code cha default

/**
 * Konta Claude account — `CLAUDE_CONFIG_DIR` (`.env`) asel tar to, nahitar `~/.claude`.
 * Login nasel tar runner suruch nako (nahitar pratyek command fail).
 */
export function claudeAccount(): string {
  let status: { loggedIn?: boolean; email?: string; subscriptionType?: string; authMethod?: string };
  try {
    status = JSON.parse(execFileSync(CLAUDE, ["auth", "status"], { env: process.env, encoding: "utf8" }));
  } catch {
    status = {};
  }
  const dir = process.env.CLAUDE_CONFIG_DIR ?? "~/.claude";
  if (!status.loggedIn) {
    console.error(`✘ Claude login nahi (${dir}). Ekda: CLAUDE_CONFIG_DIR=${dir} claude → /login`);
    process.exit(1);
  }
  return `${status.email ?? status.authMethod} (${status.subscriptionType ?? status.authMethod}, ${dir})`;
}

/** Agent la fakt edit + checks; commit / push / deploy runner swatah karto (approve nantar). */
const ALLOWED = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(npm run:*)",
  "Bash(npm --prefix:*)",
  "Bash(npx tsc:*)",
  "Bash(flutter analyze:*)",
  "Bash(flutter pub get:*)",
  "Bash(flutter test:*)",
  "Bash(dart format:*)",
  "Bash(dart fix:*)",
  "Bash(git status:*)",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(ls:*)",
];
const DENIED = ["Bash(git push:*)", "Bash(git commit:*)", "Bash(git merge:*)", "Bash(firebase:*)", "Bash(rm -rf:*)"];

function spawnClaude(args: string[], cwd: string, input: string, onLine: (line: string) => void) {
  return new Promise<number>((resolve) => {
    const p = spawn(CLAUDE, args, { cwd, env: process.env });
    let buf = "";
    let err = "";
    p.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.forEach((l) => l.trim() && onLine(l));
    });
    p.stderr.on("data", (c: Buffer) => (err = (err + c.toString()).slice(-4000)));
    p.on("error", (e) => {
      err += String(e);
      resolve(127);
    });
    p.on("close", (code) => {
      if (buf.trim()) onLine(buf);
      if (code && err) console.error(err);
      resolve(code ?? 1);
    });
    p.stdin.end(input);
  });
}

export interface AgentResult {
  text: string;
  ok: boolean;
  cost: number;
}

/** Ek tool call → ek chhoti line (panel var "kay chalu ahe"). */
function describe(block: { type: string; name?: string; input?: Record<string, unknown>; text?: string }, cwd: string) {
  const file = (v: unknown) => (typeof v === "string" ? path.relative(cwd, v) || v : "");
  if (block.type === "text") return block.text?.trim() ? `💬 ${block.text.trim().slice(0, 160)}` : null;
  if (block.type !== "tool_use") return null;
  const i = block.input ?? {};
  switch (block.name) {
    case "Edit":
    case "Write":
      return `✏️ ${file(i.file_path)}`;
    case "Read":
      return `📖 ${file(i.file_path)}`;
    case "Grep":
    case "Glob":
      return `🔎 ${String(i.pattern ?? "")}`;
    case "Bash":
      return `$ ${String(i.command ?? "").slice(0, 120)}`;
    default:
      return `🔧 ${block.name}`;
  }
}

/**
 * Agent chalva. Pahilyanda `--session-id`, follow-up la `--resume` — mhanje "ajun he badal"
 * mhantla ki agent la adhicha sagla context (project, kelele badal) athvto.
 */
export async function runAgent(opts: {
  cwd: string;
  prompt: string;
  system: string;
  sessionId: string;
  resume: boolean;
  onProgress: (line: string) => void;
}): Promise<AgentResult> {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "acceptEdits",
    "--allowedTools", ALLOWED.join(","),
    "--disallowedTools", DENIED.join(","),
    "--append-system-prompt", opts.system,
    ...(opts.resume ? ["--resume", opts.sessionId] : ["--session-id", opts.sessionId]),
    ...(MODEL ? ["--model", MODEL] : []),
  ];
  let result: AgentResult = { text: "", ok: false, cost: 0 };
  const code = await spawnClaude(args, opts.cwd, opts.prompt, (line) => {
    let ev: { type?: string; message?: { content?: unknown[] }; result?: string; is_error?: boolean; total_cost_usd?: number };
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (ev.type === "assistant") {
      for (const b of (ev.message?.content ?? []) as Parameters<typeof describe>[0][]) {
        const d = describe(b, opts.cwd);
        if (d) opts.onProgress(d);
      }
    } else if (ev.type === "result") {
      result = { text: ev.result ?? "", ok: !ev.is_error, cost: ev.total_cost_usd ?? 0 };
    }
  });
  if (code !== 0 && result.ok) result.ok = false;
  return result;
}

/** Ek prashna, JSON uttar (tools nahit, swast model) — project olkhayla. */
export async function askJson<T>(prompt: string, schema: object, cwd: string): Promise<T | null> {
  const args = ["-p", "--output-format", "json", "--model", process.env.CEO_ROUTER_MODEL || "haiku", "--tools", "", "--json-schema", JSON.stringify(schema)];
  let out = "";
  const code = await spawnClaude(args, cwd, prompt, (l) => (out += l));
  if (code !== 0) return null;
  try {
    const j = JSON.parse(out);
    return (j.structured_output ?? JSON.parse(j.result)) as T;
  } catch {
    return null;
  }
}
