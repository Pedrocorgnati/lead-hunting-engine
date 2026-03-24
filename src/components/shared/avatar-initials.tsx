import { cn } from '@/lib/utils'

const AVATAR_COLORS = [
  'bg-primary',
  'bg-secondary',
  'bg-violet-700',
  'bg-blue-600',
  'bg-cyan-600',
  'bg-success',
]

function getColorIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % AVATAR_COLORS.length
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
}

interface AvatarInitialsProps {
  name: string
  size?: AvatarSize
  className?: string
}

export function AvatarInitials({ name, size = 'md', className }: AvatarInitialsProps) {
  const colorClass = AVATAR_COLORS[getColorIndex(name)]
  const initials = getInitials(name || '?')

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0',
        colorClass,
        SIZE_CLASSES[size],
        className
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
