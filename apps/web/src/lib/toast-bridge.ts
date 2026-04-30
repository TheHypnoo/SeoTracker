// Singleton bridge so non-React modules (QueryClient mutation cache, etc.)
// can trigger toasts without holding a React reference. ToastProvider
// registers the actual handler at mount time. Until the handler is registered,
// toasts are queued and flushed once the handler arrives — this avoids losing
// errors that fire during hydration before the toast viewport is mounted.

import type { ReactNode } from 'react';

type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface ToastInput {
  title?: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
}

type Handler = (input: ToastInput) => void;

let handler: Handler | null = null;
const queue: ToastInput[] = [];

function dispatch(input: ToastInput) {
  if (handler) {
    handler(input);
    return;
  }
  queue.push(input);
}

export const toastBridge = {
  error(title: ReactNode, description?: ReactNode) {
    dispatch({ title, description, tone: 'danger' });
  },
  info(title: ReactNode, description?: ReactNode) {
    dispatch({ title, description, tone: 'info' });
  },
  register(fn: Handler) {
    handler = fn;
    while (queue.length) {
      const next = queue.shift();
      if (next) fn(next);
    }
    return () => {
      if (handler === fn) handler = null;
    };
  },
  show(input: ToastInput) {
    dispatch(input);
  },
  warning(title: ReactNode, description?: ReactNode) {
    dispatch({ title, description, tone: 'warning' });
  },
};
