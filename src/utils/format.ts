/** Display helper for lead valuations: an unvalued lead is shown as "待估值", never as a fake amount. */
/** Rounds to whole cents (also cleans float noise such as 80.50000000001 from summed values). */
export const toCents = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

/** "$40.25", "$1,200" — cents are shown whenever the amount has them. */
export function formatUsd(value: number): string {
  const v = toCents(value);
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function formatLeadValueUsd(value: number | undefined | null): string {
  return typeof value === 'number' && value > 0 ? formatUsd(value) : '待估值';
}

export function hasLeadValue(value: number | undefined | null): value is number {
  return typeof value === 'number' && value > 0;
}

function toDate(raw: string | number | Date | undefined | null): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "刚刚 / 12 分钟前 / 3 小时前 / 2 天前 / 10月14日"; unparseable input is returned unchanged. */
export function formatRelativeTime(raw: string | number | Date | undefined | null, now: number = Date.now()): string {
  const d = toDate(raw);
  if (!d) return raw ? String(raw) : '';
  const diff = Math.max(0, now - d.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return formatDateTime(d, false);
}

/** "2026-10-14 10:13" (or date only). Unparseable input is returned unchanged. */
export function formatDateTime(raw: string | number | Date | undefined | null, withTime = true): string {
  const d = toDate(raw);
  if (!d) return raw ? String(raw) : '';
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
}
