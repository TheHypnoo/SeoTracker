import { useForm } from '@tanstack/react-form';
import { createFileRoute } from '@tanstack/react-router';
import { redirectIfAuthed } from '../lib/redirect-if-authed-guard';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#/components/button';
import { FieldShell } from '#/components/field-shell';
import { Notice } from '#/components/notice';
import { TextInput } from '#/components/text-input';

import { AuthFooter, AuthPage, BackToLoginLink } from '../components/auth-page';
import { RedirectIfAuthed } from '../components/redirect-if-authed';
import { useAuth } from '../lib/auth-context';
import { firstFormError, useFormSubmitHandler } from '../lib/forms';

export const Route = createFileRoute('/forgot-password')({
  beforeLoad: redirectIfAuthed,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const auth = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const form = useForm({
    defaultValues: {
      email: '',
    },
    onSubmit: async ({ value }) => {
      await auth.forgotPassword(value);
      setSubmitted(true);
    },
  });
  const { error, onSubmit } = useFormSubmitHandler(form, {
    defaultErrorMessage: 'No se pudo enviar el enlace',
  });

  return (
    <RedirectIfAuthed>
      <AuthPage
        title="Recuperar contraseña"
        subtitle="Introduce tu correo electrónico y te enviaremos un enlace para restablecerla."
        footer={<BackToLoginLink />}
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
                      htmlFor="forgot-email"
                      required
                      error={firstFormError(field.state.meta.errors)}
                    >
                      <TextInput
                        id="forgot-email"
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

                {submitted ? (
                  <Notice tone="success">
                    Si el correo existe, hemos enviado un enlace de recuperación.
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
                disabled={!canSubmit}
                loading={Boolean(isSubmitting)}
                className="mt-8 justify-center"
              >
                {isSubmitting ? 'Enviando...' : 'Enviar enlace'}
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
