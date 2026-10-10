import { fmt, fmtKg } from '@/lib/format';
import type { Totals } from '@/lib/types';

function profitClass(v: number | null): string {
  if (v === null) return 'text-slate-400';
  return v < 0 ? 'text-rose-700' : 'text-emerald-700';
}

/** Key performance indicators — the four figures reviewed first. */
export default function SummaryCards({ totals }: { totals: Totals }) {
  const cards = [
    {
      label: 'Operating Expenses',
      value: fmt(totals.totalExpenses),
      note: 'Feed, medicine & inputs',
      tone: 'text-slate-900'
    },
    {
      label: 'Total Revenue',
      value: fmt(totals.grossSales),
      note: `${fmtKg(totals.totalWeight)} sold`,
      tone: 'text-slate-900'
    },
    {
      label: 'Net Profit',
      value: fmt(totals.netIncome),
      note: 'Revenue less expenses',
      tone: profitClass(totals.netIncome)
    },
    {
      label: 'Net Profit / Head',
      value: totals.profitPerPig === null ? '—' : fmt(totals.profitPerPig),
      note: totals.profitPerPig === null ? 'Herd size not set' : `${totals.totalHeads} head sold`,
      tone: profitClass(totals.profitPerPig)
    }
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Financial summary">
      {cards.map((c) => (
        <div key={c.label} className="card">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {c.label}
          </span>
          <p className={'mt-1 text-2xl font-bold tabular-nums tracking-tight ' + c.tone}>
            {c.value}
          </p>
          <span className="mt-0.5 block text-xs text-slate-400">{c.note}</span>
        </div>
      ))}
    </section>
  );
}
