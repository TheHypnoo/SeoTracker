import * as React from 'react';
import { Toast as BaseToast } from '@base-ui/react';
import { toastBridge } from '../lib/toast-bridge';
import { cn } from './utils';

const toastTypeClasses: Record<'neutral' | 'success' | 'warning' | 'danger' | 'info', string> = {
  danger:
    'border-[color:var(--color-status-danger-border)] bg-[color:var(--color-status-danger-bg)] text-[color:var(--color-status-danger-fg)]',
  info: 'border-[color:var(--color-status-info-border)] bg-[color:var(--color-status-info-bg)] text-[color:var(--color-status-info-fg)]',
  neutral: 'border-slate-200 bg-white text-slate-800',
  success:
    'border-[color:var(--color-status-success-border)] bg-[color:var(--color-status-success-bg)] text-[color:var(--color-status-success-fg)]',
  warning:
    'border-[color:var(--color-status-warning-border)] bg-[color:var(--color-status-warning-bg)] text-[color:var(--color-status-warning-fg)]',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <BaseToast.Provider limit={5} timeout={6000}>
      <ToastBridgeRegistrar />
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className="fixed bottom-4 right-4 z-50 flex w-[min(92vw,26rem)] flex-col gap-2 outline-none">
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

function ToastBridgeRegistrar() {
  const manager = BaseToast.useToastManager();
  React.useEffect(
    () =>
      toastBridge.register((input) =>
        manager.add({
          title: input.title,
          description: input.description,
          type: input.tone ?? 'neutral',
          priority: input.tone === 'danger' ? 'high' : undefined,
        }),
      ),
    [manager],
  );
  return null;
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return (
    <>
      {toasts.map((toast) => {
        const tone = (toast.type as keyof typeof toastTypeClasses | undefined) ?? 'neutral';
        return (
          <BaseToast.Root
            key={toast.id}
            toast={toast}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-md',
              toastTypeClasses[tone in toastTypeClasses ? tone : 'neutral'],
            )}
          >
            <div className="min-w-0 flex-1">
              {toast.title ? (
                <BaseToast.Title className="text-sm font-semibold">{toast.title}</BaseToast.Title>
              ) : null}
              {toast.description ? (
                <BaseToast.Description className="mt-1 text-xs leading-5 opacity-90">
                  {toast.description}
                </BaseToast.Description>
              ) : null}
            </div>
            <BaseToast.Close
              aria-label="Cerrar notificación"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-base opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              <span aria-hidden="true">×</span>
            </BaseToast.Close>
          </BaseToast.Root>
        );
      })}
    </>
  );
}

export function useToast() {
  const manager = BaseToast.useToastManager();
  return React.useMemo(
    () => ({
      dismiss: (id: string) => manager.close(id),
      error: (title: React.ReactNode, description?: React.ReactNode) =>
        manager.add({ title, description, type: 'danger', priority: 'high' }),
      info: (title: React.ReactNode, description?: React.ReactNode) =>
        manager.add({ title, description, type: 'info' }),
      show: (options: {
        title?: React.ReactNode;
        description?: React.ReactNode;
        tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
        timeout?: number;
      }) =>
        manager.add({
          title: options.title,
          description: options.description,
          type: options.tone ?? 'neutral',
          timeout: options.timeout,
        }),
      success: (title: React.ReactNode, description?: React.ReactNode) =>
        manager.add({ title, description, type: 'success' }),
      warning: (title: React.ReactNode, description?: React.ReactNode) =>
        manager.add({ title, description, type: 'warning' }),
    }),
    [manager],
  );
}
