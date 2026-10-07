import SetupGuide from '@/components/SetupGuide';
import SaleForm from '@/components/SaleForm';
import { deleteSale } from '@/app/actions';
import { loadLedger } from '@/lib/data';
import { fmt, fmtDate, fmtKg } from '@/lib/format';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  if (!supabaseConfigured) return <SetupGuide />;

  const sb = createClient();
  const { sales, totals } = await loadLedger(sb);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title mb-0">💰 Benta (Sales)</h2>
        <div className="rounded-xl bg-sky-50 px-4 py-2 text-right">
          <p className="text-xs font-bold uppercase text-sky-500">Gross total</p>
          <p className="text-lg font-extrabold text-sky-600">{fmt(totals.grossSales)}</p>
        </div>
      </div>

      <SaleForm
        totalExpenses={totals.totalExpenses}
        totalWeight={totals.totalWeight}
      />

      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Saved sales ({sales.length}) · {fmtKg(totals.totalWeight)} total
        </h3>

        {sales.length === 0 ? (
          <div className="card text-center">
            <p className="text-3xl">🐖</p>
            <p className="muted mt-2">No sales yet. Record your first pig sale above.</p>
          </div>
        ) : (
          sales.map((s) => {
            const net = totals.netBySale[s.id];
            return (
              <div key={s.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-800">
                      {s.buyer || 'Buyer not set'}
                      {s.heads > 0 ? ` · ${s.heads} pig${s.heads > 1 ? 's' : ''}` : ''}
                    </p>
                    <p className="muted mt-0.5">{fmtDate(s.date)}</p>
                  </div>
                  <p className="whitespace-nowrap text-lg font-extrabold text-sky-600">
                    {fmt(s.gross)}
                  </p>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg bg-slate-50 py-2">
                    <p className="text-xs font-bold uppercase text-slate-400">Weight</p>
                    <p className="font-bold text-slate-700">{fmtKg(s.weightKg)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2">
                    <p className="text-xs font-bold uppercase text-slate-400">Per kg</p>
                    <p className="font-bold text-slate-700">{fmt(s.pricePerKg)}</p>
                  </div>
                  <div
                    className={
                      'rounded-lg py-2 ' + (net < 0 ? 'bg-rose-50' : 'bg-emerald-50')
                    }
                  >
                    <p className="text-xs font-bold uppercase text-slate-400">Net</p>
                    <p
                      className={
                        'font-bold ' + (net < 0 ? 'text-rose-600' : 'text-emerald-700')
                      }
                    >
                      {fmt(net)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <form action={deleteSale.bind(null, s.id)}>
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-100"
                    >
                      🗑 Delete
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
