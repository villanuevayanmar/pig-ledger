/**
 * Shown on every page until NEXT_PUBLIC_SUPABASE_* env vars are set.
 * Walks a non-technical user through connecting Supabase.
 */
export default function SetupGuide() {
  return (
    <div className="card space-y-4">
      <h2 className="section-title">🛠️ One-time setup needed</h2>
      <p className="muted">
        The app is installed, but it is not connected to its database yet. Follow these
        3 steps once:
      </p>

      <ol className="list-decimal space-y-4 pl-6 text-sm leading-relaxed text-slate-700">
        <li>
          <strong>Create the database</strong>
          <br />
          Open your Supabase project → <em>SQL Editor</em> → <em>New query</em>, paste the
          whole file <code className="rounded bg-slate-100 px-1">supabase/schema.sql</code>,
          then press <strong>Run</strong>.
        </li>
        <li>
          <strong>Connect this app</strong>
          <br />
          In Supabase go to <em>Project Settings → API</em>, copy the{' '}
          <strong>Project URL</strong> and <strong>publishable / anon key</strong>
          {' '}(starts with <code className="rounded bg-slate-100 px-1">sb_publishable_</code>{' '}
          or <code className="rounded bg-slate-100 px-1">eyJhbGci...</code>). Create a
          file named <code className="rounded bg-slate-100 px-1">.env.local</code> in the
          project root:
          <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-emerald-300">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_... (or eyJhbGci...)`}
          </pre>
        </li>
        <li>
          <strong>Restart the app</strong>
          <br />
          Stop the server (<code className="rounded bg-slate-100 px-1">Ctrl+C</code>) and run{' '}
          <code className="rounded bg-slate-100 px-1">npm run dev</code> again.
        </li>
      </ol>

      <p className="muted">
        Full instructions are in <code className="rounded bg-slate-100 px-1">README.md</code>.
      </p>
    </div>
  );
}
