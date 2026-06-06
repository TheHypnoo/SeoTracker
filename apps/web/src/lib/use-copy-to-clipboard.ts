import { useCallback, useEffect, useRef, useState } from 'react';
import { toastBridge } from './toast-bridge';

type CopyOptions = {
  /** Toast title shown on success. Pass null to suppress the toast. */
  toast?: string | null;
};

/**
 * Copies text to the clipboard and exposes a transient `copied` flag (resets
 * after ~2s) plus optional toast feedback. Centralises the previously silent
 * `navigator.clipboard.writeText` calls so every copy action confirms itself.
 */
export function useCopyToClipboard({ toast = 'Copiado al portapapeles' }: CopyOptions = {}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard?.writeText(text);
        setCopied(true);
        if (toast) toastBridge.show({ title: toast, tone: 'success' });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 2000);
        return true;
      } catch {
        toastBridge.error('No se pudo copiar', 'Copia el contenido manualmente.');
        return false;
      }
    },
    [toast],
  );

  return { copied, copy };
}
