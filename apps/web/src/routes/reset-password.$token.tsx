import { useForm } from '@tanstack/react-form';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { redirectIfAuthed } from '../lib/redirect-if-authed-guard';
import { useState } from 'react';
import { Button } from '#/components/button';
import { FieldShell } from '#/components/field-shell';
import { Notice } from '#/components/notice';
import { TextInput } from '#/components/text-input';

import { AuthFooter, AuthPage, BackToLoginLink } from '../components/auth-page';
import { RedirectIfAuthed } from '../components/redirect-if-authed';
import { useAuth } from '../lib/auth-context';
import { firstFormError, useFormSubmitHandler } from '../lib/forms';

export const Route = createFileRoute('/reset-password/$token')({
  beforeLoad: redirectIfAuthed,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const goToLogin = navigate;
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      confirmPassword: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      setError(null);

      if (value.password !== value.confirmPassword) {
        throw new Error('Las contraseñas no coinciden');
      }

      await auth.resetPassword({ password: value.password, token });
      setCompleted(true);
      setTimeout(() => {
        void goToLogin({ to: '/login' });
      }, 1000);
    },
  });
  const handleResetPasswordSubmit = useFormSubmitHandler(async () => {
    try {
      await form.handleSubmit();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo restablecer la contraseña');
    }
  });

  return (
    <RedirectIfAuthed>
      <AuthPage
        title="Restablecer contraseña"
        subtitle="Define una nueva contraseña segura para tu cuenta."
        footer={
          completed ? (
            <Link to="/login" className="font-semibold text-brand-600 no-underline hover:underline">
              Ir a iniciar sesión
            </Link>
          ) : (
            <BackToLoginLink />
          )
        }
      >
        <form onSubmit={handleResetPasswordSubmit}>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <fieldset
                disabled={Boolean(isSubmitting) || completed}
                className="m-0 border-0 p-0 space-y-5"
              >
                <form.Field
                  name="password"
                  validators={{
                    onChange: ({ value }) => {
                      if (!value) {
                        return 'La contraseña es obligatoria';
                      }
                      if (value.length < 10) {
                        return 'Debe tener al menos 10 caracteres';
                      }
                      if (!/[A-Za-z]/.test(value)) {
                        return 'Debe incluir al menos una letra';
                      }
                      if (!/\d/.test(value)) {
                        return 'Debe incluir al menos un número';
                      }
                      return;
                    },
                  }}
                >
                  {(field) => (
                    <FieldShell
                      label="Nueva contraseña"
                      htmlFor="reset-password"
                      required
                      description="Mínimo 10 caracteres. Debe incluir al menos una letra y un número."
                      error={firstFormError(field.state.meta.errors)}
                    >
                      <TextInput
                        id="reset-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={10}
                        placeholder="••••••••"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </FieldShell>
                  )}
                </form.Field>

                <form.Field
                  name="confirmPassword"
                  validators={{
                    onChange: ({ value }) => (!value ? 'Confirma la contraseña' : undefined),
                  }}
                >
                  {(field) => (
                    <FieldShell
                      label="Confirmar contraseña"
                      htmlFor="reset-confirm"
                      required
                      error={firstFormError(field.state.meta.errors)}
                    >
                      <TextInput
                        id="reset-confirm"
                        type="password"
                        autoComplete="new-password"
                        minLength={10}
                        placeholder="••••••••"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </FieldShell>
                  )}
                </form.Field>

                {completed ? (
                  <Notice tone="success">
                    Contraseña actualizada correctamente. Redirigiendo al inicio de sesión.
                  </Notice>
                ) : null}
                {error ? <Notice tone="danger">{error}</Notice> : null}
              </fieldset>
            )}
          </form.Subscribe>

          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                fullWidth
                size="lg"
                disabled={!canSubmit || completed}
                loading={Boolean(isSubmitting)}
                className="mt-8 justify-center"
              >
                {isSubmitting ? 'Guardando...' : 'Guardar nueva contraseña'}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </AuthPage>
      <div className="mx-auto w-full max-w-[420px] px-4">
        <AuthFooter />
      </div>
    </RedirectIfAuthed>
  );
}
