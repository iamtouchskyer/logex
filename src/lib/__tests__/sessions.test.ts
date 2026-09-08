import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn((path: unknown): boolean => String(path).length < 0),
  readdirSync: vi.fn((path: unknown): string[] => (String(path).length < 0 ? [""] : [])),
  statSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: fsMocks.existsSync,
  readdirSync: fsMocks.readdirSync,
  statSync: fsMocks.statSync,
  default: {
    existsSync: fsMocks.existsSync,
    readdirSync: fsMocks.readdirSync,
    statSync: fsMocks.statSync,
  },
}));

import { readArticleBySlug, listRecentSessions, listRecentCodexSessions, listRecentPiSessions, listRecentDshSessions, listAllSessions } from "../sessions";

const projectsDir = join(homedir(), ".claude", "projects");
const codexDir = join(homedir(), ".codex", "sessions");
const piDir = join(homedir(), ".pi", "agent", "sessions");

type MockFn = ReturnType<typeof vi.fn>;

function makeOctokit(getContent: MockFn) {
  return {
    rest: {
      repos: { getContent },
    },
  } as unknown as Parameters<typeof readArticleBySlug>[1];
}

function encode(obj: unknown): { data: { content: string; encoding: string } } {
  return {
    data: {
      content: Buffer.from(JSON.stringify(obj)).toString("base64"),
      encoding: "base64",
    },
  };
}

describe("readArticleBySlug – GitHub fetch", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("resolves a legitimate slug via legacy flat path entry", async () => {
    const article = { slug: "hello", title: "Hello" };
    const getContent = vi.fn()
      .mockResolvedValueOnce(encode([{ slug: "hello" }]))
      .mockResolvedValueOnce(encode(article));
    const result = await readArticleBySlug("hello", makeOctokit(getContent));
    expect(result).toEqual(article);
    // second call targets the slug's default path
    const secondCallArgs = getContent.mock.calls[1][0];
    expect(secondCallArgs.path).toBe("hello.json");
  });

  it("resolves a slug using the i18n primaryLang path", async () => {
    const article = { slug: "i18n-slug", title: "Hi" };
    const idx = {
      articles: [
        {
          slug: "i18n-slug",
          primaryLang: "zh",
          i18n: { zh: { path: "2026/04/10/i18n-slug.zh.json" } },
        },
      ],
    };
    const getContent = vi.fn()
      .mockResolvedValueOnce(encode(idx))
      .mockResolvedValueOnce(encode(article));
    const result = await readArticleBySlug("i18n-slug", makeOctokit(getContent));
    expect(result).toEqual(article);
    expect(getContent.mock.calls[1][0].path).toBe("2026/04/10/i18n-slug.zh.json");
  });

  it("supports the {articles: [...]} index wrapper", async () => {
    const article = { slug: "wrap" };
    const getContent = vi.fn()
      .mockResolvedValueOnce(encode({ articles: [{ slug: "wrap" }] }))
      .mockResolvedValueOnce(encode(article));
    expect(await readArticleBySlug("wrap", makeOctokit(getContent))).toEqual(article);
  });

  it("returns null when index fetch 404s", async () => {
    const getContent = vi.fn().mockRejectedValue(Object.assign(new Error("nf"), { status: 404 }));
    expect(await readArticleBySlug("x", makeOctokit(getContent))).toBeNull();
  });

  it("returns null when slug is not in index", async () => {
    const getContent = vi.fn().mockResolvedValueOnce(encode({ articles: [{ slug: "other" }] }));
    expect(await readArticleBySlug("missing", makeOctokit(getContent))).toBeNull();
  });

  it("returns null when article file 404s", async () => {
    const getContent = vi.fn()
      .mockResolvedValueOnce(encode({ articles: [{ slug: "gone" }] }))
      .mockRejectedValueOnce(Object.assign(new Error("nf"), { status: 404 }));
    expect(await readArticleBySlug("gone", makeOctokit(getContent))).toBeNull();
  });

  it("rejects paths containing '..'", async () => {
    const getContent = vi.fn().mockResolvedValueOnce(encode({
      articles: [{ slug: "evil", path: "../../../etc/passwd" }],
    }));
    expect(await readArticleBySlug("evil", makeOctokit(getContent))).toBeNull();
    expect(getContent).toHaveBeenCalledTimes(1);
  });

  it("returns null when index response has missing content", async () => {
    const getContent = vi.fn().mockResolvedValueOnce({ data: {} });
    expect(await readArticleBySlug("x", makeOctokit(getContent))).toBeNull();
  });

  it("returns null when file response has missing content", async () => {
    const getContent = vi.fn()
      .mockResolvedValueOnce(encode({ articles: [{ slug: "a" }] }))
      .mockResolvedValueOnce({ data: {} });
    expect(await readArticleBySlug("a", makeOctokit(getContent))).toBeNull();
  });

  it("rethrows non-404 errors from index fetch", async () => {
    const getContent = vi.fn().mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    await expect(readArticleBySlug("x", makeOctokit(getContent))).rejects.toThrow("boom");
  });

  it("rethrows non-404 errors from article fetch", async () => {
    const getContent = vi.fn()
      .mockResolvedValueOnce(encode({ articles: [{ slug: "a" }] }))
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }));
    await expect(readArticleBySlug("a", makeOctokit(getContent))).rejects.toThrow("boom");
  });
});

describe("listRecentSessions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns [] when projects dir does not exist", () => {
    fsMocks.existsSync.mockReturnValue(false);
    expect(listRecentSessions()).toEqual([]);
  });

  it("returns [] when projects dir is empty", () => {
    fsMocks.existsSync.mockImplementation((p: unknown) => String(p) === projectsDir);
    fsMocks.readdirSync.mockReturnValue([]);
    expect(listRecentSessions()).toEqual([]);
  });

  it("enumerates jsonl files across projects, newest first, respecting limit", () => {
    fsMocks.existsSync.mockImplementation((p: unknown) => String(p) === projectsDir);
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === projectsDir) return ["proj-a", "proj-b"];
      if (s === join(projectsDir, "proj-a")) return ["older.jsonl", "notes.md", "newest.jsonl"];
      if (s === join(projectsDir, "proj-b")) return ["middle.jsonl"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(projectsDir, "proj-a") || s === join(projectsDir, "proj-b")) {
        return { isDirectory: () => true } as unknown as ReturnType<typeof fsMocks.statSync>;
      }
      if (s.endsWith("older.jsonl")) return { mtimeMs: 100 } as never;
      if (s.endsWith("middle.jsonl")) return { mtimeMs: 200 } as never;
      if (s.endsWith("newest.jsonl")) return { mtimeMs: 300 } as never;
      throw new Error("unexpected stat: " + s);
    });
    const all = listRecentSessions(10);
    expect(all.map((e) => e.path.split("/").pop())).toEqual(["newest.jsonl", "middle.jsonl", "older.jsonl"]);
    expect(all[0].project).toBe("proj-a");
    expect(all[0].mtime).toBe(300);

    const limited = listRecentSessions(2);
    expect(limited).toHaveLength(2);
  });

  it("skips entries whose statSync throws and non-directory entries", () => {
    fsMocks.existsSync.mockImplementation((p: unknown) => String(p) === projectsDir);
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === projectsDir) return ["broken-dir", "afile", "good"];
      if (s === join(projectsDir, "good")) return ["s.jsonl"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(projectsDir, "broken-dir")) throw new Error("stat failed");
      if (s === join(projectsDir, "afile"))
        return { isDirectory: () => false } as unknown as ReturnType<typeof fsMocks.statSync>;
      if (s === join(projectsDir, "good"))
        return { isDirectory: () => true } as unknown as ReturnType<typeof fsMocks.statSync>;
      if (s === join(projectsDir, "good", "s.jsonl"))
        return { mtimeMs: 42 } as never;
      throw new Error("unexpected stat: " + s);
    });
    const out = listRecentSessions();
    expect(out).toHaveLength(1);
    expect(out[0].project).toBe("good");
  });

  it("skips jsonl files whose statSync throws", () => {
    fsMocks.existsSync.mockImplementation((p: unknown) => String(p) === projectsDir);
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === projectsDir) return ["p"];
      if (s === join(projectsDir, "p")) return ["ok.jsonl", "bad.jsonl"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(projectsDir, "p"))
        return { isDirectory: () => true } as unknown as ReturnType<typeof fsMocks.statSync>;
      if (s.endsWith("ok.jsonl")) return { mtimeMs: 1 } as never;
      if (s.endsWith("bad.jsonl")) throw new Error("stat failed");
      throw new Error("unexpected stat: " + s);
    });
    const out = listRecentSessions();
    expect(out).toHaveLength(1);
    expect(out[0].path.endsWith("ok.jsonl")).toBe(true);
  });
});

describe("listRecentCodexSessions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns [] when the codex root cannot be read", () => {
    fsMocks.readdirSync.mockImplementation(() => {
      throw new Error("missing dir");
    });
    expect(listRecentCodexSessions()).toEqual([]);
  });

  it("enumerates rollout files across YYYY/MM/DD, newest first", () => {
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === codexDir) return ["2026"];
      if (s === join(codexDir, "2026")) return ["03"];
      if (s === join(codexDir, "2026", "03")) return ["07", "20"];
      if (s === join(codexDir, "2026", "03", "07")) return ["rollout-a.jsonl", "notes.txt"];
      if (s === join(codexDir, "2026", "03", "20")) return ["rollout-b.jsonl"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.endsWith("rollout-a.jsonl")) return { mtimeMs: 100 } as never;
      if (s.endsWith("rollout-b.jsonl")) return { mtimeMs: 200 } as never;
      throw new Error("unexpected stat: " + s);
    });
    const out = listRecentCodexSessions(10);
    expect(out.map((e) => e.path.split("/").pop())).toEqual(["rollout-b.jsonl", "rollout-a.jsonl"]);
    expect(out[0]).toMatchObject({ project: "codex", source: "codex", mtime: 200 });
  });

  it("skips files whose statSync throws", () => {
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === codexDir) return ["2026"];
      if (s === join(codexDir, "2026")) return ["03"];
      if (s === join(codexDir, "2026", "03")) return ["07"];
      if (s === join(codexDir, "2026", "03", "07")) return ["ok.jsonl", "bad.jsonl"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.endsWith("ok.jsonl")) return { mtimeMs: 5 } as never;
      if (s.endsWith("bad.jsonl")) throw new Error("stat failed");
      throw new Error("unexpected stat: " + s);
    });
    const out = listRecentCodexSessions();
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("codex");
  });
});

describe("listRecentPiSessions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns [] when the pi root cannot be read", () => {
    fsMocks.readdirSync.mockImplementation(() => {
      throw new Error("missing dir");
    });
    expect(listRecentPiSessions()).toEqual([]);
  });

  it("enumerates project dirs newest first, stripping edge dashes", () => {
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === piDir) return ["--Users-touchskyer-Code-logex--", "notes"];
      if (s === join(piDir, "--Users-touchskyer-Code-logex--")) return ["20260101_a.jsonl", "b.txt"];
      if (s === join(piDir, "notes")) return ["c.jsonl"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.endsWith("notes")) return { isDirectory: () => true } as unknown as ReturnType<typeof fsMocks.statSync>;
      if (s.endsWith("--Users-touchskyer-Code-logex--")) return { isDirectory: () => true } as unknown as ReturnType<typeof fsMocks.statSync>;
      if (s.endsWith("20260101_a.jsonl")) return { mtimeMs: 10 } as never;
      if (s.endsWith("c.jsonl")) return { mtimeMs: 20 } as never;
      throw new Error("unexpected stat: " + s);
    });
    const out = listRecentPiSessions(10);
    expect(out.map((e) => e.path.split("/").pop())).toEqual(["c.jsonl", "20260101_a.jsonl"]);
    expect(out[0]).toMatchObject({ project: "notes", source: "pi", mtime: 20 });
    expect(out[1].project).toBe("Users-touchskyer-Code-logex");
  });

  it("skips files whose statSync throws", () => {
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === piDir) return ["d"];
      if (s === join(piDir, "d")) return ["ok.jsonl", "bad.jsonl"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(piDir, "d")) return { isDirectory: () => true } as unknown as ReturnType<typeof fsMocks.statSync>;
      if (s.endsWith("ok.jsonl")) return { mtimeMs: 1 } as never;
      if (s.endsWith("bad.jsonl")) throw new Error("stat failed");
      throw new Error("unexpected stat: " + s);
    });
    const out = listRecentPiSessions();
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("pi");
  });
});

describe("listRecentDshSessions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns [] when the dsh root cannot be read", () => {
    fsMocks.readdirSync.mockImplementation(() => {
      throw new Error("missing dir");
    });
    expect(listRecentDshSessions()).toEqual([]);
  });

  it("enumerates session transcripts newest first, stripping edge dashes", () => {
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === piDir) return ["unused"];
      if (s === join(homedir(), ".dsh", "sessions")) return ["--Users-touchskyer-Code-logex--"];
      if (s === join(homedir(), ".dsh", "sessions", "--Users-touchskyer-Code-logex--")) return ["session-abc", "loose.txt"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.endsWith("--Users-touchskyer-Code-logex--") || s.endsWith("session-abc")) {
        return { isDirectory: () => true } as unknown as ReturnType<typeof fsMocks.statSync>;
      }
      if (s.endsWith("session.jsonl.zstd")) return { mtimeMs: 42 } as never;
      throw new Error("unexpected stat: " + s);
    });
    const out = listRecentDshSessions(10);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      project: "Users-touchskyer-Code-logex",
      source: "dsh",
      mtime: 42,
    });
    expect(out[0].path.endsWith("session.jsonl.zstd")).toBe(true);
  });

  it("prefers the plain jsonl when only that exists", () => {
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(homedir(), ".dsh", "sessions")) return ["d"];
      if (s === join(homedir(), ".dsh", "sessions", "d")) return ["s1"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(homedir(), ".dsh", "sessions", "d") || s === join(homedir(), ".dsh", "sessions", "d", "s1")) {
        return { isDirectory: () => true } as unknown as ReturnType<typeof fsMocks.statSync>;
      }
      if (s === join(homedir(), ".dsh", "sessions", "d", "s1", "session.jsonl")) return { mtimeMs: 7 } as never;
      throw new Error("unexpected stat: " + s);
    });
    const out = listRecentDshSessions();
    expect(out).toHaveLength(1);
    expect(out[0].path.endsWith("session.jsonl")).toBe(true);
  });
});

describe("listAllSessions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("merges claude + codex + pi entries sorted by mtime desc", () => {
    fsMocks.existsSync.mockImplementation((p: unknown) => String(p) === projectsDir);
    fsMocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === projectsDir) return ["proj"];
      if (s === join(projectsDir, "proj")) return ["claude.jsonl"];
      if (s === codexDir) return ["2026"];
      if (s === join(codexDir, "2026")) return ["01"];
      if (s === join(codexDir, "2026", "01")) return ["01"];
      if (s === join(codexDir, "2026", "01", "01")) return ["rollout.jsonl"];
      if (s === piDir) return ["d"];
      if (s === join(piDir, "d")) return ["pi.jsonl"];
      return [];
    });
    fsMocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(projectsDir, "proj") || s === join(piDir, "d")) {
        return { isDirectory: () => true } as unknown as ReturnType<typeof fsMocks.statSync>;
      }
      if (s.endsWith("claude.jsonl")) return { mtimeMs: 300 } as never;
      if (s.endsWith("rollout.jsonl")) return { mtimeMs: 100 } as never;
      if (s.endsWith("pi.jsonl")) return { mtimeMs: 200 } as never;
      throw new Error("unexpected stat: " + s);
    });
    const out = listAllSessions(10);
    expect(out.map((e) => e.source)).toEqual(["claude-code", "pi", "codex"]);
    expect(out[0].mtime).toBe(300);
  });
});
