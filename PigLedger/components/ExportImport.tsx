'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { clearAll, importAll } from '@/app/actions';
import { today } from '@/lib/format';
import type { Expense, Farm, Sale, Totals } from '@/lib/types';

/**
 * Backup panel: download a JSON copy of the ledger, restore it later,
 * print the ledger, or wipe everything.
 */
export default function ExportImport({
  farm,
  expenses,
  sales,
  totals
}: {
  farm: Farm;
  expenses: Expense[];
  sales: Sale[];
  totals: Totals;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function downloadBackup() {
    const payload = {
      app: 'Pig Farm Ledger',
      version: 1,
      exportedAt: new Date().toISOString(),
      farm: { name: farm.name, pigCount: farm.pigCount },
      expenses,
      sales,
      summary: {
        totalExpenses: totals.totalExpenses,
        grossSales: totals.grossSales,
        netIncome: totals.netIncome,
        profitPerPig: totals.profitPerPig
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pig-ledger-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function pickBackup() {
    fileRef.current?.click();
  }

  async function onFileChosen() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (fileRef.current) fileRef.current.value = '';
    if (!confirm('Restore this backup? It will permanently replace all records currently stored.')) return;

    setBusy(true);
    const result = await importAll(text);
    setBusy(false);
    alert(result.message);
    if (result.ok) router.refresh();
  }

  function clearEverything() {
    if (!confirm('Delete ALL expenses, sales and settings? This cannot be undone.')) return;
    if (!confirm('Confirm deletion? Downloading a backup first is strongly recommended.')) return;
    setBusy(true);
    clearAll().finally(() => {
      setBusy(false);
      router.refresh();
      alert('All records deleted.');
    });
  }

  return (
    <div className="card space-y-3">
      <p className="muted">
        Records are synchronized to Supabase automatically. Select{' '}
        <strong>Download Backup</strong> now and weekly thereafter to maintain a secondary copy
        of the ledger.
      </p>

      <button type="button" className="btn-primary w-full" onClick={downloadBackup}>
        <Icon name="download" className="h-4 w-4" />
        Download Backup
      </button>

      <button
        type="button"
        className="btn-blue w-full"
        onClick={pickBackup}
        disabled={busy}
      >
        Restore from Backup
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onFileChosen}
      />

      <button
        type="button"
        className="btn-outline w-full"
        onClick={() => window.print()}
      >
        Print Ledger
      </button>

      <button
        type="button"
        className="btn-danger w-full"
        onClick={clearEverything}
        disabled={busy}
      >
        <Icon name="trash" className="h-4 w-4" />
        Delete All Data
      </button>
    </div>
  );
}
