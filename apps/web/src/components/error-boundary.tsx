import * as React from 'react';

interface ErrorBoundaryProps {
  fallback?: (ctx: { error: Error; reset: () => void }) => React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.reset });
      }
      return (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-6 py-5 text-rose-800"
        >
          <div className="text-sm font-semibold">Algo ha ido mal en esta sección.</div>
          <div className="text-xs text-rose-700/80">{error.message}</div>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
