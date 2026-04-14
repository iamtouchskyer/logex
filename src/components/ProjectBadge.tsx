const PROJECT_COLORS: Record<string, { color: string; bg: string }> = {
  'session-brain': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  mitsein: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' },
  opc: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  jingxia: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  memex: { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' },
}

const DEFAULT_COLOR = { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }

interface Props {
  project: string
}

export function ProjectBadge({ project }: Props) {
  const { color, bg } = PROJECT_COLORS[project] ?? DEFAULT_COLOR
  return (
    <span
      className="project-badge"
      style={{ color, backgroundColor: bg }}
    >
      {project}
    </span>
  )
}
