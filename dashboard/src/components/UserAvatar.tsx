import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
  xl: 'size-14 text-base',
};

interface UserAvatarProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: AvatarSize;
  sizePx?: number;
  className?: string;
  onClick?: () => void;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Mitarbeiter-Avatar — kapselt das shadcn-Avatar-Primitive mit
 * konsistentem Border, Initialen-Fallback im Markenton und drei Größen.
 */
export function UserAvatar({
  avatarUrl,
  displayName,
  size = 'md',
  sizePx,
  className,
  onClick,
}: UserAvatarProps) {
  const interactive = typeof onClick === 'function';
  const pixelStyle = sizePx
    ? { width: sizePx, height: sizePx, fontSize: Math.max(11, Math.round(sizePx * 0.3)) }
    : undefined;
  return (
    <Avatar
      className={cn(
        'shrink-0 border border-background bg-muted shadow-sm',
        sizePx ? undefined : SIZE_CLASS[size],
        interactive && 'cursor-pointer transition-shadow hover:shadow-md',
        className,
      )}
      style={pixelStyle}
      onClick={onClick}
    >
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName ?? 'User'} /> : null}
      <AvatarFallback
        className={cn(
          'bg-primary/10 font-semibold text-primary',
          sizePx && 'text-[length:inherit]',
        )}
      >
        {getInitials(displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

export default UserAvatar;
