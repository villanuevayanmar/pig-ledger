'use client';

import { useRef, useState } from 'react';
import { addExpense } from '@/app/actions';
import { CATEGORIES, UNITS } from '@/lib/types';
import { fmt, num, today } from '@/lib/format';

/**
 * Add-expense form. Line total = qty × price, recalculated live as you type.
 * Saves through a Server Action, then clears itself for the next entry.
 */
export default function ExpenseForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const lineTotal = round2live(num(qty) * num(price));

  async function handleSubmit(formData: FormData) {
    setBusy(true);
    try {
      await addExpense(formData);
      formRef.current?.reset();
      setQty('');
      setPrice('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="card space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-1">
          <span className="label">Date</span>
          <input type="date" name="date" defaultValue={today()} className="input" required />
        </label>
        <label className="col-span-1">
          <span className="label">Kind of feed / item</span>
          <select name="category" className="input" defaultValue="Pre-Starter">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">What did you buy?</span>
        <input
          type="text"
          name="description"
          className="input"
          placeholder="e.g. 5 sacks pre-starter feed"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">How many?</span>
          <input
            type="number"
            name="qty"
            className="input"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="e.g. 5"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </label>
        <label>
          <span className="label">Unit</span>
          <select name="unit" className="input" defaultValue="Sack">
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">Price per unit (₱)</span>
        <input
          type="number"
          name="price"
          className="input"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="e.g. 1500"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </label>

      <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
        <span className="text-sm font-bold text-emerald-800">Line total (auto)</span>
        <span className="text-lg font-extrabold text-emerald-700">{fmt(lineTotal)}</span>
      </div>

      <button type="submit" className="btn-green w-full" disabled={busy}>
        {busy ? 'Saving…' : '＋ Add Gastos'}
      </button>
    </form>
  );
}

function round2live(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
