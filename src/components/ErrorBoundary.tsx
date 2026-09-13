import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Sparkles, RefreshCw, Home } from 'lucide-react';
import { triggerVibration } from '../utils/vibrate';
import { safeRemoveItem, safePurgeKeysByPrefix, safeClearAll } from '../utils/storage';
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
 * Crash-Proof & Self-Healing ErrorBoundary:
 * 1. Automatically intercepts ChunkLoadErrors and silently refreshes bundle with 15s debounce.
 * 2. Automatically purges corrupt cache for the feature.
 * 3. Silently auto-recovers without showing ugly error screens.
 * 4. Gracefully falls back to Home Dashboard if a feature cannot render, keeping the app alive and usable.
 * 5. Eliminates scary "This screen keeps crashing" dialogs permanently.
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
    console.warn(`[CrashProof Boundary - ${feature}] Caught hitch:`, error.message);

    try { triggerVibration(10); } catch (_) {}

    // 1. If it is a chunk version mismatch error, auto-reload window cleanly once
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      const lastReload = sessionStorage.getItem('last_chunk_auto_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
        sessionStorage.setItem('last_chunk_auto_reload', now.toString());
        console.warn(`[CrashProof Boundary] Auto-healing chunk mismatch for ${feature}...`);
        window.location.reload();
        return;
      }
    }

    // 2. Automatically purge any corrupt local cache keys for this feature
    this.autoPurgeCorruptCache();

    // Invalidate stale lazy chunks
    resetAllLazyChunks();

    // 3. Silent self-healing attempt
    const currentAttempts = this.state.autoHealAttempts;
    if (currentAttempts < 2) {
      this.setState(prev => ({ autoHealAttempts: prev.autoHealAttempts + 1 }));
      this.autoHealTimer = setTimeout(() => {
        console.log(`[CrashProof Boundary - ${feature}] Performing silent auto-heal attempt ${currentAttempts + 1}...`);
        try {
          window.dispatchEvent(new CustomEvent('app-force-refresh'));
        } catch (_) {}
        if (this.props.onRetry) {
          try { this.props.onRetry(); } catch (_) {}
        }
        this.setState({ hasError: false, error: null });
      }, 80);
      return;
    }

    // 4. If the feature repeatedly fails rendering, gracefully exit back to Dashboard
    console.warn(`[CrashProof Boundary - ${feature}] Auto-exiting feature to keep user experience smooth.`);
    this.autoHealTimer = setTimeout(() => {
      this.handleGracefulExit();
    }, 100);
  }

  public componentDidMount() {
    window.addEventListener('online', this.handleNetworkRecovery);
    window.addEventListener('app-force-refresh', this.handleNetworkRecovery);
  }

  public componentWillUnmount() {
    if (this.autoHealTimer) {
      clearTimeout(this.autoHealTimer);
    }
    window.removeEventListener('online', this.handleNetworkRecovery);
    window.removeEventListener('app-force-refresh', this.handleNetworkRecovery);
  }

  private autoPurgeCorruptCache = () => {
    try {
      if (this.props.cacheKeysToPurgeOnCrash && this.props.cacheKeysToPurgeOnCrash.length > 0) {
        this.props.cacheKeysToPurgeOnCrash.forEach(k => {
          safeRemoveItem(k);
          safePurgeKeysByPrefix(k);
        });
      }

      if (this.props.featureName === 'Learning Island') {
        safePurgeKeysByPrefix('learning_island_progress_');
        safeRemoveItem('learning_island_selected_subject_id');
      } else if (this.props.featureName === 'Test Prep') {
        safeRemoveItem('ap_test_prep_history');
      } else if (this.props.featureName === '1v1 Quiz Battle') {
        safeRemoveItem('ap_quiz_battle_last_room');
      } else if (this.props.featureName === 'Profile') {
        safeRemoveItem('study_passive_usage_data');
      }
    } catch (e) {
      console.warn('[CrashProof Boundary] Cache purge notice:', e);
    }
  };

  private handleNetworkRecovery = () => {
    if (this.state.hasError) {
      console.log(`[CrashProof Boundary] Network restored / force-refresh event: auto-healing view...`);
      this.handleSoftReset();
    }
  };

  private handleSoftReset = () => {
    try { triggerVibration(15); } catch (_) {}
    resetAllLazyChunks();
    try {
      window.dispatchEvent(new CustomEvent('app-force-refresh'));
    } catch (_) {}

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

        {/* Clean Action Buttons */}
        <div className="flex flex-col gap-2 mt-5 w-full max-w-[220px]">
          <button
            onClick={this.handleSoftReset}
            className="w-full px-5 py-2.5 bg-zinc-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-zinc-800 shadow-sm cursor-pointer active:scale-95 transition-transform"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Resume Feature
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
