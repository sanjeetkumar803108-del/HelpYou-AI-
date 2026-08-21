import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';

interface Props {
  children: ReactNode;
  // Optional: custom fallback per-component
  fallbackMessage?: string;
  // If true, clicking Reset goes to home instead of full page reload
  softReset?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

/**
 * ENHANCED ERROR BOUNDARY
 * ─────────────────────────────────────────────────────────────
 * Catches React rendering errors before they crash the entire app.
 *
 * Anti-Crash Strategy:
 * 1. First crash → soft reset (just resets state, no full reload)
 * 2. If the same component crashes 2+ times → full page reload as last resort
 * 3. Shows a friendly, non-technical message to the user
 * 4. Logs full error details to console for debugging
 */
export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorCount: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught component error:', error.message);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Increment crash counter so we know if a component is repeatedly crashing
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));

    try {
      triggerVibration(30);
    } catch (_) {}
  }

  // ─── Soft Reset: Just clears the error state without full reload ──────────
  private handleSoftReset = () => {
    try { triggerVibration(15); } catch (_) {}
    this.setState({ hasError: false, error: null });
  };

  // ─── Hard Reset: Full page reload as last resort ──────────────────────────
  private handleHardReset = () => {
    try { triggerVibration(25); } catch (_) {}
    window.location.reload();
  };

  // ─── Go to home tab ────────────────────────────────────────────────────────
  private handleGoHome = () => {
    try { triggerVibration(15); } catch (_) {}
    this.setState({ hasError: false, error: null });
    // Navigate to home by removing any stale navigation state
    try {
      window.dispatchEvent(new CustomEvent('navigate-to-home'));
    } catch (_) {}
  };

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // If crashed 3+ times, force full reload to clear memory
    if (this.state.errorCount >= 3) {
      window.location.reload();
      return null;
    }

    const isRepeatedCrash = this.state.errorCount >= 2;

    return (
      <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center p-6 bg-[#FAF9F6] text-zinc-900 text-center font-sans">
        
        {/* Icon */}
        <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mb-4 border border-orange-200 shadow-sm">
          <AlertCircle className="w-8 h-8" />
        </div>

        {/* Title */}
        <h2 className="text-base font-black tracking-tight text-zinc-800">
          {isRepeatedCrash ? 'This screen keeps crashing' : 'Oops! Something went wrong'}
        </h2>

        {/* Message */}
        <p className="text-xs text-zinc-500 font-medium max-w-xs mt-2 leading-relaxed">
          {this.props.fallbackMessage ||
            (isRepeatedCrash
              ? "This screen is having trouble. A full restart will fix it."
              : "Don't worry — your data is safe. Tap below to get back on track.")}
        </p>

        {/* Action buttons */}
        <div className="flex flex-col gap-2.5 mt-6 w-full max-w-[220px]">

          {!isRepeatedCrash && (
            <button
              onClick={this.handleSoftReset}
              className="w-full px-5 py-3 bg-zinc-950 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:bg-zinc-900 shadow-sm border border-zinc-900 cursor-pointer active:scale-95 transition-transform"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          )}

          <button
            onClick={this.handleGoHome}
            className="w-full px-5 py-3 bg-white text-zinc-700 rounded-xl font-black text-xs flex items-center justify-center gap-2 border border-zinc-200 cursor-pointer active:scale-95 transition-transform hover:bg-zinc-50"
          >
            <Home className="w-3.5 h-3.5" />
            Go to Home
          </button>

          {isRepeatedCrash && (
            <button
              onClick={this.handleHardReset}
              className="w-full px-5 py-3 bg-red-500 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 border border-red-600 cursor-pointer active:scale-95 transition-transform"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restart App
            </button>
          )}
        </div>

        {/* Tiny debug info — only in dev mode */}
        {import.meta.env.DEV && this.state.error && (
          <div className="mt-4 p-3 bg-red-50/50 border border-red-150 rounded-xl max-w-sm text-left font-mono text-[9px] text-red-700 leading-normal overflow-auto whitespace-pre-wrap max-h-[100px] w-full">
            {this.state.error.message}
          </div>
        )}
      </div>
    );
  }
}
