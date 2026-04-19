/**
 * Logex Extension for Pi
 *
 * Skeleton entry point. Wraps the `logex` CLI so Pi agents can turn the
 * current session into a blog-style article. No runtime behavior yet.
 */

export interface LogexExtensionMeta {
  name: string
  version: string
}

export const meta: LogexExtensionMeta = {
  name: 'logex-pi',
  version: '0.1.0',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function logexExtension(_pi: unknown): void {
  // Skeleton — tool and command registration will land in a follow-up.
}
