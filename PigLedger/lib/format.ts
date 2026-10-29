export function num(v: unknown): number {
  const n = parseFloat(String(v ?? ''));
  return isFinite(n) ? n : 0;
}

export function round2(n: unknown): number {
  return Math.round((num(n) + Number.EPSILON) * 100) / 100;
}

/** ₱12,345.67 — negative shows as -₱12,345.67 */
export function fmt(n: unknown): string {
  const v = round2(n);
  const s = Math.abs(v).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return (v < 0 ? '-' : '') + '₱' + s;
}

/** 1,234.5 kg */
export function fmtKg(n: unknown): string {
  return round2(n).toLocaleString('en-PH', { maximumFractionDigits: 2 }) + ' kg';
}

export function today(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** Friendly date for cards: "Oct 7, 2026" */
export function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
