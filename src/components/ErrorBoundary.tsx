import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught component error:', error, errorInfo);
    triggerVibration(50);
  }

  private handleReset = () => {
    triggerVibration(15);
    this.setState({ hasError: false, error: null });
    // Attempt to refresh the page/screen to recover cleanly
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center p-6 bg-[#FAF9F6] text-zinc-900 text-center font-sans">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 border border-red-200">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-800">Something went wrong</h2>
          <p className="text-sm text-zinc-500 font-medium max-w-xs mt-2 leading-relaxed">
            The screen encountered an unexpected rendering issue. Try resetting below.
          </p>
          <button
            onClick={this.handleReset}
            className="mt-6 px-5 py-3 bg-zinc-950 text-white rounded-xl font-black text-xs flex items-center gap-2 hover:bg-zinc-900 shadow-sm border border-zinc-900 cursor-pointer active:scale-95 transition-transform"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            RESET SCREEN
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
