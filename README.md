# logex

Write blog-style session papers from Claude Code transcripts. One session → N articles, one per topic. The LLM (your agent) decides topic segmentation and writes the articles in-session — no extra API key needed.

- [English](#english) · [中文](#中文) · [日本語](#日本語) · [한국어](#한국어) · [Español](#español)

---

## English

### What is logex

`logex` turns Claude Code session JSONL transcripts into blog-quality technical articles. It does the boring work (parse, chunk, score, group by signal) as a pure pipeline, then hands the actual **topic segmentation** and **writing** to the LLM that's already in the loop. One long session typically yields 1–3 articles — the agent reads chunk summaries, decides what's worth writing, and produces structured JSON articles that get published to a separate data repo (`logex-data`).

The webapp (React + Vite SPA) reads that data repo and renders the blog at [logex.vercel.app](https://logex.vercel.app).

### Install

```bash
npm install -g @touchskyer/logex
```

Requires Node.js 18+.

### Quick Start — the `/logex` workflow

In Claude Code, just run:

```
/logex                    # write articles from the current session
/logex <path.jsonl>       # write from a specific JSONL file
/logex --list             # list recent session JSONLs
```

Under the hood the skill runs:

```bash
logex write                # parse → chunk → score → segment (LLM) → write (LLM) → publish
logex list                 # show recent sessions
logex mcp                  # start MCP server for other agents
```

The agent is the one deciding topic boundaries and drafting the prose — `logex` is the scaffolding around it.

### Claude Code integration (plugin + skill + hook)

Install the plugin once, get the skill and the Stop-hook reminder automatically:

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

This registers:

- **Skill `logex`** — the `/logex` slash command and the full segmentation + writing procedure.
- **Stop hook** — on session end, a friendly reminder "consider writing a logex article from this session".
- **`.claude-plugin/plugin.json`** — declares the skill and hook paths so the plugin travels as one unit.

No global `npm install` required when you use the plugin — the skill ships with it.

### MCP for other agents (Cursor / Codex / Windsurf)

Any MCP-capable client can drive logex via:

```bash
logex mcp
```

Client-side config:

| Client | Setup |
|--------|-------|
| Cursor | `npm install -g @touchskyer/logex`, then add MCP server: command `logex`, args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / others | Same pattern — command `logex`, args `["mcp"]` |

Articles are stored in the `logex-data` repo (`~/Code/logex-data` by default), so output is portable across clients.

### License

MIT.

---

## 中文

### 什么是 logex

`logex` 把 Claude Code session 的 JSONL transcript 变成 blog 级的技术文章。它把"枯燥的部分"（parse、chunk、score、按信号分组）做成纯 pipeline，把**话题切分**和**写作**交给当前在 session 里的 LLM —— 不需要额外 API key。一次长 session 通常产 1–3 篇文章：agent 读 chunk summaries，自己决定哪些值得写，产出结构化的 JSON 文章，发布到独立的 data 仓库 `logex-data`。

Webapp 是 React + Vite SPA，从 data 仓库读文章，部署在 [logex.vercel.app](https://logex.vercel.app)。

### 安装

```bash
npm install -g @touchskyer/logex
```

需要 Node.js 18+。

### Quick Start — `/logex` workflow

在 Claude Code 里：

```
/logex                    # 从当前 session 写文章
/logex <path.jsonl>       # 从指定 JSONL 写
/logex --list             # 列最近的 session
```

背后调用：

```bash
logex write                # parse → chunk → score → 话题切分（LLM）→ 写作（LLM）→ publish
logex list                 # 列最近 session
logex mcp                  # 给其它 agent 暴露 MCP server
```

话题切分和正文都是 agent 自己决定，`logex` 只做周边脚手架。

### Claude Code 集成（plugin + skill + hook）

一次安装，skill 和 Stop hook 自动就绪：

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

会注册：

- **Skill `logex`** —— `/logex` slash command 和完整切分 + 写作流程
- **Stop hook** —— session 结束时提醒"可以考虑把这次 session 写成一篇 logex 文章"
- **`.claude-plugin/plugin.json`** —— plugin 的入口，skill 和 hook 作为一个整体打包

走 plugin 就不需要再 `npm install -g` —— skill 随 plugin 走。

### 给其它 agent 用 MCP（Cursor / Codex / Windsurf）

任意支持 MCP 的 client：

```bash
logex mcp
```

客户端配置：

| 客户端 | 配置 |
|--------|------|
| Cursor | `npm install -g @touchskyer/logex`，添加 MCP server：command `logex`，args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / 其它 | 同样的 pattern：command `logex`，args `["mcp"]` |

文章保存在 `logex-data` 仓库（默认 `~/Code/logex-data`），跨 client 可移植。

### License

MIT.

---

## 日本語

### logex とは

`logex` は Claude Code セッションの JSONL トランスクリプトを、ブログ品質の技術記事に変換します。退屈な処理（parse・chunk・score・シグナル単位でのグルーピング）はピュアな pipeline で処理し、**トピック分割**と**執筆**は、セッション内にすでにいる LLM に任せます — 追加の API key は不要。長めのセッション 1 回で通常 1〜3 本の記事が出ます。agent が chunk summaries を読み、書く価値のある話題を判断し、構造化された JSON 記事を別 repo (`logex-data`) に publish します。

Webapp は React + Vite SPA で、その data repo を読んで [logex.vercel.app](https://logex.vercel.app) に表示されます。

### インストール

```bash
npm install -g @touchskyer/logex
```

Node.js 18+ が必要。

### Quick Start — `/logex` ワークフロー

Claude Code 内で:

```
/logex                    # 現在のセッションから記事を書く
/logex <path.jsonl>       # 指定 JSONL から書く
/logex --list             # 最近のセッション一覧
```

内部的に呼ぶコマンド:

```bash
logex write                # parse → chunk → score → 分割（LLM）→ 執筆（LLM）→ publish
logex list                 # セッション一覧
logex mcp                  # 他 agent 向け MCP server
```

### Claude Code 連携 (plugin + skill + hook)

plugin を入れれば skill と Stop hook が自動で有効になります:

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

含まれるもの:

- **Skill `logex`** — `/logex` スラッシュコマンド
- **Stop hook** — セッション終了時のリマインダ
- **`.claude-plugin/plugin.json`** — skill/hook をまとめるエントリ

### 他の agent 向け MCP (Cursor / Codex / Windsurf)

```bash
logex mcp
```

| Client | 設定 |
|--------|------|
| Cursor | `npm install -g @touchskyer/logex`、MCP server: command `logex`, args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / その他 | command `logex`, args `["mcp"]` |

### License

MIT.

---

## 한국어

### logex 란

`logex` 는 Claude Code 세션의 JSONL 트랜스크립트를 블로그 품질의 기술 기사로 바꿉니다. 지루한 작업(parse, chunk, score, 시그널별 그룹핑)은 순수 pipeline 으로 처리하고, **토픽 분할**과 **작성**은 이미 세션 안에 있는 LLM 에게 맡깁니다 — 별도 API key 불필요. 긴 세션 하나로 보통 1〜3 개의 기사가 나옵니다. agent 가 chunk summary 를 읽고 쓸 가치가 있는 것을 고른 뒤, 구조화된 JSON 기사를 별도 data repo (`logex-data`) 로 publish 합니다.

Webapp 은 React + Vite SPA 로, data repo 를 읽어 [logex.vercel.app](https://logex.vercel.app) 에서 렌더링됩니다.

### 설치

```bash
npm install -g @touchskyer/logex
```

Node.js 18+ 필요.

### Quick Start — `/logex` workflow

Claude Code 에서:

```
/logex                    # 현재 세션으로 기사 작성
/logex <path.jsonl>       # 지정 JSONL 로 작성
/logex --list             # 최근 세션 목록
```

내부 실행 명령:

```bash
logex write                # parse → chunk → score → 분할(LLM) → 작성(LLM) → publish
logex list                 # 세션 목록
logex mcp                  # 다른 agent 를 위한 MCP server
```

### Claude Code 통합 (plugin + skill + hook)

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

포함:

- **Skill `logex`** — `/logex` slash command
- **Stop hook** — 세션 종료 시 리마인더
- **`.claude-plugin/plugin.json`** — 통합 entry point

### 다른 agent 를 위한 MCP (Cursor / Codex / Windsurf)

```bash
logex mcp
```

| Client | 설정 |
|--------|-----|
| Cursor | `npm install -g @touchskyer/logex`, MCP: command `logex`, args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / 기타 | command `logex`, args `["mcp"]` |

### License

MIT.

---

## Español

### Qué es logex

`logex` convierte los transcripts JSONL de sesiones de Claude Code en artículos técnicos con calidad de blog. La parte aburrida (parse, chunk, score, agrupación por señal) vive en un pipeline puro; la **segmentación por tema** y la **redacción** las hace el LLM que ya está en la sesión — sin API key adicional. Una sesión larga típicamente produce 1–3 artículos: el agent lee los resúmenes de chunk, decide qué vale la pena escribir y publica artículos JSON estructurados en un repo de datos aparte (`logex-data`).

La webapp es una SPA React + Vite que lee ese repo y se despliega en [logex.vercel.app](https://logex.vercel.app).

### Instalación

```bash
npm install -g @touchskyer/logex
```

Requiere Node.js 18+.

### Quick Start — el workflow `/logex`

En Claude Code:

```
/logex                    # escribir artículos desde la sesión actual
/logex <path.jsonl>       # desde un JSONL específico
/logex --list             # listar sesiones recientes
```

Comandos subyacentes:

```bash
logex write                # parse → chunk → score → segmentar (LLM) → escribir (LLM) → publish
logex list                 # listar sesiones
logex mcp                  # servidor MCP para otros agentes
```

### Integración Claude Code (plugin + skill + hook)

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

Incluye:

- **Skill `logex`** — comando `/logex` y procedimiento completo
- **Stop hook** — recordatorio al final de la sesión
- **`.claude-plugin/plugin.json`** — entry point del plugin

### MCP para otros agentes (Cursor / Codex / Windsurf)

```bash
logex mcp
```

| Cliente | Configuración |
|---------|---------------|
| Cursor | `npm install -g @touchskyer/logex`, MCP: command `logex`, args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / otros | command `logex`, args `["mcp"]` |

### Licencia

MIT.
