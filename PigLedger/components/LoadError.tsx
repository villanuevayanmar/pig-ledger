'use client';

export default function LoadError({
  message,
  onRetry
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="card space-y-3 text-center" role="alert">
      <p className="font-semibold text-rose-700">Could not load your farm records.</p>
      <p className="text-sm text-slate-600">{message}</p>
      <button type="button" className="btn-primary mx-auto" onClick={onRetry}>
        Retry loading
      </button>
    </div>
  );
}
