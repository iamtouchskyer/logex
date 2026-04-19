import { useLang } from './router'
import type { Lang } from '../pipeline/types'

/**
 * Tiny i18n dict. No framework — just a typed dictionary and a hook.
 *
 * Rule: add a key to BOTH `zh` and `en`. The TypeScript shape below enforces
 * identical keys; missing one makes the whole module type-error.
 */
const en = {
  'nav.articles': 'Articles',
  'nav.timeline': 'Timeline',
  'nav.shares': 'Shares',

  'sidebar.projects': 'Projects',
  'sidebar.tags': 'Tags',
  'sidebar.stats': 'Stats',
  'sidebar.stat.articles': 'articles',
  'sidebar.stat.tokens': 'tokens',
  'sidebar.stat.cost': 'cost',
  'sidebar.expand': 'Expand sidebar',
  'sidebar.collapse': 'Collapse sidebar',
  'sidebar.openNav': 'Open navigation',
  'sidebar.closeNav': 'Close navigation',

  'theme.toggleLight': 'Switch to light theme',
  'theme.toggleDark': 'Switch to dark theme',

  'lang.zh': '中文',
  'lang.en': 'English',
  'lang.switchTo': 'Switch language to {lang}',

  'search.placeholder': 'Search articles...',
  'search.ariaLabel': 'Search articles',
  'search.clear': 'Clear search',

  'footer.articleSingular': 'article',
  'footer.articlePlural': 'articles',
  'footer.sessionSingular': 'session',
  'footer.sessionPlural': 'sessions',
  'footer.from': 'from',
  'footer.loading': 'Loading...',

  'state.loadingArticle': 'Loading article...',
  'state.loading': 'Loading',
  'state.empty': 'No articles yet.',

  'articlesList.heading': 'Session Articles',
  'articlesList.loading': 'Loading articles...',
  'articlesList.failed': 'Failed to load articles',
  'articlesList.filterAll': 'All',
  'articlesList.filterBy': 'Filter by project',
  'articlesList.noneFound': 'No articles found',
  'articlesList.tryDifferent': 'Try a different search term',
  'articlesList.emptyDetail': 'No articles have been published yet',
  'articlesList.resultCountSingular': '{count} article found',
  'articlesList.resultCountPlural': '{count} articles found',

  'timeline.heading': 'Timeline',
  'timeline.loading': 'Loading timeline...',
  'timeline.failed': 'Failed to load timeline',
  'timeline.empty': 'No articles to display',
  'timeline.emptyDetail': 'Publish some session articles first',
  'timeline.back': 'Back to articles',
  'timeline.read': 'Read: {title}',

  'landing.login': 'Sign in with GitHub',
  'landing.brandHome': 'Logex home',
  'landing.themeToLight': 'Switch to light mode',
  'landing.themeToDark': 'Switch to dark mode',
  'landing.title1': 'Every AI session',
  'landing.title2': 'deserves to be remembered.',
  'landing.subtitle': 'Logex turns Claude Code transcripts into blog-quality articles — automatically. Your sessions, your insights, your narrative.',
  'landing.stat.tokensNumber': '780M+',
  'landing.stat.tokensLabel': 'tokens processed',
  'landing.stat.computeNumber': '$800+',
  'landing.stat.computeLabel': 'compute invested',
  'landing.stat.toolsNumber': '4,000+',
  'landing.stat.toolsLabel': 'tool calls captured',
  'landing.sample': 'Read a sample article →',
  'landing.note': 'Personal & private. Only you can see your session articles.',
  'landing.feature1.title': 'Auto-generated narratives',
  'landing.feature1.body': 'Not bullet lists. Real articles with opinions, trade-offs, and honest reflection.',
  'landing.feature2.title': 'Rich session metadata',
  'landing.feature2.body': 'Token counts, cost, tool usage, subagent activity — every session tells a quantitative story.',
  'landing.feature3.title': 'Your coding memory',
  'landing.feature3.body': "Three months from now, you'll remember exactly what happened in that 27-hour debugging session.",
  'landing.signedOut': 'Signed out. See you next time.',

  'auth.logout': 'Logout',
  'auth.skipToContent': 'Skip to content',

  'article.backToList': 'Back to articles',
  'article.share': 'Share',
} as const

type DictKey = keyof typeof en

const zh: Record<DictKey, string> = {
  'nav.articles': '文章',
  'nav.timeline': '时间线',
  'nav.shares': '分享',

  'sidebar.projects': '项目',
  'sidebar.tags': '标签',
  'sidebar.stats': '统计',
  'sidebar.stat.articles': '篇',
  'sidebar.stat.tokens': 'tokens',
  'sidebar.stat.cost': '费用',
  'sidebar.expand': '展开侧边栏',
  'sidebar.collapse': '收起侧边栏',
  'sidebar.openNav': '打开导航',
  'sidebar.closeNav': '关闭导航',

  'theme.toggleLight': '切换到浅色主题',
  'theme.toggleDark': '切换到深色主题',

  'lang.zh': '中文',
  'lang.en': 'English',
  'lang.switchTo': '切换语言到 {lang}',

  'search.placeholder': '搜索文章……',
  'search.ariaLabel': '搜索文章',
  'search.clear': '清除搜索',

  'footer.articleSingular': '篇文章',
  'footer.articlePlural': '篇文章',
  'footer.sessionSingular': '个 session',
  'footer.sessionPlural': '个 session',
  'footer.from': '来自',
  'footer.loading': '加载中……',

  'state.loadingArticle': '正在加载文章……',
  'state.loading': '加载中',
  'state.empty': '还没有文章。',

  'articlesList.heading': 'Session 文章',
  'articlesList.loading': '正在加载文章……',
  'articlesList.failed': '加载文章失败',
  'articlesList.filterAll': '全部',
  'articlesList.filterBy': '按项目筛选',
  'articlesList.noneFound': '没有找到文章',
  'articlesList.tryDifferent': '换个搜索词试试',
  'articlesList.emptyDetail': '还没有文章发布',
  'articlesList.resultCountSingular': '找到 {count} 篇文章',
  'articlesList.resultCountPlural': '找到 {count} 篇文章',

  'timeline.heading': '时间线',
  'timeline.loading': '正在加载时间线……',
  'timeline.failed': '加载时间线失败',
  'timeline.empty': '暂无文章',
  'timeline.emptyDetail': '先发布一些 session 文章',
  'timeline.back': '返回文章列表',
  'timeline.read': '阅读：{title}',

  'landing.login': '用 GitHub 登录',
  'landing.brandHome': 'Logex 首页',
  'landing.themeToLight': '切换到浅色模式',
  'landing.themeToDark': '切换到深色模式',
  'landing.title1': '每一次 AI session，',
  'landing.title2': '都值得被记住。',
  'landing.subtitle': 'Logex 把 Claude Code 的对话转成博客级别的文章——全自动。你的 session，你的洞察，你的叙事。',
  'landing.stat.tokensNumber': '780M+',
  'landing.stat.tokensLabel': 'tokens 处理',
  'landing.stat.computeNumber': '$800+',
  'landing.stat.computeLabel': '算力投入',
  'landing.stat.toolsNumber': '4,000+',
  'landing.stat.toolsLabel': 'tool calls 记录',
  'landing.sample': '读一篇示例文章 →',
  'landing.note': '私人、私密。只有你自己能看到你的 session 文章。',
  'landing.feature1.title': '自动生成叙事',
  'landing.feature1.body': '不是 bullet list，是有观点、有取舍、有真实反思的文章。',
  'landing.feature2.title': '完整 session 元数据',
  'landing.feature2.body': 'token 数、成本、tool 使用、subagent 活动——每个 session 都是一个量化故事。',
  'landing.feature3.title': '你的编码记忆',
  'landing.feature3.body': '三个月后，你依然能精确记起那个跑了 27 小时的 debug session 发生了什么。',
  'landing.signedOut': '已登出。下次见。',

  'auth.logout': '退出',
  'auth.skipToContent': '跳到正文',

  'article.backToList': '返回文章列表',
  'article.share': '分享',
}

export const STRINGS = { en, zh } as const

export function t(lang: Lang, key: DictKey, vars?: Record<string, string>): string {
  const dict = STRINGS[lang] ?? STRINGS.en
  let s = (dict as Record<string, string>)[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
    }
  }
  return s
}

export function useT(): (key: DictKey, vars?: Record<string, string>) => string {
  const lang = useLang()
  return (key, vars) => t(lang, key, vars)
}

export type { DictKey }
