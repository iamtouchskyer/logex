# Acceptance Criteria — logex bilingual 一次性做对

## Task
把 logex 双语改造从 code-done 推到 prod-live-verified：跑 backfill 翻所有存量中文文章到英文，推送 logex-data 新 schema，deploy 到 Vercel，验证 prod 上双语真的工作 + GitHub OAuth 真的可登。

## Outcomes

- OUT-1: `logex-data/` 每一篇原 `<slug>.json` 被重命名为 `<slug>.zh.json` + 新生成 `<slug>.en.json`，文件数 = 2 × 原文章数（确认命令：`find logex-data -name '*.json' -not -name 'index.json' | sed 's/\.\(zh\|en\)\.json$//' | sort -u | wc -l` 对齐原文章数；`.zh.json` 和 `.en.json` count 相等）
- OUT-2: `logex-data/index.json` 每个 article entry 有 `primaryLang: "zh"` + `i18n: { zh: {title, summary, path}, en: {title, summary, path} }`；`i18n[lang].path` 指向存在的文件（脚本 assert 每条 path 可读）
- OUT-3: 抽 3 篇 `.en.json` 目测：title 不是逐字机翻（不是 "The X's Y" 这种中式英文）、body 里 ` ``` ` code block 和绝对路径保持原样、tags 原文不变
- OUT-4: `cd logex && git push` + `cd logex-data && git push`，两边 `git log origin/main..HEAD` 都空
- OUT-5: Vercel prod deploy 成功：`curl -I https://logex.vercel.app/` 返回 200；`https://logex.vercel.app/#/en/articles/<某真 slug>` 在浏览器打开后 fetch 到 `.en.json` 渲染出英文 title（不是 fallback 到 zh 的英文 summary），`#/zh/articles/<同 slug>` 渲染中文 title
- OUT-6: Prod OAuth 真登一次（user 手动操作）：点 Sign in with GitHub → 回跳 → sidebar 出现 `Articles/Timeline/Shares` (en) 或 `文章/时间线/分享` (zh)；logout 也正常
- OUT-7: Prod 页面 console 0 个 JS error / pageerror（Playwright 访问 `/#/en/`、`/#/zh/`、`/#/en/articles/<slug>`、`/#/zh/articles/<slug>` 4 个 URL，filter 掉预期 HMR、filter 掉 favicon 404 之外，error 计数 = 0）

## Verification

- OUT-1, OUT-2: Node script `scripts/verify-logex-data.mjs` 遍历 `logex-data/` 断言文件结构和 index schema。Exit 0 = pass。
- OUT-3: 把 3 篇 `.en.json` 的 title + 前 500 字 body 贴给 user 人眼过。
- OUT-4: `git log origin/main..HEAD --oneline` 两个仓都要空输出。
- OUT-5: `curl -I https://logex.vercel.app/` → 200；Python Playwright headless 访问 `#/en/articles/<slug>` 和 `#/zh/articles/<slug>`，assert `.article__title` 文本匹配对应语言文件里的 title。
- OUT-6: User 手动在真实浏览器里点 GitHub login；user 回报 "通过" 或 "截图" 作为 artifact。OPC 不 mock 这个。
- OUT-7: Playwright `page.on('console')` + `page.on('pageerror')` 收集，filter 规则写在 script 里。

## Quality Constraints

- Backfill 成本上限：$5（25 篇 × ~3k tokens × Sonnet 定价，估 $1-2，$5 是 hard ceiling）
- 每篇翻译 timeout：60s
- Vercel deploy 等待：push 后 max 90s poll `curl -I` 确认 build hash 变化
- Prod smoke Playwright：每个 URL 10s timeout

## Out of Scope

- 不补新的 E2E spec suite（老的 Playwright spec 用 pre-i18n URL，follow-up）
- 不 backfill 历史 index.json 的 `heroImage`（缺的就继续缺）
- 不动 GitHub OAuth App 配置（前提是已经配了）

## ❌ 显式禁止的 豁免 (吃过一次亏)

上次验收的 "Out of Scope: 不验证 logex-data / 不验证 OAuth / 不验证 article detail" 这次全部**不允许**，具体：

- 不允许把 "logex-data 内容" 列为 out of scope — 这次的目标就是改它。
- 不允许 OAuth mock 替代真登 — OUT-6 必须真人真浏览器。
- 不允许 article detail 豁免 — OUT-5 必须真拉 `.en.json` 渲染。
- 不允许 "dev server 上跑通就算 pass" — 必须 prod URL (`logex.vercel.app`)。

## Quality Baseline (polished)

- [ ] Landing 在 prod zh/en 下都有 favicon
- [ ] prod LangToggle 点击后 URL segment + 页面内容同步切换（截图前后对比）
- [ ] 375×812 (mobile) 视口下 prod landing 无横向滚动条
- [ ] Loading / error / empty state：article detail fetch 404 时显示带文案的错误 banner，不是白屏
- [ ] Focus ring：Tab 键能看到 LangToggle 的 focus outline
- [ ] 无 layout shift：切语言时只文本变，结构不抖
