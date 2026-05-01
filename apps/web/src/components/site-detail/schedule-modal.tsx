import { Save } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '#/components/button';
import { Modal } from '#/components/modal';
import { SelectInput } from '#/components/select-input';
import { TextInput } from '#/components/text-input';
import { useFormSubmitHandler } from '#/lib/forms';
import { DAY_LABELS } from './helpers';
import type { ScheduleFormState } from './types';

export function ScheduleModal({
  open,
  onOpenChange,
  form,
  setForm,
  timezoneOptions,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  form: ScheduleFormState;
  setForm: Dispatch<SetStateAction<ScheduleFormState>>;
  timezoneOptions: Array<{ label: string; value: string }>;
  onSave: () => void;
  saving: boolean;
}) {
  const handleSubmit = useFormSubmitHandler(onSave);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Programación"
      description="Define cuándo se ejecutará la auditoría automática para este dominio."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <SelectInput
              id="schedule-frequency"
              label="Frecuencia"
              value={form.frequency}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  frequency: value as 'DAILY' | 'WEEKLY',
                }))
              }
              options={[
                { label: 'Diaria', value: 'DAILY' },
                { label: 'Semanal', value: 'WEEKLY' },
              ]}
            />
          </div>
          {form.frequency === 'WEEKLY' ? (
            <div>
              <SelectInput
                id="schedule-day-of-week"
                label="Día de la semana"
                value={form.dayOfWeek}
                onValueChange={(value) => setForm((current) => ({ ...current, dayOfWeek: value }))}
                options={DAY_LABELS.map((label, index) => ({
                  label,
                  value: String(index),
                }))}
              />
            </div>
          ) : null}
          <div>
            <label
              htmlFor="schedule-time"
              className="mb-1 block text-xs font-semibold text-slate-600"
            >
              Hora
            </label>
            <TextInput
              id="schedule-time"
              type="time"
              value={form.timeOfDay}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  timeOfDay: event.target.value,
                }))
              }
            />
          </div>
          <div className={form.frequency === 'WEEKLY' ? 'sm:col-span-2' : ''}>
            <SelectInput
              id="schedule-timezone"
              label="Zona horaria"
              value={form.timezone}
              onValueChange={(value) => setForm((current) => ({ ...current, timezone: value }))}
              options={timezoneOptions}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            <Save size={14} />
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
