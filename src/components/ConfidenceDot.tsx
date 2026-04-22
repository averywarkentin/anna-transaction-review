import type { Confidence } from '../types';

type Props = {
  level: Confidence;
  className?: string;
};

const LABEL: Record<Confidence, string> = {
  high: 'High confidence categorisation',
  medium: 'Medium confidence categorisation',
  low: 'Low confidence, AI is unsure',
};

export function ConfidenceDot({ level, className = '' }: Props) {
  const base = 'inline-block h-2 w-2 rounded-full shrink-0';
  const colour =
    level === 'high'
      ? 'bg-emerald-500'
      : level === 'medium'
      ? 'bg-amber-500'
      : 'bg-red-500 animate-pulse-soft';
  return (
    <span
      className={`${base} ${colour} ${className}`}
      role="img"
      aria-label={LABEL[level]}
      title={LABEL[level]}
    />
  );
}
