import type { SessionArticle, Lang } from '../../pipeline/types'
import type { StorageAdapter, ArticleIndex } from './types'

// Stub — implement when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set
export class SupabaseAdapter implements StorageAdapter {
  async loadIndex(): Promise<ArticleIndex> {
    throw new Error('SupabaseAdapter not implemented yet')
  }

  async loadArticle(_slug: string, _lang: Lang): Promise<SessionArticle> { // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new Error('SupabaseAdapter not implemented yet')
  }
}
