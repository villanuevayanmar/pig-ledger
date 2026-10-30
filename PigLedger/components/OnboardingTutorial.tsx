'use client';

import { useEffect, useState } from 'react';
import { createBrowserClientApp } from '@/lib/supabase/client';

const steps = [
  { title: 'Set up batch details', body: 'Open Batches and create a batch with a clear batch name, start date, and initial head count. Use a separate batch for each group of pigs you want to measure.' },
  { title: 'Log initial costs', body: 'In Transactions, record piglet purchases, electricity, medication, and other starting expenses. Choose the matching expense type and assign the record to the correct batch.' },
  { title: 'Track feed purchases and weight', body: 'Record each feed purchase once in Transactions. Choose the feed type, quantity, unit, actual price, and kilograms represented by one unit. The report uses these entries to calculate feed cost and total feed weight.' },
  { title: 'Record batch sales', body: 'When pigs are sold, record the buyer, head count, total weight in kilograms, and actual price per kilogram. Assign the sale to the batch so revenue is included in its report.' },
  { title: 'Generate and read the financial report', body: 'Open Reports and choose the batch. Review feed cost and kilograms used, sales total, itemized costs, net profit, and rounded profit per head. Use Print / Save PDF to keep a copy.' }
];

export default function OnboardingTutorial() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let active = true;
    createBrowserClientApp().auth.getUser().then(({ data }) => {
      if (active && data.user && data.user.user_metadata?.pigledger_tutorial_completed !== true) setOpen(true);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function finish() {
    const { error } = await createBrowserClientApp().auth.updateUser({ data: { pigledger_tutorial_completed: true } });
    if (!error) setOpen(false);
  }

  if (!open) return null;
  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Getting Started · Step {step + 1} of {steps.length}</p><h2 id="tutorial-title" className="mt-2 text-xl font-bold text-slate-950">{current.title}</h2></div>
          <button type="button" onClick={() => setStep(steps.length - 1)} className="text-sm font-semibold text-slate-500 underline">Skip</button>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-800 transition-all" style={{ width: ((step + 1) / steps.length * 100) + '%' }} /></div>
        <p className="mt-5 text-sm leading-6 text-slate-700">{current.body}</p>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" className="btn-secondary" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>Previous</button>
          {step < steps.length - 1 ? <button type="button" className="btn-primary" onClick={() => setStep((value) => value + 1)}>Next step</button> : <button type="button" className="btn-primary" onClick={finish}>Finish tutorial</button>}
        </div>
      </section>
    </div>
  );
}
