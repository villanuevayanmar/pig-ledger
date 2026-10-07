'use client';

import { useRef, useState } from 'react';
import { addSale } from '@/app/actions';
import { fmt, num, today } from '@/lib/format';

/**
 * Add-sale form. Gross = weight × price/kg, and an estimated net
 * (after this sale's share of total expenses) previews live as you type.
 */
export default function SaleForm({
  totalExpenses,
  totalWeight
}: {
  totalExpenses: number;
  totalWeight: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [weightKg, setWeightKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [busy, setBusy] = useState(false);

  const gross = round2live(num(weightKg) * num(pricePerKg));
  const projectedWeight = totalWeight + num(weightKg);
  const share =
    projectedWeight > 0 && num(weightKg) > 0
      ? round2live(totalExpenses * (num(weightKg) / projectedWeight))
      : 0;
  const estNet = round2live(gross - share);

  async function handleSubmit(formData: FormData) {
    setBusy(true);
    try {
      await addSale(formData);
      formRef.current?.reset();
      setWeightKg('');
      setPricePerKg('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="card space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Date</span>
          <input type="date" name="date" defaultValue={today()} className="input" required />
        </label>
        <label>
          <span className="label">Buyer</span>
          <input type="text" name="buyer" className="input" placeholder="e.g. Mang Roger" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">How many pigs?</span>
          <input
            type="number"
            name="heads"
            className="input"
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="e.g. 12"
          />
        </label>
        <label>
          <span className="label">Total weight (kg)</span>
          <input
            type="number"
            name="weightKg"
            className="input"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="e.g. 1080"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="label">Price per kilo (₱)</span>
        <input
          type="number"
          name="pricePerKg"
          className="input"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="e.g. 220"
          value={pricePerKg}
          onChange={(e) => setPricePerKg(e.target.value)}
          required
        />
      </label>

      <div className="space-y-1 rounded-xl bg-sky-50 px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-bold text-sky-800">Gross (auto)</span>
          <span className="text-base font-extrabold text-sky-700">{fmt(gross)}</span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>Estimated net after expenses</span>
          <span className={'font-bold ' + (estNet < 0 ? 'text-rose-600' : 'text-emerald-700')}>
            {fmt(estNet)}
          </span>
        </div>
      </div>

      <button type="submit" className="btn-green w-full" disabled={busy}>
        {busy ? 'Saving…' : '＋ Add Benta (Sale)'}
      </button>
    </form>
  );
}

function round2live(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
