// Shared logic for listing recent Claude Code session JSONLs.
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SessionEntry {
  path: string;
  project: string;
  mtime: number;
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
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(dir, f);
      try {
        const s = statSync(p);
        out.push({ path: p, project: proj, mtime: s.mtimeMs });
      } catch {
        /* skip */
      }
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

export interface LogexArticle {
  slug: string;
  [key: string]: unknown;
}

/**
 * Read article JSON from logex-data by slug. Looks up `index.json`, fetches
 * the matching entry's `path`, reads the file. Returns null if not found.
 */
export function readArticleBySlug(slug: string): LogexArticle | null {
  const dataDir = join(homedir(), "Code", "logex-data");
  const indexPath = join(dataDir, "index.json");
  if (!existsSync(indexPath)) return null;

  let index: unknown;
  try {
    index = JSON.parse(readFileSync(indexPath, "utf-8"));
  } catch {
    return null;
  }

  const entries: unknown[] = Array.isArray(index)
    ? index
    : (index as { articles?: unknown[] })?.articles ?? [];

  const match = entries.find(
    (e): e is { slug: string; path?: string } =>
      typeof e === "object" &&
      e !== null &&
      (e as { slug?: unknown }).slug === slug,
  );
  if (!match) return null;

  const rel = match.path ?? `${slug}.json`;
  const full = rel.startsWith("/") ? rel : join(dataDir, rel);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, "utf-8")) as LogexArticle;
  } catch {
    return null;
  }
}
