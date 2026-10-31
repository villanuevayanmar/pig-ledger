'use client';

import { useEffect, useMemo, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import { fmt, fmtDate, num, round2, today } from '@/lib/format';
import {
  loadLocalLedger, saveLocalLedger, type LocalLedger
} from '@/lib/local-store';
import type { Customer, Supplier, SalePayment, SalePaymentMethod } from '@/lib/types';
import { syncLedgerNow } from '@/components/ExpensesClient';

const PAYMENT_METHODS: Array<{ value: SalePaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'e_wallet', label: 'E-wallet' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' }
];

export default function BusinessClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    syncLedgerNow().then(setLedger).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not load business records.');
    });
  }, []);

  const settlement = useMemo(() => {
    if (!ledger) return [];
    return ledger.sales.map((sale) => {
      const paid = round2(ledger.salePayments
        .filter((payment) => payment.saleId === sale.id)
        .reduce((sum, payment) => sum + payment.amount, 0));
      const balance = round2(Math.max(0, sale.gross - paid));
      return { sale, paid, balance, overpaid: paid > sale.gross + 0.000001 };
    }).sort((a, b) => b.sale.date.localeCompare(a.sale.date));
  }, [ledger]);

  const cashReceived = round2(ledger?.salePayments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0);
  const outstanding = round2(settlement.reduce((sum, row) => sum + row.balance, 0));

  async function updateLocal(mutator: (local: LocalLedger) => void, successMessage: string) {
    const local = await loadLocalLedger();
    mutator(local);
    await saveLocalLedger(local);
    setLedger({ ...local });
    setError('');
    setNotice('Saved on this device. Synchronizing…');
    try {
      const synced = await syncLedgerNow();
      setLedger(synced);
      if (synced.syncError) {
        setNotice('Saved locally. Sync is still pending.');
        setError(synced.syncError);
      } else {
        setNotice(successMessage);
      }
    } catch (err) {
      setNotice('Saved locally. Sync will retry when connection returns.');
      setError(err instanceof Error ? err.message : 'Synchronization is unavailable.');
    }
  }

  async function handleCustomer(formData: FormData) {
    const name = String(formData.get('name') || '').trim();
    if (!ledger || !name) {
      setError('Enter a customer name.');
      return;
    }
    if (ledger.customers.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setError('A customer with that name already exists.');
      return;
    }
    const customer: Customer = {
      id: crypto.randomUUID(),
      farmId: ledger.farm.id,
      name,
      phone: String(formData.get('phone') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      notes: String(formData.get('notes') || '').trim(),
      isActive: true,
      createdAt: new Date().toISOString()
    };
    await updateLocal((local) => {
      local.customers = [...local.customers, customer];
      local.pending = [...local.pending, { kind: 'add-customer', customer }];
    }, 'Customer saved and synchronized.');
  }

  async function handleSupplier(formData: FormData) {
    const name = String(formData.get('name') || '').trim();
    if (!ledger || !name) {
      setError('Enter a supplier name.');
      return;
    }
    if (ledger.suppliers.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setError('A supplier with that name already exists.');
      return;
    }
    const supplier: Supplier = {
      id: crypto.randomUUID(),
      farmId: ledger.farm.id,
      name,
      phone: String(formData.get('phone') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      notes: String(formData.get('notes') || '').trim(),
      isActive: true,
      createdAt: new Date().toISOString()
    };
    await updateLocal((local) => {
      local.suppliers = [...local.suppliers, supplier];
      local.pending = [...local.pending, { kind: 'add-supplier', supplier }];
    }, 'Supplier saved and synchronized.');
  }

  async function handlePayment(formData: FormData) {
    if (!ledger) return;
    const saleId = String(formData.get('saleId') || '');
    const saleRow = settlement.find((row) => row.sale.id === saleId);
    const amount = round2(num(formData.get('amount')));
    const paymentDate = String(formData.get('paymentDate') || today());
    const paymentMethod = String(formData.get('paymentMethod') || 'cash') as SalePaymentMethod;
    if (!saleRow || amount <= 0 || amount > saleRow.balance + 0.000001) {
      setError('Enter a positive payment no greater than the outstanding balance.');
      return;
    }
    if (!PAYMENT_METHODS.some((item) => item.value === paymentMethod)) {
      setError('Choose a valid payment method.');
      return;
    }
    const payment: SalePayment = {
      id: crypto.randomUUID(),
      farmId: ledger.farm.id,
      saleId,
      paymentDate,
      amount,
      paymentMethod,
      reference: String(formData.get('reference') || '').trim(),
      notes: String(formData.get('notes') || '').trim()
    };
    await updateLocal((local) => {
      local.salePayments = [...local.salePayments, payment];
      local.pending = [...local.pending, { kind: 'add-sale-payment', payment }];
    }, 'Payment recorded and synchronized.');
  }

  if (!ledger) {
    return <div className="card text-center"><p className="muted">Loading business records…</p></div>;
  }

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} syncError={ledger.syncError} onSync={async () => setLedger(await syncLedgerNow())} />
      <div>
        <h2 className="section-title">Business Management</h2>
        <p className="section-sub">Manage customers, suppliers, sale receipts and outstanding balances.</p>
      </div>
      {!ledger.businessSchemaReady ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Database setup required.</strong> Records can be saved on this device, but online synchronization needs the Phase 4 contacts and payments migration applied to Supabase.
        </div>
      ) : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      <section className="grid grid-cols-2 gap-3">
        <Metric label="Cash received" value={fmt(cashReceived)} />
        <Metric label="Outstanding" value={fmt(outstanding)} />
      </section>
      <p className="text-xs text-slate-500">Sales revenue is recorded when a sale is entered. Cash received is counted only from payment records.</p>

      <section className="card space-y-3">
        <div>
          <h3 className="font-semibold">Customers ({ledger.customers.length})</h3>
          <p className="text-xs text-slate-500">Saved customer details can be linked to a sale.</p>
        </div>
        <form action={handleCustomer} className="space-y-3">
          <label className="block"><span className="label">Customer name</span><input className="input" name="name" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Phone</span><input className="input" name="phone" inputMode="tel" /></label>
            <label><span className="label">Email</span><input className="input" name="email" type="email" /></label>
          </div>
          <label className="block"><span className="label">Address</span><input className="input" name="address" /></label>
          <label className="block"><span className="label">Notes</span><input className="input" name="notes" /></label>
          <button className="btn-secondary w-full" type="submit">Add customer</button>
        </form>
        {ledger.customers.length > 0 ? (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            {ledger.customers.map((customer) => (
              <div key={customer.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold">{customer.name}</p>
                <p className="text-xs text-slate-500">{[customer.phone, customer.email, customer.address].filter(Boolean).join(' · ') || 'No contact details'}</p>
              </div>
            ))}
          </div>
        ) : <p className="muted">No customers saved yet.</p>}
      </section>

      <section className="card space-y-3">
        <div>
          <h3 className="font-semibold">Suppliers ({ledger.suppliers.length})</h3>
          <p className="text-xs text-slate-500">Saved suppliers can be linked to farm expenses.</p>
        </div>
        <form action={handleSupplier} className="space-y-3">
          <label className="block"><span className="label">Supplier name</span><input className="input" name="name" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Phone</span><input className="input" name="phone" inputMode="tel" /></label>
            <label><span className="label">Email</span><input className="input" name="email" type="email" /></label>
          </div>
          <label className="block"><span className="label">Address</span><input className="input" name="address" /></label>
          <label className="block"><span className="label">Notes</span><input className="input" name="notes" /></label>
          <button className="btn-secondary w-full" type="submit">Add supplier</button>
        </form>
        {ledger.suppliers.length > 0 ? (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            {ledger.suppliers.map((supplier) => (
              <div key={supplier.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold">{supplier.name}</p>
                <p className="text-xs text-slate-500">{[supplier.phone, supplier.email, supplier.address].filter(Boolean).join(' · ') || 'No contact details'}</p>
              </div>
            ))}
          </div>
        ) : <p className="muted">No suppliers saved yet.</p>}
      </section>

      <section className="card space-y-3">
        <div>
          <h3 className="font-semibold">Sale payments and receivables</h3>
          <p className="text-xs text-slate-500">Record full or partial payments. The database prevents payments above the remaining balance.</p>
        </div>
        {settlement.length > 0 ? settlement.map(({ sale, paid, balance, overpaid }) => {
          const customer = ledger.customers.find((item) => item.id === sale.customerId);
          const payments = ledger.salePayments.filter((item) => item.saleId === sale.id).slice().sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
          return (
            <div key={sale.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{customer?.name || sale.buyer || 'Buyer not specified'}</p>
                  <p className="text-xs text-slate-500">{fmtDate(sale.date)} · Sale total {fmt(sale.gross)}</p>
                </div>
                <span className={'shrink-0 text-xs font-semibold ' + (overpaid ? 'text-rose-700' : balance <= 0 ? 'text-emerald-700' : paid > 0 ? 'text-amber-700' : 'text-slate-500')}>
                  {overpaid ? 'Overpaid' : balance <= 0 ? 'Paid' : paid > 0 ? 'Part-paid' : 'Unpaid'}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-xs text-slate-500">Received</p><p className="font-semibold tabular-nums">{fmt(paid)}</p></div>
                <div><p className="text-xs text-slate-500">Remaining</p><p className="font-semibold tabular-nums">{fmt(balance)}</p></div>
              </div>
              {payments.length > 0 ? (
                <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                  {payments.map((payment) => <p key={payment.id} className="text-xs text-slate-500">{fmtDate(payment.paymentDate)} · {payment.paymentMethod.replace('_', ' ')} · {fmt(payment.amount)}{payment.reference ? ' · Ref: ' + payment.reference : ''}</p>)}
                </div>
              ) : null}
              {balance > 0 && !overpaid ? (
                <details className="mt-3 border-t border-slate-100 pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">Record payment</summary>
                  <form action={handlePayment} className="mt-3 space-y-3">
                    <input type="hidden" name="saleId" value={sale.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className="label">Payment date</span><input className="input" type="date" name="paymentDate" defaultValue={today()} required /></label>
                      <label><span className="label">Amount (₱)</span><input className="input" type="number" name="amount" min="0.01" max={balance} step="0.01" required /></label>
                    </div>
                    <label className="block"><span className="label">Payment method</span><select className="input" name="paymentMethod">{PAYMENT_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    <label className="block"><span className="label">Reference (optional)</span><input className="input" name="reference" /></label>
                    <label className="block"><span className="label">Notes (optional)</span><input className="input" name="notes" /></label>
                    <button className="btn-primary w-full" type="submit">Save payment</button>
                  </form>
                </details>
              ) : null}
            </div>
          );
        }) : <p className="muted">No sales have been recorded yet. Add a sale before recording its payment.</p>}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums">{value}</p></div>;
}
