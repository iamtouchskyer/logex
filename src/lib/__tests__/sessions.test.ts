import { describe, it, expect, vi, beforeEach } from "vitest";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const mocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  existsSync: vi.fn((_p?: unknown): boolean => false),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readFileSync: vi.fn((_p?: unknown, _o?: unknown): string => ""),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readdirSync: vi.fn((_p?: unknown): string[] => []),
  statSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  readdirSync: mocks.readdirSync,
  statSync: mocks.statSync,
  default: {
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
    readdirSync: mocks.readdirSync,
    statSync: mocks.statSync,
  },
}));

import { readArticleBySlug, listRecentSessions } from "../sessions";

const dataDir = join(homedir(), "Code", "logex-data");
const projectsDir = join(homedir(), ".claude", "projects");

describe("readArticleBySlug – path traversal guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a legitimate slug correctly", () => {
    const article = { slug: "hello", title: "Hello" };
    mocks.existsSync.mockImplementation((p: unknown) => {
      const s = String(p);
      return s === join(dataDir, "index.json") || s === resolve(dataDir, "hello.json");
    });
    mocks.readFileSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(dataDir, "index.json"))
        return JSON.stringify([{ slug: "hello" }]);
      return JSON.stringify(article);
    });

    expect(readArticleBySlug("hello")).toEqual(article);
  });

  it("throws on path with '..'", () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockImplementation((p: unknown) => {
      if (String(p) === join(dataDir, "index.json"))
        return JSON.stringify([{ slug: "evil", path: "../../../etc/passwd" }]);
      return "root:x:0:0";
    });

    expect(() => readArticleBySlug("evil")).toThrow("Invalid article path");
  });

  it("throws on absolute path", () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockImplementation((p: unknown) => {
      if (String(p) === join(dataDir, "index.json"))
        return JSON.stringify([{ slug: "abs", path: "/etc/passwd" }]);
      return "root:x:0:0";
    });

    expect(() => readArticleBySlug("abs")).toThrow("Invalid article path");
  });
});

describe("readArticleBySlug – additional branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when index.json is missing", () => {
    mocks.existsSync.mockReturnValue(false);
    expect(readArticleBySlug("anything")).toBeNull();
  });

  it("returns null when index.json has invalid JSON", () => {
    mocks.existsSync.mockImplementation(
      (p: unknown) => String(p) === join(dataDir, "index.json"),
    );
    mocks.readFileSync.mockReturnValue("{ not valid json");
    expect(readArticleBySlug("any")).toBeNull();
  });

  it("supports the {articles:[…]} index wrapper form", () => {
    const article = { slug: "wrap", title: "Wrap" };
    mocks.existsSync.mockImplementation((p: unknown) => {
      const s = String(p);
      return s === join(dataDir, "index.json") || s === resolve(dataDir, "wrap.json");
    });
    mocks.readFileSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(dataDir, "index.json"))
        return JSON.stringify({ articles: [{ slug: "wrap" }] });
      return JSON.stringify(article);
    });
    expect(readArticleBySlug("wrap")).toEqual(article);
  });

  it("returns null when slug is not in index", () => {
    mocks.existsSync.mockImplementation(
      (p: unknown) => String(p) === join(dataDir, "index.json"),
    );
    mocks.readFileSync.mockReturnValue(JSON.stringify([{ slug: "other" }]));
    expect(readArticleBySlug("missing")).toBeNull();
  });

  it("returns null when article file does not exist on disk", () => {
    mocks.existsSync.mockImplementation(
      (p: unknown) => String(p) === join(dataDir, "index.json"),
    );
    mocks.readFileSync.mockImplementation((p: unknown) => {
      if (String(p) === join(dataDir, "index.json"))
        return JSON.stringify([{ slug: "gone" }]);
      return "";
    });
    expect(readArticleBySlug("gone")).toBeNull();
  });

  it("returns null when article file has invalid JSON", () => {
    mocks.existsSync.mockImplementation((p: unknown) => {
      const s = String(p);
      return s === join(dataDir, "index.json") || s === resolve(dataDir, "bad.json");
    });
    mocks.readFileSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(dataDir, "index.json"))
        return JSON.stringify([{ slug: "bad" }]);
      return "{ broken";
    });
    expect(readArticleBySlug("bad")).toBeNull();
  });

  it("skips non-object entries without matching", () => {
    mocks.existsSync.mockImplementation(
      (p: unknown) => String(p) === join(dataDir, "index.json"),
    );
    mocks.readFileSync.mockReturnValue(
      JSON.stringify(["garbage", null, 42, { slug: "other" }]),
    );
    expect(readArticleBySlug("x")).toBeNull();
  });
});

describe("listRecentSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] when projects dir does not exist", () => {
    mocks.existsSync.mockReturnValue(false);
    expect(listRecentSessions()).toEqual([]);
  });

  it("returns [] when projects dir is empty", () => {
    mocks.existsSync.mockImplementation((p: unknown) => String(p) === projectsDir);
    mocks.readdirSync.mockReturnValue([]);
    expect(listRecentSessions()).toEqual([]);
  });

  it("enumerates jsonl files across projects, newest first, respecting limit", () => {
    mocks.existsSync.mockImplementation((p: unknown) => String(p) === projectsDir);
    mocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === projectsDir) return ["proj-a", "proj-b"];
      if (s === join(projectsDir, "proj-a"))
        return ["older.jsonl", "notes.md", "newest.jsonl"];
      if (s === join(projectsDir, "proj-b")) return ["middle.jsonl"];
      return [];
    });
    mocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(projectsDir, "proj-a") || s === join(projectsDir, "proj-b")) {
        return { isDirectory: () => true } as unknown as ReturnType<typeof mocks.statSync>;
      }
      if (s.endsWith("older.jsonl")) return { mtimeMs: 100 } as never;
      if (s.endsWith("middle.jsonl")) return { mtimeMs: 200 } as never;
      if (s.endsWith("newest.jsonl")) return { mtimeMs: 300 } as never;
      throw new Error("unexpected stat: " + s);
    });

    const all = listRecentSessions(10);
    expect(all.map((e) => e.path.split("/").pop())).toEqual([
      "newest.jsonl",
      "middle.jsonl",
      "older.jsonl",
    ]);
    expect(all[0].project).toBe("proj-a");
    expect(all[0].mtime).toBe(300);

    const limited = listRecentSessions(2);
    expect(limited).toHaveLength(2);
    expect(limited.map((e) => e.path.endsWith(".jsonl"))).toEqual([true, true]);
  });

  it("skips entries whose statSync throws and non-directory entries", () => {
    mocks.existsSync.mockImplementation((p: unknown) => String(p) === projectsDir);
    mocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === projectsDir) return ["broken-dir", "afile", "good"];
      if (s === join(projectsDir, "good")) return ["s.jsonl"];
      return [];
    });
    mocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(projectsDir, "broken-dir")) throw new Error("stat failed");
      if (s === join(projectsDir, "afile"))
        return { isDirectory: () => false } as unknown as ReturnType<typeof mocks.statSync>;
      if (s === join(projectsDir, "good"))
        return { isDirectory: () => true } as unknown as ReturnType<typeof mocks.statSync>;
      if (s === join(projectsDir, "good", "s.jsonl"))
        return { mtimeMs: 42 } as never;
      throw new Error("unexpected stat: " + s);
    });

    const out = listRecentSessions();
    expect(out).toHaveLength(1);
    expect(out[0].project).toBe("good");
    expect(out[0].mtime).toBe(42);
  });

  it("skips jsonl files whose statSync throws", () => {
    mocks.existsSync.mockImplementation((p: unknown) => String(p) === projectsDir);
    mocks.readdirSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === projectsDir) return ["p"];
      if (s === join(projectsDir, "p")) return ["ok.jsonl", "bad.jsonl"];
      return [];
    });
    mocks.statSync.mockImplementation((p: unknown) => {
      const s = String(p);
      if (s === join(projectsDir, "p"))
        return { isDirectory: () => true } as unknown as ReturnType<typeof mocks.statSync>;
      if (s.endsWith("ok.jsonl")) return { mtimeMs: 1 } as never;
      if (s.endsWith("bad.jsonl")) throw new Error("stat failed");
      throw new Error("unexpected stat: " + s);
    });

    const out = listRecentSessions();
    expect(out).toHaveLength(1);
    expect(out[0].path.endsWith("ok.jsonl")).toBe(true);
  });
});
