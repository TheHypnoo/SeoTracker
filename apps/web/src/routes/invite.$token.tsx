import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { useAuth } from '../lib/auth-context';

export const Route = createFileRoute('/invite/$token')({
  component: InviteTokenPage,
});

function InviteTokenPage() {
  const { token } = Route.useParams();
  const auth = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Invitación al equipo</h1>
      <p className="mt-1 text-sm text-slate-600">
        Acepta este token para unirte al espacio de trabajo.
      </p>
      <p className="mt-2 rounded-md bg-slate-50 p-2 font-mono text-xs">{token}</p>
      <button
        type="button"
        disabled={submitting || !auth.user}
        onClick={() => {
          setError(null);
          setMessage(null);
          setSubmitting(true);

          void auth.api
            .post('/projects/invites/accept', { token })
            .then(() => setMessage('Invitación aceptada.'))
            .catch((caughtError) =>
              setError(
                caughtError instanceof Error
                  ? caughtError.message
                  : 'No se pudo aceptar la invitación',
              ),
            )
            .finally(() => setSubmitting(false));
        }}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? 'Aceptando...' : 'Aceptar invitación'}
      </button>
      {!auth.user ? (
        <p className="mt-2 text-sm text-amber-700">Inicia sesión para aceptar la invitación.</p>
      ) : null}
      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
