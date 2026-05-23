const ALLOWED_AVATAR_HOSTS: readonly string[] = [
  'avatars.githubusercontent.com',
]

export function isAllowedAvatarUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return ALLOWED_AVATAR_HOSTS.includes(u.host)
  } catch {
    return false
  }
}
