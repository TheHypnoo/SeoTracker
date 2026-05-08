import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@base-ui/react';
import { Command } from 'cmdk';
import {
  Activity,
  Bell,
  FolderKanban,
  Globe,
  LayoutDashboard,
  LogOut,
  Play,
  Plus,
  Users2,
  Webhook,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { useAuth } from '../lib/auth-context';
import { useProject } from '../lib/project-context';
import { useToast } from './toast';

type SiteRow = {
  id: string;
  name: string;
  domain: string;
  projectId: string;
};

type SitesPayload = { items: SiteRow[] };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Global Cmd/Ctrl+K palette. Indexes three sources, all already loaded or
 * cheap to fetch:
 *  - Páginas: hardcoded route list (always available, no query).
 *  - Proyectos: from useProject() (already in memory).
 *  - Dominios: sites of the active project (lazy-fetched on first open).
 *
 * cmdk's <Command.Dialog> handles overlay, focus trap and Escape; we just
 * style it with Tailwind. The keyboard shortcut listener lives in AppLayout
 * so the palette can be opened from anywhere — including from a button in
 * the topbar.
 */
export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const auth = useAuth();
  const project = useProject();
  const queryClient = useQueryClient();
  const toast = useToast();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // The palette offers a contextual "run audit" action only when the user
  // is on a site detail page. Match `/sites/:id` exactly — `/sites_/...`
  // (audit detail) is a separate route and shouldn't trigger the shortcut.
  const siteIdMatch = pathname.match(/^\/sites\/([^/]+)$/);
  const currentSiteId = siteIdMatch?.[1];

  const sites = useQuery<SitesPayload>({
    queryKey: ['cmdk-sites', project.activeProjectId],
    queryFn: () =>
      auth.api.get<SitesPayload>(`/sites?projectId=${project.activeProjectId}&limit=200`),
    enabled: open && Boolean(auth.accessToken && project.activeProjectId),
    staleTime: 30_000,
  });

  const runAudit = useMutation({
    mutationFn: (siteId: string) => auth.api.post(`/sites/${siteId}/audits/run`),
    onSuccess: async (_data, siteId) => {
      await queryClient.invalidateQueries({ queryKey: ['audits', siteId] });
      toast.success('Auditoría lanzada', 'Verás el progreso en el detalle del dominio.');
    },
    onError: (reason) => {
      toast.error(
        'No se pudo lanzar',
        reason instanceof Error ? reason.message : 'Inténtalo de nuevo en un momento.',
      );
    },
  });

  const close = () => onOpenChange(false);

  const goto = (run: () => void | Promise<void>) => () => {
    close();
    void run();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-[10vh] left-1/2 z-50 w-[min(92vw,40rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl outline-none">
          <Dialog.Title className="sr-only">Buscador rápido</Dialog.Title>
          <Dialog.Description className="sr-only">
            Busca páginas, proyectos, dominios y acciones rápidas.
          </Dialog.Description>
          <Command label="Buscador rápido">
            <Command.Input
              placeholder="Buscar páginas, proyectos o dominios…"
              className="w-full border-b border-slate-200 px-5 py-4 text-base text-slate-900 outline-none placeholder:text-slate-400"
            />
            <Command.List className="max-h-[55vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-slate-500">
                Sin resultados
              </Command.Empty>

              <CommandGroup heading="Acciones">
                {currentSiteId ? (
                  <CommandRow
                    icon={<Play size={14} />}
                    label="Lanzar auditoría — este dominio"
                    hint={runAudit.isPending ? 'lanzando…' : undefined}
                    onSelect={goto(() => runAudit.mutate(currentSiteId))}
                  />
                ) : null}
                <CommandRow
                  icon={<LogOut size={14} />}
                  label="Cerrar sesión"
                  onSelect={goto(() => auth.logout())}
                />
              </CommandGroup>

              <CommandGroup heading="Páginas">
                <CommandRow
                  icon={<LayoutDashboard size={14} />}
                  label="Panel de control"
                  onSelect={goto(() => navigate({ to: '/dashboard' }))}
                />
                {project.activeProjectId ? (
                  <CommandRow
                    icon={<Globe size={14} />}
                    label="Dominios"
                    onSelect={goto(() =>
                      navigate({
                        to: '/projects/$id/sites',
                        params: { id: project.activeProjectId as string },
                      }),
                    )}
                  />
                ) : null}
                <CommandRow
                  icon={<Bell size={14} />}
                  label="Notificaciones"
                  onSelect={goto(() => navigate({ to: '/notifications' }))}
                />
                <CommandRow
                  icon={<Users2 size={14} />}
                  label="Equipo"
                  onSelect={goto(() => navigate({ to: '/settings/team' }))}
                />
                <CommandRow
                  icon={<Webhook size={14} />}
                  label="Integraciones"
                  onSelect={goto(() => navigate({ to: '/settings/integrations' }))}
                />
                <CommandRow
                  icon={<Activity size={14} />}
                  label="Actividad"
                  onSelect={goto(() => navigate({ to: '/settings/activity' }))}
                />
                <CommandRow
                  icon={<Plus size={14} />}
                  label="Nuevo proyecto"
                  onSelect={goto(() => navigate({ to: '/projects/new' }))}
                />
              </CommandGroup>

              {project.projects.length > 0 ? (
                <CommandGroup heading="Proyectos">
                  {project.projects.map((p) => (
                    <CommandRow
                      key={p.id}
                      icon={<FolderKanban size={14} />}
                      label={p.name}
                      hint={p.id === project.activeProjectId ? 'activo' : undefined}
                      onSelect={goto(async () => {
                        if (p.id !== project.activeProjectId) {
                          await project.setActiveProject(p.id);
                        }
                        navigate({ to: '/dashboard' });
                      })}
                    />
                  ))}
                </CommandGroup>
              ) : null}

              {sites.data?.items.length ? (
                <CommandGroup heading="Dominios">
                  {sites.data.items.map((s) => (
                    <CommandRow
                      key={s.id}
                      // The `value` is what cmdk filters against. Include both
                      // name and domain so the user can search by either.
                      value={`${s.name} ${s.domain}`}
                      icon={<Globe size={14} />}
                      label={s.name}
                      hint={s.domain}
                      onSelect={goto(() => navigate({ to: '/sites/$id', params: { id: s.id } }))}
                    />
                  ))}
                </CommandGroup>
              ) : null}
            </Command.List>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CommandGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-slate-400"
    >
      {children}
    </Command.Group>
  );
}

function CommandRow({
  icon,
  label,
  hint,
  value,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  value?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value ?? label}
      onSelect={onSelect}
      className="flex cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 aria-selected:bg-brand-50 aria-selected:text-brand-700"
    >
      <span className="text-slate-400">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint ? <span className="shrink-0 text-xs font-medium text-slate-400">{hint}</span> : null}
    </Command.Item>
  );
}
