import { Settings2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '#/components/button';
import { Skeleton } from '#/components/skeleton';
import type { AlertRule } from './types';

export function AlertsCard({
  alertState,
  setAlertState,
  onSave,
  saving,
  loading,
}: {
  alertState: AlertRule;
  setAlertState: Dispatch<SetStateAction<AlertRule>>;
  onSave: () => void;
  saving: boolean;
  loading: boolean;
}) {
  const disabled = !alertState.enabled;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Settings2 size={14} className="text-slate-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">Alertas de regresión</h3>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Recibe avisos cuando algo empeore entre auditorías.
      </p>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          <ToggleRow
            label="Alertas activas"
            checked={alertState.enabled}
            onChange={(checked) => setAlertState((current) => ({ ...current, enabled: checked }))}
          />
          <div className={`space-y-2.5 ${disabled ? 'opacity-50' : ''}`}>
            <ToggleRow
              label="Caída de score"
              hint={`Si baja ≥ ${alertState.scoreDropThreshold} puntos`}
              checked={alertState.notifyOnScoreDrop}
              disabled={disabled}
              onChange={(checked) =>
                setAlertState((current) => ({ ...current, notifyOnScoreDrop: checked }))
              }
            />
            {alertState.notifyOnScoreDrop ? (
              <div className="ml-1 flex items-center gap-2 text-xs text-slate-600">
                <span>Umbral:</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  disabled={disabled}
                  value={alertState.scoreDropThreshold}
                  onChange={(event) =>
                    setAlertState((current) => ({
                      ...current,
                      scoreDropThreshold: Number(event.target.value) || 1,
                    }))
                  }
                  className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none transition focus:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-200"
                />
                <span>puntos</span>
              </div>
            ) : null}
            <ToggleRow
              label="Nuevas incidencias críticas"
              checked={alertState.notifyOnNewCriticalIssues}
              disabled={disabled}
              onChange={(checked) =>
                setAlertState((current) => ({ ...current, notifyOnNewCriticalIssues: checked }))
              }
            />
            <ToggleRow
              label="Aumento de incidencias totales"
              checked={alertState.notifyOnIssueCountIncrease}
              disabled={disabled}
              onChange={(checked) =>
                setAlertState((current) => ({
                  ...current,
                  notifyOnIssueCountIncrease: checked,
                }))
              }
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className="min-w-0">
        <span className="block text-sm text-slate-700">{label}</span>
        {hint ? <span className="block text-[11px] text-slate-500">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-brand-500"
      />
    </label>
  );
}
