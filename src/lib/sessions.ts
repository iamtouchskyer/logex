// Shared logic for listing recent Claude Code session JSONLs.
// Article fetch goes through the GitHub Contents API — no local filesystem read
// against any logex-data path.
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Octokit } from "@octokit/rest";
import { resolveGitHubToken } from "./github-token.js";

export interface SessionEntry {
  path: string;
  project: string;
  mtime: number;
  source: "claude-code" | "codex" | "pi";
}

export function listRecentSessions(limit = 10): SessionEntry[] {
  const projectsDir = join(homedir(), ".claude", "projects");
  if (!existsSync(projectsDir)) return [];

  const out: SessionEntry[] = [];
  for (const proj of readdirSync(projectsDir)) {
    const dir = join(projectsDir, proj);
    let stat;
    try {
      stat = statSync(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const f of safeReadDir(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(dir, f);
      try {
        const s = statSync(p);
        out.push({ path: p, project: proj, mtime: s.mtimeMs, source: "claude-code" });
      } catch {
        /* skip */
      }
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Codex CLI stores sessions as ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl.
 * Missing levels are tolerated — anything unreadable just yields nothing.
 */
export function listRecentCodexSessions(limit = 10): SessionEntry[] {
  const root = join(homedir(), ".codex", "sessions");
  const out: SessionEntry[] = [];
  for (const year of safeReadDir(root)) {
    for (const month of safeReadDir(join(root, year))) {
      for (const day of safeReadDir(join(root, year, month))) {
        for (const f of safeReadDir(join(root, year, month, day))) {
          if (!f.endsWith(".jsonl")) continue;
          const p = join(root, year, month, day, f);
          try {
            const s = statSync(p);
            out.push({ path: p, project: "codex", mtime: s.mtimeMs, source: "codex" });
          } catch {
            /* skip */
          }
        }
      }
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

/**
 * Pi agent sessions live at ~/.pi/agent/sessions/--<cwd-with-dashes>--/<ts>_<uuid>.jsonl.
 * The directory name is the project label (dashes kept as-is — exact cwd
 * reconstruction is ambiguous when paths contain dashes).
 */
export function listRecentPiSessions(limit = 10): SessionEntry[] {
  const root = join(homedir(), ".pi", "agent", "sessions");
  const out: SessionEntry[] = [];
  for (const dir of safeReadDir(root)) {
    const projectDir = join(root, dir);
    let stat;
    try {
      stat = statSync(projectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const project = dir.replace(/^-+|-+$/g, "") || "pi";
    for (const f of safeReadDir(projectDir)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(projectDir, f);
      try {
        const s = statSync(p);
        out.push({ path: p, project, mtime: s.mtimeMs, source: "pi" });
      } catch {
        /* skip */
      }
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

/** Most recent sessions across all supported sources (Claude Code + Codex + Pi). */
export function listAllSessions(limit = 10): SessionEntry[] {
  return [
    ...listRecentSessions(limit),
    ...listRecentCodexSessions(limit),
    ...listRecentPiSessions(limit),
  ]
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

export interface LogexArticle {
  slug: string;
  [key: string]: unknown;
}

const DATA_REPO_OWNER = "iamtouchskyer";
const DATA_REPO_NAME = "logex-data";
const DATA_REPO_BRANCH = "main";

/**
 * Fetch an article JSON from iamtouchskyer/logex-data on GitHub by slug.
 * Reads the remote index, resolves the article's primary-language path
 * (honouring the i18n shape, falling back to the legacy flat `path`),
 * then fetches + base64-decodes the article JSON. Returns null on 404.
 */
export async function readArticleBySlug(
  slug: string,
  octokit?: Pick<Octokit, "rest">,
): Promise<LogexArticle | null> {
  const client: Pick<Octokit, "rest"> =
    octokit ?? new Octokit({ auth: resolveGitHubToken() });

  let indexJson: unknown;
  try {
    const res = await client.rest.repos.getContent({
      owner: DATA_REPO_OWNER,
      repo: DATA_REPO_NAME,
      path: "index.json",
      ref: DATA_REPO_BRANCH,
    });
    const data = res.data as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;
    indexJson = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }

  interface Entry { slug?: string; path?: string; primaryLang?: string; i18n?: Record<string, { path?: string }> }
  const entries: Entry[] = Array.isArray(indexJson)
    ? (indexJson as Entry[])
    : (((indexJson as { articles?: unknown[] })?.articles ?? []) as Entry[]);

  const match = entries.find((e) => e?.slug === slug);
  if (!match) return null;

  const primaryPath =
    (match.primaryLang ? match.i18n?.[match.primaryLang]?.path : undefined) ??
    match.path ??
    `${slug}.json`;

  if (primaryPath.includes("..")) return null;

  try {
    const fileRes = await client.rest.repos.getContent({
      owner: DATA_REPO_OWNER,
      repo: DATA_REPO_NAME,
      path: primaryPath,
      ref: DATA_REPO_BRANCH,
    });
    const data = fileRes.data as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    return JSON.parse(decoded) as LogexArticle;
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}
