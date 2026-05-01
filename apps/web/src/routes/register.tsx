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

export const Route = createFileRoute('/register')({
  beforeLoad: redirectIfAuthed,
  component: RegisterPage,
});

function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    onSubmit: async ({ value }) => {
      if (value.password !== value.confirmPassword) {
        throw new Error('Las contraseñas no coinciden');
      }

      await auth.register({
        name: value.name,
        email: value.email,
        password: value.password,
      });
      await navigate({ to: '/dashboard' });
    },
  });
  const { error, onSubmit } = useFormSubmitHandler(form, {
    defaultErrorMessage: 'No se pudo crear la cuenta',
  });

  return (
    <RedirectIfAuthed>
      <AuthPage
        title="Crear una cuenta"
        subtitle="Empieza a optimizar tu presencia técnica hoy mismo."
        footer={
          <>
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-semibold text-brand-600 no-underline hover:underline">
              Iniciar sesión
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit}>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <fieldset disabled={Boolean(isSubmitting)} className="m-0 border-0 p-0 space-y-5">
                <form.Field
                  name="name"
                  validators={{
                    onChange: ({ value }) =>
                      !value.trim()
                        ? 'El nombre completo es obligatorio'
                        : value.trim().length < 2
                          ? 'El nombre debe tener al menos 2 caracteres'
                          : undefined,
                  }}
                >
                  {(field) => (
                    <FieldShell
                      label="Nombre completo"
                      htmlFor="register-name"
                      required
                      error={firstFormError(field.state.meta.errors)}
                    >
                      <TextInput
                        id="register-name"
                        autoComplete="name"
                        placeholder="Ada Lovelace"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </FieldShell>
                  )}
                </form.Field>

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
                      htmlFor="register-email"
                      required
                      error={firstFormError(field.state.meta.errors)}
                    >
                      <TextInput
                        id="register-email"
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
                    onChange: ({ value }) => {
                      if (!value) return 'La contraseña es obligatoria';
                      if (value.length < 10) return 'Debe tener al menos 10 caracteres';
                      if (!/[A-Za-z]/.test(value)) return 'Debe incluir al menos una letra';
                      if (!/\d/.test(value)) return 'Debe incluir al menos un número';
                      return undefined;
                    },
                  }}
                >
                  {(field) => (
                    <FieldShell
                      label="Contraseña"
                      htmlFor="register-password"
                      required
                      description="Mínimo 10 caracteres. Debe incluir al menos una letra y un número."
                      error={firstFormError(field.state.meta.errors)}
                    >
                      <TextInput
                        id="register-password"
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
                      htmlFor="register-confirm"
                      required
                      error={firstFormError(field.state.meta.errors)}
                    >
                      <TextInput
                        id="register-confirm"
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
                {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            )}
          </form.Subscribe>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Al crear una cuenta aceptas nuestros{' '}
            <Link
              to="/legal/terms"
              className="font-medium text-slate-600 underline-offset-2 hover:underline"
            >
              Términos
            </Link>{' '}
            y la{' '}
            <Link
              to="/legal/privacy"
              className="font-medium text-slate-600 underline-offset-2 hover:underline"
            >
              Política de privacidad
            </Link>
            .
          </p>
        </form>
      </AuthPage>
      <div className="mx-auto w-full max-w-[420px] px-4">
        <AuthFooter />
      </div>
    </RedirectIfAuthed>
  );
}
