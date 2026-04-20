import type { ReactNode } from 'react';

type Tone = 'warn' | 'neutral' | 'danger' | 'info' | 'success';

type Props = {
  tone: Tone;
  children: ReactNode;
  icon?: ReactNode;
};

const TONE_CLASSES: Record<Tone, string> = {
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  neutral: 'bg-ink-50 text-ink-500 ring-ink-100',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  // Calm, low-saturation green for reviewed state — distinct from warn/danger,
  // softer than info, deliberately non-celebratory.
  success: 'bg-emerald-50/80 text-emerald-700 ring-emerald-100',
};

export function StatePill({ tone, children, icon }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
