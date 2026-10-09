import { fmt, fmtKg } from '@/lib/format';
import type { Totals } from '@/lib/types';

function profitClass(v: number | null): string {
  if (v === null) return 'text-slate-400';
  return v < 0 ? 'text-rose-600' : 'text-emerald-700';
}

/** The 4 big numbers — the only things a busy farmer needs to see first. */
export default function SummaryCards({ totals }: { totals: Totals }) {
  return (
    <section className="grid grid-cols-2 gap-3" aria-label="Summary">
      <div className="card border-t-4 border-t-rose-400">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Total Expenses
        </span>
        <p className="mt-1 text-xl font-extrabold text-rose-600 sm:text-2xl">
          {fmt(totals.totalExpenses)}
        </p>
      </div>

      <div className="card border-t-4 border-t-sky-400">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Total Sales
        </span>
        <p className="mt-1 text-xl font-extrabold text-sky-600 sm:text-2xl">
          {fmt(totals.grossSales)}
        </p>
      </div>

      <div className="card border-t-4 border-t-emerald-500">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Profit (Net)
        </span>
        <p className={'mt-1 text-xl font-extrabold sm:text-2xl ' + profitClass(totals.netIncome)}>
          {fmt(totals.netIncome)}
        </p>
      </div>

      <div className="card border-t-4 border-t-amber-400">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Profit per Pig
        </span>
        <p
          className={
            'mt-1 text-xl font-extrabold sm:text-2xl ' + profitClass(totals.profitPerPig)
          }
        >
          {totals.profitPerPig === null ? '—' : fmt(totals.profitPerPig)}
        </p>
        {totals.profitPerPig === null ? (
          <span className="muted mt-0.5 block">Set pigs in Settings</span>
        ) : (
          <span className="muted mt-0.5 block">{fmtKg(totals.totalWeight)} sold</span>
        )}
      </div>
    </section>
  );
}
