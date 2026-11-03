import { spawn } from "node:child_process";

export interface ShResult {
  code: number;
  out: string;
}

/** Output cha shevatcha bhag — Firestore / agent la evdhach purto. */
export const tail = (s: string, n = 4000) => (s.length > n ? "…" + s.slice(-n) : s);

/** Shell command (bash). Code != 0 tar throw nahi — `run` vapra. */
export function sh(cmd: string, cwd: string, onLine?: (line: string) => void): Promise<ShResult> {
  return new Promise((resolve) => {
    const p = spawn("/bin/bash", ["-lc", cmd], { cwd, env: process.env });
    let out = "";
    let buf = "";
    const take = (chunk: Buffer) => {
      const s = chunk.toString();
      out = (out + s).slice(-200_000);
      if (!onLine) return;
      buf += s;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.forEach((l) => l.trim() && onLine(l));
    };
    p.stdout.on("data", take);
    p.stderr.on("data", take);
    p.on("error", (err) => resolve({ code: 127, out: String(err) }));
    p.on("close", (code) => {
      if (onLine && buf.trim()) onLine(buf);
      resolve({ code: code ?? 1, out });
    });
  });
}

/** Fail zala tar command + output sobat throw. */
export async function run(cmd: string, cwd: string, onLine?: (line: string) => void): Promise<string> {
  const r = await sh(cmd, cwd, onLine);
  if (r.code !== 0) throw new Error(`\`${cmd}\` fail (${r.code}):\n${tail(r.out, 1500)}`);
  return r.out;
}

/** Shell sathi safe quote. */
export const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
