import SetupGuide from '@/components/SetupGuide';
import ExportImport from '@/components/ExportImport';
import { updateFarm } from '@/app/actions';
import { loadLedger } from '@/lib/data';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if (!supabaseConfigured) return <SetupGuide />;

  const sb = createClient();
  const { farm, expenses, sales, totals } = await loadLedger(sb);

  return (
    <div className="space-y-4">
      <h2 className="section-title">⚙️ More</h2>

      {/* Farm setup */}
      <form action={updateFarm} className="card space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">My farm</h3>
        <label className="block">
          <span className="label">Farm / batch name</span>
          <input
            type="text"
            name="name"
            className="input"
            defaultValue={farm.name}
            placeholder="e.g. Backyard Farm - Batch 1"
            required
          />
        </label>
        <label className="block">
          <span className="label">Number of pigs</span>
          <input
            type="number"
            name="pigCount"
            className="input"
            inputMode="numeric"
            min="0"
            step="1"
            defaultValue={farm.pigCount || ''}
            placeholder="e.g. 12"
          />
        </label>
        <p className="muted">
          Used to compute <strong>Profit per Pig = Tubo ÷ number of pigs</strong>.
        </p>
        <button type="submit" className="btn-green w-full">
          💾 Save farm info
        </button>
      </form>

      {/* Backup */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Backup &amp; data
        </h3>
        <ExportImport farm={farm} expenses={expenses} sales={sales} totals={totals} />
      </div>

      {/* About */}
      <details className="card">
        <summary className="cursor-pointer text-sm font-bold text-emerald-700">
          ❓ How to use this app
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
          <li>
            Set your <strong>farm name</strong> and <strong>number of pigs</strong> above.
          </li>
          <li>
            Open the <strong>Gastos</strong> tab and add every purchase — pre-starter,
            starter, grower, finisher, vitamins, miscellaneous. The total computes by
            itself.
          </li>
          <li>
            Open the <strong>Benta</strong> tab for every sale — weight and price per kilo
            give the gross automatically.
          </li>
          <li>
            The <strong>Home</strong> tab shows your tubo (profit), including tubo per pig.
          </li>
          <li>Download a backup every week so you never lose records.</li>
        </ol>
        <p className="muted mt-3">
          A red card means the total doesn&apos;t match quantity × price — correct the
          numbers and the warning disappears by itself.
        </p>
      </details>
    </div>
  );
}
