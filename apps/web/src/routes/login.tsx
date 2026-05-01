import { useForm } from '@tanstack/react-form';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { redirectIfAuthed } from '../lib/redirect-if-authed-guard';
import { ArrowRight } from 'lucide-react';
import { Button } from '#/components/button';
import { FieldShell } from '#/components/field-shell';
import { Notice } from '#/components/notice';
import { TextInput } from '#/components/text-input';

import { AuthFooter, AuthPage } from '../components/auth-page';
import { RedirectIfAuthed } from '../components/redirect-if-authed';
import { useAuth } from '../lib/auth-context';
import { firstFormError, useFormSubmitHandler } from '../lib/forms';

type LoginSearch = { redirect?: string };

export const Route = createFileRoute('/login')({
  validateSearch: (search): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: redirectIfAuthed,
  component: LoginPage,
});

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      await auth.login(value);
      await navigate({ to: redirectTo ?? '/dashboard' });
    },
  });
  const { error, onSubmit } = useFormSubmitHandler(form, {
    defaultErrorMessage: 'No se pudo iniciar sesión',
  });

  return (
    <RedirectIfAuthed>
      <AuthPage
        title="Bienvenido de nuevo"
        subtitle="Ingresa tus credenciales para acceder a tu espacio de trabajo."
        footer={
          <>
            ¿No tienes cuenta?{' '}
            <Link
              to="/register"
              className="font-semibold text-brand-600 no-underline hover:underline"
            >
              Crear cuenta
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit}>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <fieldset disabled={Boolean(isSubmitting)} className="m-0 border-0 p-0 space-y-5">
                <form.Field
                  name="email"
                  validators={{
                    onChange: ({ value }) => {
                      if (!value) {
                        return 'El correo electrónico es obligatorio';
                      }

                      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                        return 'Introduce un correo electrónico válido';
                      }

                      return undefined;
                    },
                  }}
                >
                  {(field) => (
                    <FieldShell
                      label="Correo electrónico"
                      htmlFor="login-email"
                      required
                      error={firstFormError(field.state.meta.errors)}
                    >
                      <TextInput
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        placeholder="nombre@empresa.com"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </FieldShell>
                  )}
                </form.Field>

                <form.Field
                  name="password"
                  validators={{
                    onChange: ({ value }) => (!value ? 'La contraseña es obligatoria' : undefined),
                  }}
                >
                  {(field) => (
                    <FieldShell
                      label="Contraseña"
                      htmlFor="login-password"
                      required
                      error={firstFormError(field.state.meta.errors)}
                    >
                      <TextInput
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </FieldShell>
                  )}
                </form.Field>

                <div className="-mt-2 text-right text-sm">
                  <Link
                    to="/forgot-password"
                    className="font-semibold text-brand-600 no-underline hover:underline"
                  >
                    ¿Olvidaste la contraseña?
                  </Link>
                </div>

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
                disabled={!canSubmit}
                loading={Boolean(isSubmitting)}
                className="mt-8 justify-center"
              >
                {isSubmitting ? 'Accediendo...' : 'Iniciar sesión'}
                <ArrowRight size={16} aria-hidden="true" />
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
