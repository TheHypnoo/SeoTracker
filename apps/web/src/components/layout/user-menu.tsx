import { Menu as BaseMenu } from '@base-ui/react';
import { LogOut } from 'lucide-react';

function useInitials(value: string | undefined | null) {
  if (!value) return 'ST';
  const parts = value.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return 'ST';
  const [first, second] = parts;
  const initials = `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase();
  return initials || (first?.slice(0, 2).toUpperCase() ?? 'ST');
}

type UserMenuProps = {
  name: string | null | undefined;
  email: string | null | undefined;
  onLogout: () => void;
};

export function UserMenu({ name, email, onLogout }: UserMenuProps) {
  const displayName = name?.trim() || email || 'Cuenta';
  const initials = useInitials(name ?? email ?? '');
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label="Menú de usuario"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        {initials}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={8} align="end" className="z-50">
          <BaseMenu.Popup className="min-w-[14rem] rounded-xl border border-slate-200 bg-white p-1 shadow-lg outline-none">
            <div className="px-3 py-2.5">
              <div className="truncate text-sm font-semibold text-slate-900">{displayName}</div>
              {email && email !== displayName ? (
                <div className="truncate text-xs text-slate-500">{email}</div>
              ) : null}
            </div>
            <div className="my-1 h-px bg-slate-100" />
            <BaseMenu.Item
              onClick={onLogout}
              className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 outline-none transition data-[highlighted]:bg-slate-50 data-[highlighted]:text-slate-900"
            >
              <LogOut size={14} aria-hidden="true" />
              Cerrar sesión
            </BaseMenu.Item>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
