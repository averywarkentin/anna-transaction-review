const currencyFmt = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateShortFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
});

const dateLongFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatAmount(n: number, opts: { signed?: boolean } = {}) {
  const abs = Math.abs(n);
  const out = currencyFmt.format(abs);
  if (opts.signed && n > 0) return `+${out}`;
  if (n < 0) return `-${out}`;
  return out;
}

export function formatDateShort(iso: string) {
  return dateShortFmt.format(new Date(iso));
}

export function formatDateLong(iso: string) {
  return dateLongFmt.format(new Date(iso));
}

const uploadedAtFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Compact "uploaded at" timestamp for the receipt caption in the detail
 * panel and lightbox — e.g. "14 Mar at 09:42".
 */
export function formatUploadedAt(iso: string) {
  const parts = uploadedAtFmt.formatToParts(new Date(iso));
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
  return `${day} ${month} at ${hour}:${minute}`;
}
