import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '#/components/button';
import { Notice } from '#/components/notice';
import { TextInput } from '#/components/text-input';

import { useAuth } from '../../lib/auth-context';
import { useFormSubmitHandler } from '../../lib/forms';
import { useProject } from '../../lib/project-context';

export const Route = createFileRoute('/_authenticated/projects/new')({
  component: NewProjectPage,
});

function NewProjectPage() {
  const auth = useAuth();
  const project = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const createProject = useMutation({
    mutationFn: (name: string) =>
      auth.api.post<{ id: string; name: string }>('/projects', { name }),
    onSuccess: async (created) => {
      setError(null);
      await project.refresh();
      await project.setActiveProject(created.id);
      await queryClient.invalidateQueries();
      navigate({ to: '/dashboard' });
    },
  });

  const form = useForm({
    defaultValues: { name: '' },
    onSubmit: async ({ value }) => {
      await createProject.mutateAsync(value.name.trim());
    },
  });
  const handleCreateProjectSubmit = useFormSubmitHandler(async () => {
    try {
      await form.handleSubmit();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo crear el proyecto');
    }
  });

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
        Nuevo proyecto
      </div>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
        Crea un nuevo proyecto
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
        Un proyecto agrupa dominios, equipo e integraciones. Úsalos para separar clientes, marcas o
        entornos.
      </p>

      <form className="mt-8 flex flex-col gap-3 sm:flex-row" onSubmit={handleCreateProjectSubmit}>
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) =>
              !value.trim()
                ? 'El nombre es obligatorio'
                : value.trim().length < 3
                  ? 'Debe tener al menos 3 caracteres'
                  : undefined,
          }}
        >
          {(field) => (
            <div className="w-full">
              <TextInput
                placeholder="Marketing Acme S.L."
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                invalid={Boolean(field.state.meta.errors[0])}
              />
              {field.state.meta.errors[0] ? (
                <p role="alert" className="mt-2 text-xs text-rose-600">
                  {String(field.state.meta.errors[0])}
                </p>
              ) : null}
            </div>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              size="lg"
              disabled={!canSubmit}
              loading={Boolean(isSubmitting)}
              className="px-6"
            >
              {isSubmitting ? 'Creando...' : 'Crear proyecto'}
            </Button>
          )}
        </form.Subscribe>
      </form>
      {error ? (
        <Notice tone="danger" className="mt-4">
          {error}
        </Notice>
      ) : null}
    </section>
  );
}
