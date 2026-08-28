import Image from 'next/image';
import { cn, hueFromString, initials } from '@/lib/utils';

/**
 * Avatar.
 *
 * The fallback is generated, not generic: initials on a hue derived from the
 * name, so every member has a stable, distinguishable identity even before an
 * image is uploaded. A wall of identical grey circles is a design failure.
 */

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  ring?: boolean;
  className?: string;
  priority?: boolean;
}

const SIZES = {
  xs: { box: 'size-6', text: 'text-[9px]', px: 24 },
  sm: { box: 'size-8', text: 'text-2xs', px: 32 },
  md: { box: 'size-10', text: 'text-xs', px: 40 },
  lg: { box: 'size-14', text: 'text-base', px: 56 },
  xl: { box: 'size-20', text: 'text-xl', px: 80 },
  '2xl': { box: 'size-28', text: 'text-3xl', px: 112 },
} as const;

export function Avatar({
  name,
  src,
  size = 'md',
  ring = false,
  className,
  priority = false,
}: AvatarProps) {
  const config = SIZES[size];
  const hue = hueFromString(name);

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        config.box,
        ring && 'ring-2 ring-bloom-400/40 ring-offset-2 ring-offset-canvas',
        className,
      )}
      style={
        src
          ? undefined
          : {
              background: `linear-gradient(140deg, hsl(${hue} 62% 34%), hsl(${(hue + 48) % 360} 58% 22%))`,
            }
      }
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={config.px}
          height={config.px}
          priority={priority}
          className="size-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className={cn('font-display font-bold tracking-tight text-white/90', config.text)}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}

/** Overlapping stack, used for project credits and comment threads. */
export function AvatarGroup({
  people,
  max = 4,
  size = 'sm',
  className,
}: {
  people: Array<{ name: string; src?: string | null }>;
  max?: number;
  size?: AvatarProps['size'];
  className?: string;
}) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex -space-x-2">
        {shown.map((person) => (
          <Avatar
            key={person.name}
            name={person.name}
            src={person.src}
            size={size}
            className="ring-2 ring-canvas"
          />
        ))}
      </div>
      {overflow > 0 && (
        <span className="nums ml-2 text-2xs text-content-muted">+{overflow}</span>
      )}
    </div>
  );
}
