import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useAuth } from '../lib/auth-context';

export const Route = createFileRoute('/invite/$token')({
  component: InviteTokenPage,
});

function InviteTokenPage() {
  const { token } = Route.useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const redirectTarget = `/invite/${token}`;

  return (
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Invitación al equipo</h1>
      <p className="mt-1 text-sm text-slate-600">
        Para unirte al proyecto, accede con la cuenta del correo invitado y acepta la invitación.
      </p>
      <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
        Este enlace es tu autorización de acceso. Si todavía no tienes cuenta, crea una con el mismo
        correo al que se envió la invitación y volverás a esta página para aceptarla.
      </p>
      <button
        type="button"
        disabled={submitting || !auth.user}
        onClick={() => {
          setError(null);
          setMessage(null);
          setSubmitting(true);

          void auth.api
            .post<{ projectId: string; success: true }>('/projects/invites/accept', { token })
            .then(async (result) => {
              await auth.api.patch('/users/preferences', { activeProjectId: result.projectId });
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['projects'] }),
                queryClient.invalidateQueries({ queryKey: ['user-preferences', auth.user?.id] }),
              ]);
              setMessage('Invitación aceptada. Ya tienes acceso al proyecto.');
              await navigate({ to: '/settings/team', search: { projectId: result.projectId } });
            })
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
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Necesitas iniciar sesión para aceptar la invitación.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/login"
              search={{ redirect: redirectTarget }}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white no-underline"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              search={{ redirect: redirectTarget }}
              className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 no-underline"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
