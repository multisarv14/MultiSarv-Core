/**
 * Command konta project cha? — project nivadla nasel tar runner olkhto.
 *  1. Naav / keyword ekach project shi jultat → thet to.
 *  2. Nahitar Claude (haiku) la sagle projects cha context + alikadche commands deun vicharto.
 *  3. Khatri kami (< 0.7) → panel var "konta project?" vicharto, andaz karat nahi.
 */
import { askJson } from "./claude.ts";
import { docsOf, type Project } from "./projects.ts";

export interface Match {
  projectId: string | null;
  confidence: number;
  reason: string;
  candidates: string[];
}

const CONFIDENT = 0.7;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

function keywordHits(command: string, p: Project): string[] {
  const c = norm(command);
  const terms = [p.id, p.name, ...(p.keywords ?? [])].map(norm).filter((t) => t.length >= 3);
  return [...new Set(terms.filter((t) => c.includes(t)))];
}

const SCHEMA = {
  type: "object",
  properties: {
    projectId: { type: ["string", "null"], description: "Best matching project id, or null if none fits" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", description: "One short sentence (Marathi, Roman script) why" },
    candidates: { type: "array", items: { type: "string" }, description: "Plausible project ids, best first (max 3)" },
  },
  required: ["projectId", "confidence", "reason", "candidates"],
};

/** `recent` = alikadche commands (navin pahile) — "tyach project madhe ajun…" sathi. */
export async function matchProject(
  command: string,
  projects: Project[],
  recent: { projectId: string; command: string }[],
): Promise<Match> {
  const hits = projects.map((p) => ({ p, terms: keywordHits(command, p) })).filter((h) => h.terms.length);
  if (hits.length === 1) {
    return { projectId: hits[0].p.id, confidence: 0.95, reason: `Command madhe "${hits[0].terms.join('", "')}" ahe`, candidates: [hits[0].p.id] };
  }

  const catalog = projects
    .map((p) => {
      const last = recent.filter((r) => r.projectId === p.id).slice(0, 5).map((r) => `    - ${r.command.slice(0, 160)}`);
      return [
        `## ${p.id} — ${p.name} (${p.type})`,
        `Context: ${p.context}`,
        p.keywords?.length ? `Keywords: ${p.keywords.join(", ")}` : "",
        `Docs excerpt:\n${docsOf(p, 700).replace(/\n{2,}/g, "\n")}`,
        last.length ? `Recent commands:\n${last.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const prompt = [
    "You route a CEO's code-change command to the software project it belongs to.",
    "The command may be in Marathi / Hindi / English (Roman or Devanagari).",
    "Pick the single project whose context, features and recent work the command refers to.",
    "If the command says 'same project' / 'tyach project madhe' / similar, use the most recent command's project.",
    "If it genuinely fits several or none, give low confidence and list candidates.",
    recent[0] ? `Most recent command was for project: ${recent[0].projectId}` : "",
    hits.length > 1 ? `Keyword matches (ambiguous): ${hits.map((h) => h.p.id).join(", ")}` : "",
    `\n# Projects\n\n${catalog}`,
    `\n# Command\n\n${command}`,
  ]
    .filter(Boolean)
    .join("\n");

  const ids = new Set(projects.map((p) => p.id));
  const r = await askJson<Match>(prompt, SCHEMA, process.cwd());
  if (!r) return { projectId: null, confidence: 0, reason: "Project olkhta ala nahi", candidates: projects.map((p) => p.id).slice(0, 3) };
  const candidates = [...new Set([r.projectId, ...(r.candidates ?? [])])].filter((id): id is string => !!id && ids.has(id)).slice(0, 3);
  const projectId = r.projectId && ids.has(r.projectId) && r.confidence >= CONFIDENT ? r.projectId : null;
  return { projectId, confidence: r.confidence, reason: r.reason, candidates };
}
