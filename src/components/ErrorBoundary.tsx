import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Sparkles, RefreshCw, Home } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';
import { safeRemoveItem, safePurgeKeysByPrefix } from '../utils/storage';
import { resetAllLazyChunks, isChunkLoadError } from '../utils/resilientLazy';
import { showToast } from '../utils/toast';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  onReset?: () => void;
  onRetry?: () => void;
  onClose?: () => void;
  featureName?: string;
  cacheKeysToPurgeOnCrash?: string[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  autoHealAttempts: number;
}

/**
 * Crash-Proof & Resilient ErrorBoundary:
 * 1. Intercepts ChunkLoadErrors and gives a single smooth chunk reload (500ms).
 * 2. Purges corrupt cache for the specific feature.
 * 3. Never enters infinite setState / setTimeout loops that freeze the browser.
 * 4. Gracefully exits to Dashboard when requested, keeping the rest of the app 100% smooth.
 */
export default class ErrorBoundary extends Component<Props, State> {
  private autoHealTimer: any = null;

  public state: State = {
    hasError: false,
    error: null,
    autoHealAttempts: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const feature = this.props.featureName || 'App Feature';
    console.warn(`[CrashProof Boundary - ${feature}] Caught hitch:`, error?.message);

    try { triggerVibration(10); } catch (_) {}

    // 1. Invalidate stale lazy chunks
    resetAllLazyChunks();

    // 2. Automatically purge any corrupt local cache keys for this feature
    this.autoPurgeCorruptCache();

    // 3. Stale chunk / rebuild detection:
    // When a new build deploys, old chunk hashes 404. Auto-reload immediately to sync latest assets.
    const isChunkError = isChunkLoadError(error);
    if (isChunkError) {
      const RELOAD_KEY = 'app_stale_chunk_reload_epoch';
      const now = Date.now();
      const lastReload = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
      if (now - lastReload > 4000) {
        sessionStorage.setItem(RELOAD_KEY, String(now));
        console.warn(`[CrashProof Boundary - ${feature}] Stale chunk 404 detected after rebuild. Auto-reloading to sync fresh assets...`);
        window.location.reload();
        return;
      }
    }

    // For general JavaScript errors, do NOT loop!
    // The screen remains stable so the user can easily click "Resume Feature" or "Back to Dashboard".
  }

  public componentDidMount() {
    window.addEventListener('online', this.handleNetworkRecovery);
  }

  public componentWillUnmount() {
    if (this.autoHealTimer) {
      clearTimeout(this.autoHealTimer);
    }
    window.removeEventListener('online', this.handleNetworkRecovery);
  }

  private autoPurgeCorruptCache = () => {
    try {
      if (this.props.cacheKeysToPurgeOnCrash && this.props.cacheKeysToPurgeOnCrash.length > 0) {
        this.props.cacheKeysToPurgeOnCrash.forEach(k => {
          safeRemoveItem(k);
          safePurgeKeysByPrefix(k);
        });
      }

      if (this.props.featureName === 'Profile') {
        safeRemoveItem('study_passive_usage_data');
      }
    } catch (e) {
      console.warn('[CrashProof Boundary] Cache purge notice:', e);
    }
  };

  private handleNetworkRecovery = () => {
    if (this.state.hasError) {
      console.log(`[CrashProof Boundary] Network restored: auto-healing view...`);
      this.handleSoftReset();
    }
  };

  private handleSoftReset = () => {
    try { triggerVibration(15); } catch (_) {}
    if (isChunkLoadError(this.state.error)) {
      console.log('[CrashProof Boundary] Stale chunk manual reload requested...');
      window.location.reload();
      return;
    }
    resetAllLazyChunks();

    if (this.props.onRetry) {
      try { this.props.onRetry(); } catch (_) {}
    }

    this.setState({ hasError: false, error: null, autoHealAttempts: 0 });
  };

  // Gracefully exits feature without blocking the user
  private handleGracefulExit = () => {
    try { triggerVibration(15); } catch (_) {}
    
    // Close active tool & return to Dashboard
    try {
      window.dispatchEvent(new CustomEvent('close-active-tool'));
      window.dispatchEvent(new CustomEvent('navigate-to-home'));
    } catch (_) {}

    if (this.props.onClose) {
      try { this.props.onClose(); } catch (_) {}
    } else if (this.props.onReset) {
      try { this.props.onReset(); } catch (_) {}
    }

    this.setState({ hasError: false, error: null, autoHealAttempts: 0 });
    try {
      showToast("✨ Returned to Dashboard to keep your session smooth.");
    } catch (_) {}
  };

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // High-Fidelity, gentle self-healing view (never scary, never stuck)
    return (
      <div className="w-full h-full min-h-[320px] flex flex-col items-center justify-center p-6 bg-[#FAF9F6] text-zinc-900 text-center font-sans">
        {/* Subtle Icon */}
        <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-3.5 border border-indigo-100 shadow-sm animate-pulse">
          <Sparkles className="w-7 h-7 text-indigo-600" />
        </div>

        {/* Reassuring Title */}
        <h2 className="text-base font-black tracking-tight text-zinc-850">
          Restoring Study Workspace
        </h2>

        {/* Friendly Subtitle */}
        <p className="text-xs text-zinc-500 font-medium max-w-xs mt-1.5 leading-relaxed">
          Self-healing and optimizing your session. Your study progress and streak are completely safe.
        </p>

        {this.state.error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-[11px] font-mono max-w-xs text-left overflow-auto max-h-36 select-all">
            <p className="font-bold text-red-900 mb-1">Feature: {this.props.featureName || 'App'}</p>
            <p className="font-semibold">{this.state.error.message || String(this.state.error)}</p>
            {this.state.error.stack && (
              <pre className="text-[9px] mt-1 text-red-600 whitespace-pre-wrap">{this.state.error.stack.slice(0, 300)}</pre>
            )}
          </div>
        )}

        {/* Clean Action Buttons */}
        <div className="flex flex-col gap-2 mt-5 w-full max-w-[220px]">
          <button
            onClick={this.handleSoftReset}
            className="w-full px-5 py-2.5 bg-zinc-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-zinc-800 shadow-sm cursor-pointer active:scale-95 transition-transform"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {isChunkLoadError(this.state.error) ? 'Update & Refresh App' : 'Resume Feature'}
          </button>

          <button
            onClick={this.handleGracefulExit}
            className="w-full px-5 py-2.5 bg-white text-zinc-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-zinc-200 cursor-pointer active:scale-95 transition-transform hover:bg-zinc-50 shadow-xs"
          >
            <Home className="w-3.5 h-3.5" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
}
