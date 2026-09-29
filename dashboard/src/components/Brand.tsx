import { cn } from '@/lib/utils';

interface BrandProps {
  /**
   * `mark`: compact square mark (used by the collapsed sidebar).
   * `wordmark`: product name as text.
   */
  variant?: 'mark' | 'wordmark';
  className?: string;
  /** Accessible label. */
  label?: string;
}

/** Text-only product mark. No image assets. */
export function Brand({ variant = 'wordmark', className, label = 'Capacity Timeline' }: BrandProps) {
  if (variant === 'mark') {
    return (
      <span
        role="img"
        aria-label={label}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md bg-primary text-xs font-semibold tracking-tight text-primary-foreground',
          className,
        )}
      >
        CT
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center text-sm font-semibold tracking-tight', className)}>
      {label}
    </span>
  );
}
