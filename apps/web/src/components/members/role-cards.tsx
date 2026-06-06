import { Role } from '@seotracker/shared-types';

import { ROLE_DESCRIPTIONS, ROLE_LABELS } from './permission-catalog';

const SELECTABLE_ROLES = [Role.MEMBER, Role.VIEWER] as const;

/**
 * Descriptive role selector used by the invite form and the member-edit modal.
 * Each role is a card with its label and a one-line description, so picking a
 * role is meaningful on its own — permission fine-tuning is a separate,
 * optional step.
 */
export function RoleCards({
  role,
  onRoleChange,
  name,
  disabled = false,
}: {
  role: Role;
  onRoleChange: (next: Role) => void;
  /** Unique radio-group name so multiple instances on a page don't collide. */
  name: string;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Rol
      </legend>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {SELECTABLE_ROLES.map((value) => {
          const selected = role === value;
          return (
            <label
              key={value}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition ${
                selected
                  ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm font-bold ${selected ? 'text-brand-700' : 'text-slate-800'}`}
                >
                  {ROLE_LABELS[value]}
                </span>
                <input
                  type="radio"
                  name={name}
                  className="h-4 w-4 shrink-0 text-brand-500 focus:ring-brand-500"
                  checked={selected}
                  onChange={() => onRoleChange(value)}
                />
              </span>
              <span className="text-xs leading-5 text-slate-500">{ROLE_DESCRIPTIONS[value]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
