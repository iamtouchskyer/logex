import { describe, it, expect, vi, beforeEach } from "vitest";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn((): boolean => false),
  readFileSync: vi.fn((): string => ""),
  readdirSync: vi.fn((): string[] => []),
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

import { readArticleBySlug } from "../sessions";

const dataDir = join(homedir(), "Code", "logex-data");

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
