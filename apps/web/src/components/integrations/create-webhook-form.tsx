import { OutboundEvent } from '@seotracker/shared-types';
import { useForm } from '@tanstack/react-form';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '../button';
import { Notice } from '../notice';
import { TextInput } from '../text-input';
import { createSubmitHandler, firstFormError } from '../../lib/forms';
import { ALL_EVENTS, EVENT_LABELS } from './integrations-types';

export type CreateWebhookInput = {
  name: string;
  url: string;
  headerName: string;
  headerValue: string;
  events: string[];
};

type Props = {
  /** Owns the actual API call — the form just collects + validates input. */
  onCreate: (input: CreateWebhookInput) => Promise<void>;
};

/**
 * Card with the form to register a new outbound webhook. Handles its own
 * field-level validation and surfaces submission errors locally; the route
 * file owns the mutation + cache invalidation.
 */
export function CreateWebhookForm({ onCreate }: Props) {
  const formId = useId();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: '',
      url: '',
      headerName: '',
      headerValue: '',
      events: [OutboundEvent.AUDIT_COMPLETED as string],
    },
    onSubmit: async ({ value, formApi }) => {
      setFormError(null);
      await onCreate({
        name: value.name.trim(),
        url: value.url.trim(),
        headerName: value.headerName.trim(),
        headerValue: value.headerValue.trim(),
        events: value.events,
      });
      formApi.reset();
    },
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
      <div className="flex items-center gap-3">
        <Plus size={18} className="text-brand-500" />
        <h2 className="text-2xl font-black tracking-tight text-slate-950">Nueva integración</h2>
      </div>
      <form
        className="mt-6 space-y-4"
        onSubmit={createSubmitHandler(async () => {
          try {
            await form.handleSubmit();
          } catch (reason) {
            setFormError(
              reason instanceof Error ? reason.message : 'No se pudo crear la integración',
            );
          }
        })}
      >
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) =>
              !value.trim()
                ? 'El nombre es obligatorio'
                : value.trim().length < 2
                  ? 'Mínimo 2 caracteres'
                  : undefined,
          }}
        >
          {(field) => (
            <div>
              <label
                htmlFor={`${formId}-name`}
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
              >
                Nombre
              </label>
              <TextInput
                id={`${formId}-name`}
                placeholder="Slack alerts"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              {firstFormError(field.state.meta.errors) ? (
                <p className="mt-2 text-xs text-rose-600">
                  {firstFormError(field.state.meta.errors)}
                </p>
              ) : null}
            </div>
          )}
        </form.Field>

        <form.Field
          name="url"
          validators={{
            onChange: ({ value }) => {
              if (!value.trim()) return 'La URL es obligatoria';
              try {
                const parsed = new URL(value.trim());
                if (!['http:', 'https:'].includes(parsed.protocol)) {
                  return 'Debe ser http(s)';
                }
                return undefined;
              } catch {
                return 'URL inválida';
              }
            },
          }}
        >
          {(field) => (
            <div>
              <label
                htmlFor={`${formId}-url`}
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
              >
                URL destino
              </label>
              <TextInput
                id={`${formId}-url`}
                placeholder="https://hooks.example.com/seotracker"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              {firstFormError(field.state.meta.errors) ? (
                <p className="mt-2 text-xs text-rose-600">
                  {firstFormError(field.state.meta.errors)}
                </p>
              ) : null}
            </div>
          )}
        </form.Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="headerName">
            {(field) => (
              <div>
                <label
                  htmlFor={`${formId}-header-name`}
                  className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                >
                  Header (opcional)
                </label>
                <TextInput
                  id={`${formId}-header-name`}
                  placeholder="Authorization"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="headerValue">
            {(field) => (
              <div>
                <label
                  htmlFor={`${formId}-header-value`}
                  className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                >
                  Valor del header
                </label>
                <TextInput
                  id={`${formId}-header-value`}
                  placeholder="Bearer ..."
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </div>
            )}
          </form.Field>
        </div>

        <form.Field
          name="events"
          validators={{
            onChange: ({ value }) =>
              value.length === 0 ? 'Selecciona al menos un evento' : undefined,
          }}
        >
          {(field) => (
            <fieldset>
              <legend className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Eventos a suscribir
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ALL_EVENTS.map((event) => {
                  const active = field.state.value.includes(event);
                  const eventInputId = `${formId}-event-${event}`;
                  return (
                    <div
                      key={event}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                        active
                          ? 'border-brand-500 bg-brand-50/60'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        id={eventInputId}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        checked={active}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...field.state.value, event]
                            : field.state.value.filter((ev) => ev !== event);
                          field.handleChange(next);
                        }}
                      />
                      <div>
                        <label
                          htmlFor={eventInputId}
                          className="cursor-pointer font-semibold text-slate-900"
                        >
                          {EVENT_LABELS[event] ?? event}
                        </label>
                        <div className="font-mono text-[11px] text-slate-500">{event}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {firstFormError(field.state.meta.errors) ? (
                <p className="mt-2 text-xs text-rose-600">
                  {firstFormError(field.state.meta.errors)}
                </p>
              ) : null}
            </fieldset>
          )}
        </form.Field>

        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Creando...' : 'Crear integración'}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
