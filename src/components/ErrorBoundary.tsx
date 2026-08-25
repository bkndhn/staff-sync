import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Home } from 'lucide-react';
import { errorTracker } from '../services/errorTrackingService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const moduleName = this.props.moduleName || 'Component';
    console.error(`[ErrorBoundary] Caught error in ${moduleName}:`, error, errorInfo);
    const errorWithComponentStack = new Error(error.message);
    errorWithComponentStack.name = error.name;
    errorWithComponentStack.stack = [error.stack, errorInfo.componentStack].filter(Boolean).join('\n\nReact component stack:\n');
    void errorTracker.captureException(errorWithComponentStack, {
      component: moduleName,
      severity: 'error',
    });
  }

  public componentDidUpdate(previousProps: Props) {
    if (previousProps.moduleName !== this.props.moduleName && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    try {
      localStorage.setItem('activeTab', 'Dashboard');
      window.location.reload();
    } catch {}
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-8 max-w-xl mx-auto my-12 card-premium border border-red-500/20 text-center space-y-5 relative overflow-hidden">
          {/* Subtle red glow accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto border border-red-500/20 shadow-inner">
            <AlertOctagon className="text-red-400" size={32} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {this.props.moduleName ? `${this.props.moduleName} could not be displayed` : 'This section could not be displayed'}
            </h3>
            <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto leading-relaxed">
              The error was logged with its stack trace. Retry this page or return to the dashboard; the rest of the app is still available.
            </p>
          </div>

          {this.state.error && (
            <div className="p-3 rounded-lg bg-black/40 border border-white/5 text-left overflow-x-auto max-h-32 scrollbar-none">
              <p className="text-[11px] font-mono text-red-300/90 select-all whitespace-pre-wrap break-all">
                {this.state.error.toString()}
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={this.handleReload}
              className="btn-premium px-4 py-2 text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={14} />
              <span>Retry Render</span>
            </button>
            <button
              onClick={this.handleGoHome}
              className="btn-ghost px-4 py-2 text-xs flex items-center gap-1.5 hover:bg-white/5"
            >
              <Home size={14} />
              <span>Main Dashboard</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
