import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cable, KeyRound, RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '#/components/badge';
import { Button } from '#/components/button';
import { EmptyState } from '#/components/empty-state';
import { Notice } from '#/components/notice';
import { QueryState, type QueryStateProps } from '#/components/query-state';
import { SelectInput } from '#/components/select-input';
import { Skeleton } from '#/components/skeleton';
import { useToast } from '#/components/toast';
import { formatDisplayDateTime } from '#/lib/date-format';
import { formatSearchConsoleProperty } from '#/lib/search-console-format';

import { useAuth } from '../../lib/auth-context';

type GoogleConnection = {
  id: string;
  projectId: string;
  googleAccountEmail: string;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SearchConsoleProperty = {
  id: string;
  googleConnectionId: string;
  siteUrl: string;
  permissionLevel: string;
  verified: boolean;
  lastSyncedAt: string;
};

type AuthorizationResponse = { authorizationUrl: string };

type SyncResponse = { count: number; properties: SearchConsoleProperty[] };
type ListQuery<T> = Pick<QueryStateProps<T[]>, 'data' | 'error' | 'status'> & {
  refetch: () => unknown;
};

const CONNECTIONS_LOADING = <Skeleton className="h-20 w-full" />;
const CONNECTIONS_EMPTY = (
  <EmptyState
    title="Sin cuentas Google"
    description="Conecta Google para empezar a sincronizar propiedades de Search Console."
  />
);
const PROPERTIES_LOADING = <Skeleton className="h-24 w-full" />;
const PROPERTIES_EMPTY = (
  <Notice tone="neutral">
    Aún no hay propiedades sincronizadas. Conecta Google y pulsa “Sincronizar”.
  </Notice>
);

export function GoogleSearchConsoleCard({ projectId }: { projectId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [oauthPending, setOauthPending] = useState(false);

  const connectionsKey = ['google-connections', projectId] as const;
  const propertiesKey = ['search-console-properties', projectId] as const;

  const connections = useQuery({
    queryKey: connectionsKey,
    queryFn: () => auth.api.get<GoogleConnection[]>(`/projects/${projectId}/google/connections`),
    enabled: Boolean(auth.accessToken && projectId),
  });

  const properties = useQuery({
    queryKey: propertiesKey,
    queryFn: () =>
      auth.api.get<SearchConsoleProperty[]>(`/projects/${projectId}/search-console/properties`),
    enabled: Boolean(auth.accessToken && projectId),
  });

  const activeConnectionId =
    connections.data?.some((connection) => connection.id === selectedConnectionId) === true
      ? selectedConnectionId
      : (connections.data?.[0]?.id ?? '');
  const activeConnection = connections.data?.find(
    (connection) => connection.id === activeConnectionId,
  );

  const handleStartOAuth = async () => {
    setOauthPending(true);
    try {
      const result = await auth.api.get<AuthorizationResponse>(
        `/projects/${projectId}/google/oauth/start`,
      );
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setOauthPending(false);
      toast.error(
        'No se pudo iniciar Google OAuth',
        error instanceof Error ? error.message : 'Revisa la configuración de Google Cloud.',
      );
    }
  };

  const syncProperties = useMutation({
    mutationFn: (googleConnectionId: string) =>
      auth.api.post<SyncResponse>(`/projects/${projectId}/search-console/properties/sync`, {
        googleConnectionId,
      }),
    onSuccess: async (result) => {
      toast.success('Propiedades sincronizadas', `${result.count} propiedades disponibles.`);
      await queryClient.invalidateQueries({ queryKey: propertiesKey });
    },
    onError: (error) => {
      toast.error(
        'No se pudo sincronizar',
        error instanceof Error
          ? error.message
          : 'Google Search Console no respondió correctamente.',
      );
    },
  });

  const revokeConnection = useMutation({
    mutationFn: (connectionId: string) =>
      auth.api.delete(`/projects/${projectId}/google/connections/${connectionId}`),
    onSuccess: async () => {
      toast.success('Conexión revocada');
      setSelectedConnectionId('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: connectionsKey }),
        queryClient.invalidateQueries({ queryKey: propertiesKey }),
      ]);
    },
  });

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <IntegrationHeader
        oauthPending={oauthPending}
        projectId={projectId}
        onConnect={() => void handleStartOAuth()}
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ConnectedAccountsSection
          connections={connections}
          activeConnectionId={activeConnectionId}
          activeConnectionEmail={activeConnection?.googleAccountEmail}
          revokePending={revokeConnection.isPending}
          onSelectConnection={setSelectedConnectionId}
          onRevoke={(connectionId) => revokeConnection.mutate(connectionId)}
        />
        <PropertiesSection
          properties={properties}
          activeConnectionId={activeConnectionId}
          syncPending={syncProperties.isPending}
          onSync={(connectionId) => syncProperties.mutate(connectionId)}
        />
      </div>
    </article>
  );
}

function IntegrationHeader({
  oauthPending,
  projectId,
  onConnect,
}: {
  oauthPending: boolean;
  projectId: string;
  onConnect: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <Search size={20} aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">
                Google Search Console
              </h2>
              <Badge tone="brand">Solo lectura</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Conecta Google, sincroniza tus propiedades y vincúlalas a dominios de SEOTracker.
            </p>
          </div>
        </div>
      </div>
      <Button type="button" onClick={onConnect} loading={oauthPending} disabled={!projectId}>
        <KeyRound size={14} aria-hidden="true" />
        Conectar Google
      </Button>
    </div>
  );
}

function ConnectedAccountsSection({
  connections,
  activeConnectionId,
  activeConnectionEmail,
  revokePending,
  onSelectConnection,
  onRevoke,
}: {
  connections: ListQuery<GoogleConnection>;
  activeConnectionId: string;
  activeConnectionEmail: string | undefined;
  revokePending: boolean;
  onSelectConnection: (connectionId: string) => void;
  onRevoke: (connectionId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">Cuentas conectadas</h3>
          <p className="mt-1 text-xs text-slate-500">
            Cada cuenta puede aportar distintas propiedades de Search Console.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <QueryState
          status={connections.status}
          data={connections.data}
          error={connections.error}
          onRetry={() => void connections.refetch()}
          isEmpty={(list) => list.length === 0}
          loading={CONNECTIONS_LOADING}
          empty={CONNECTIONS_EMPTY}
        >
          {(list) => (
            <div className="space-y-4">
              <ActiveConnectionPicker
                connections={list}
                activeConnectionId={activeConnectionId}
                activeConnectionEmail={activeConnectionEmail}
                onSelectConnection={onSelectConnection}
              />
              <ul className="space-y-2">
                {list.map((connection) => (
                  <ConnectedAccountItem
                    key={connection.id}
                    connection={connection}
                    revokePending={revokePending}
                    onRevoke={onRevoke}
                  />
                ))}
              </ul>
            </div>
          )}
        </QueryState>
      </div>
    </section>
  );
}

function ActiveConnectionPicker({
  connections,
  activeConnectionId,
  activeConnectionEmail,
  onSelectConnection,
}: {
  connections: GoogleConnection[];
  activeConnectionId: string;
  activeConnectionEmail: string | undefined;
  onSelectConnection: (connectionId: string) => void;
}) {
  if (connections.length > 1) {
    return (
      <SelectInput
        label="Cuenta activa"
        value={activeConnectionId}
        onValueChange={onSelectConnection}
        options={connections.map((connection) => ({
          value: connection.id,
          label: connection.googleAccountEmail,
        }))}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <KeyRound size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">
            Cuenta activa
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-900">
            {activeConnectionEmail ?? connections[0]?.googleAccountEmail}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectedAccountItem({
  connection,
  revokePending,
  onRevoke,
}: {
  connection: GoogleConnection;
  revokePending: boolean;
  onRevoke: (connectionId: string) => void;
}) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">
            {connection.googleAccountEmail}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Conectada {formatDisplayDateTime(connection.createdAt)}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(connection.id)}
          disabled={revokePending}
        >
          Revocar
        </Button>
      </div>
    </li>
  );
}

function PropertiesSection({
  properties,
  activeConnectionId,
  syncPending,
  onSync,
}: {
  properties: ListQuery<SearchConsoleProperty>;
  activeConnectionId: string;
  syncPending: boolean;
  onSync: (connectionId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">Propiedades GSC</h3>
          <p className="text-xs text-slate-500">
            Sincroniza las propiedades disponibles para la cuenta seleccionada.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={syncPending}
          disabled={!activeConnectionId}
          onClick={() => activeConnectionId && onSync(activeConnectionId)}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Sincronizar
        </Button>
      </div>

      <div className="mt-4">
        <QueryState
          status={properties.status}
          data={properties.data}
          error={properties.error}
          onRetry={() => void properties.refetch()}
          isEmpty={(list) => list.length === 0}
          loading={PROPERTIES_LOADING}
          empty={PROPERTIES_EMPTY}
        >
          {(list) => (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {list.map((property) => (
                <PropertyItem key={property.id} property={property} />
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </section>
  );
}

function PropertyItem({ property }: { property: SearchConsoleProperty }) {
  const display = formatSearchConsoleProperty(property.siteUrl);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
          <Cable size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="break-all text-sm font-bold text-slate-900">{display.primary}</div>
            <Badge tone={property.verified ? 'success' : 'warning'}>
              {property.verified ? 'Verificada' : 'No verificada'}
            </Badge>
          </div>
          <div className="mt-0.5 break-all font-mono text-[11px] text-slate-400">{display.raw}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span>{display.secondary}</span>
            <span>·</span>
            <span>{property.permissionLevel}</span>
            <span>·</span>
            <span>sync {formatDisplayDateTime(property.lastSyncedAt)}</span>
          </div>
        </div>
      </div>
    </li>
  );
}
