import SetupGuide from '@/components/SetupGuide';
import ExpenseForm from '@/components/ExpenseForm';
import { deleteExpense } from '@/app/actions';
import { loadLedger } from '@/lib/data';
import { fmt, fmtDate } from '@/lib/format';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  if (!supabaseConfigured) return <SetupGuide />;

  const sb = createClient();
  const { expenses, totals } = await loadLedger(sb);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title mb-0">💸 Gastos</h2>
        <div className="rounded-xl bg-rose-50 px-4 py-2 text-right">
          <p className="text-xs font-bold uppercase text-rose-500">Grand total</p>
          <p className="text-lg font-extrabold text-rose-600">{fmt(totals.totalExpenses)}</p>
        </div>
      </div>

      {totals.issueCount > 0 ? (
        <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-700">
          ⚠️ {totals.issueCount} row{totals.issueCount > 1 ? 's' : ''} where total ≠
          quantity × price — check the red cards below
        </div>
      ) : null}

      <ExpenseForm />

      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Saved gastos ({expenses.length})
        </h3>

        {expenses.length === 0 ? (
          <div className="card text-center">
            <p className="text-3xl">🥣</p>
            <p className="muted mt-2">
              No expenses yet. Use the form above to add your first feed purchase.
            </p>
          </div>
        ) : (
          expenses.map((e) => {
            const expected = totals.discrepancies[e.id];
            const wrong = expected !== undefined;
            return (
              <div
                key={e.id}
                className={
                  'card ' +
                  (wrong ? 'border-2 border-rose-400 bg-rose-50' : '')
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-800">
                      {e.description || e.category}
                    </p>
                    <p className="muted mt-0.5">
                      {fmtDate(e.date)} · {e.category}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-lg font-extrabold text-rose-600">
                    {fmt(e.lineTotal)}
                  </p>
                </div>

                <p className="mt-2 text-sm text-slate-600">
                  {e.qty} {e.unit} × {fmt(e.price)} / {e.unit.toLowerCase()}
                </p>

                {wrong ? (
                  <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-rose-600">
                    ⚠️ Check: {e.qty} × {fmt(e.price)} should be {fmt(expected)} — total shown
                    is {fmt(e.lineTotal)}
                  </p>
                ) : null}

                <div className="mt-3 flex justify-end">
                  <form action={deleteExpense.bind(null, e.id)}>
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
