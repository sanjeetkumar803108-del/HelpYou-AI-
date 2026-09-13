import React, { ComponentType, lazy, useState, useEffect } from 'react';

// Global registry of chunk reset callbacks
const chunkResetCallbacks = new Set<() => void>();

/**
 * Detects if an error is caused by stale/missing dynamic chunks (common after app updates/rebuilds)
 */
export function isChunkLoadError(err: any): boolean {
  if (!err) return false;
  const msg = (err?.message || String(err || '')).toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror') ||
    msg.includes('dynamically imported module') ||
    msg.includes('error: 404')
  );
}

/**
 * Resets all lazy component instances across the entire application.
 * Clears any cached rejected promises from previous offline states.
 */
export function resetAllLazyChunks() {
  console.log(`[ResilientLazy] Resetting ${chunkResetCallbacks.size} lazy components...`);
  chunkResetCallbacks.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('[ResilientLazy] Error in chunk reset callback:', e);
    }
  });
}

function retryImport<T>(fn: () => Promise<T>, retriesLeft = 3, interval = 500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fn()
      .then(resolve)
      .catch((error) => {
        // If it is a chunk version mismatch error, auto-reload the page once to pull fresh bundle
        if (isChunkLoadError(error) && typeof window !== 'undefined') {
          const lastReload = sessionStorage.getItem('last_chunk_auto_reload');
          const now = Date.now();
          if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
            sessionStorage.setItem('last_chunk_auto_reload', now.toString());
            console.warn('[ResilientLazy] Chunk version mismatch detected. Reloading for fresh bundle...');
            window.location.reload();
            return;
          }
        }

        if (retriesLeft <= 0) {
          console.error('[ResilientLazy] Dynamic asset import failed after retries:', error);
          return reject(error);
        }
        setTimeout(() => {
          retryImport(fn, retriesLeft - 1, Math.round(interval * 1.5)).then(resolve, reject);
        }, interval);
      });
  });
}

/**
 * Creates a resilient dynamic lazy component that does NOT permanently cache
 * rejected module promises. If the import fails while offline, it can be retried
 * seamlessly on network restoration, "Try Again" tap, or pull-to-refresh.
 */
export function resilientLazy<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>
): React.FC<any> & { resetChunk: () => void } {
  let currentLazy = lazy(() => retryImport(importer));

  const ResilientComponent: any = (props: any) => {
    const [retryKey, setRetryKey] = useState(0);

    const reload = () => {
      currentLazy = lazy(() => retryImport(importer));
      setRetryKey(prev => prev + 1);
    };

    useEffect(() => {
      chunkResetCallbacks.add(reload);

      const handleNetworkRestored = () => {
        console.log('[ResilientLazy] Network restored / force-refresh event: invalidating cached chunk...');
        reload();
      };

      window.addEventListener('online', handleNetworkRestored);
      window.addEventListener('app-force-refresh', handleNetworkRestored);

      return () => {
        chunkResetCallbacks.delete(reload);
        window.removeEventListener('online', handleNetworkRestored);
        window.removeEventListener('app-force-refresh', handleNetworkRestored);
      };
    }, []);

    return React.createElement(currentLazy, { key: retryKey, ...props });
  };

  ResilientComponent.resetChunk = () => {
    currentLazy = lazy(() => retryImport(importer));
  };

  return ResilientComponent;
}
