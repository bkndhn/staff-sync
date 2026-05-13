import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Home } from 'lucide-react';

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
    console.error(`[ErrorBoundary] Caught error in ${this.props.moduleName || 'Component'}:`, error, errorInfo);
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
            <h3 className="text-lg font-bold text-white">
              {this.props.moduleName ? `${this.props.moduleName} Module Error` : 'Rendering Interruption'}
            </h3>
            <p className="text-xs text-white/60 max-w-sm mx-auto leading-relaxed">
              An unexpected condition prevented this component from displaying correctly. The rest of the application remains fully secure and active.
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
