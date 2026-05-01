import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { EmptyState } from '#/components/empty-state';
import { QueryState } from '#/components/query-state';
import { Skeleton } from '#/components/skeleton';
import { useAuth } from '../../lib/auth-context';
import { REFETCH_INTERVALS } from '../../lib/refetch-intervals';

type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
};

export const Route = createFileRoute('/_authenticated/notifications')({
  component: NotificationsPage,
});

function NotificationsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => auth.api.get<Notification[]>('/notifications'),
    enabled: Boolean(auth.accessToken),
    refetchInterval: REFETCH_INTERVALS.NOTIFICATIONS_MS,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => auth.api.post(`/notifications/${id}/read`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const sorted = useMemo(() => {
    if (!notifications.data) return notifications.data;
    return [...notifications.data].sort((a, b) => {
      const aUnread = a.readAt === null;
      const bUnread = b.readAt === null;
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [notifications.data]);

  const unreadCount = useMemo(
    () => (notifications.data ?? []).filter((n) => n.readAt === null).length,
    [notifications.data],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Notificaciones</h1>
        {unreadCount > 0 ? (
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            {unreadCount} sin leer
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        <QueryState
          status={notifications.status}
          data={sorted}
          error={notifications.error}
          onRetry={() => notifications.refetch()}
          isEmpty={(list) => list.length === 0}
          loading={
            <ul className="space-y-2">
              {['n1', 'n2', 'n3'].map((slot) => (
                <li key={slot} className="rounded-md border border-slate-200 px-3 py-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                </li>
              ))}
            </ul>
          }
          empty={
            <EmptyState
              title="Sin notificaciones"
              description="Cuando haya alertas o cambios en tus auditorías aparecerán aquí."
            />
          }
        >
          {(list) => (
            <ul className="space-y-2">
              {list.map((item) => {
                const unread = item.readAt === null;
                return (
                  <li
                    key={item.id}
                    className={`rounded-md border px-3 py-2 transition ${
                      unread ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {unread ? (
                            <span
                              aria-hidden="true"
                              className="inline-block h-2 w-2 shrink-0 rounded-full bg-brand-500"
                            />
                          ) : null}
                          <p
                            className={`truncate font-semibold ${unread ? 'text-slate-900' : 'text-slate-700'}`}
                          >
                            {item.title}
                          </p>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{item.body}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {unread ? (
                        <button
                          type="button"
                          onClick={() => markRead.mutate(item.id)}
                          className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-brand-400 hover:bg-white hover:text-brand-700"
                        >
                          Marcar como leída
                        </button>
                      ) : (
                        <span className="shrink-0 text-xs uppercase tracking-wide text-slate-400">
                          Leída
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryState>
      </div>
    </section>
  );
}
