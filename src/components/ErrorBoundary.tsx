import { Component, type ErrorInfo, type ReactNode } from 'react';
import { OctagonAlert } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        readable = `Cloud sync error (${parsed.operationType ?? 'operation'} on ${parsed.path ?? 'workspace'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return {
      hasError: true,
      message: readable,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Titan Quant ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] text-slate-100 p-6">
        <div className="w-full max-w-lg rounded-lg border border-red-500/35 bg-[#111620] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-400">
              <OctagonAlert className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-sm font-semibold text-white">
                Workspace Recovery Required
              </h1>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed break-words">
                {this.state.message}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#1E2633]">
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
              }}
              className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Reload View
            </button>
          </div>
        </div>
      </div>
    );
  }
}
