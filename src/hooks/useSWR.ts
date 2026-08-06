import { useState, useEffect, useCallback, useRef } from 'react';
import { safeGetItem, safeSetItem } from '../utils/storage';

export function useSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    initialData?: T;
    onSuccess?: (data: T) => void;
    refreshInterval?: number;
    enabled?: boolean;
  } = {}
) {
  const enabled = options.enabled !== false;
  const refreshInterval = options.refreshInterval;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | undefined>(() => {
    const cached = safeGetItem(`swr_cache_${key}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return undefined;
      }
    }
    return options.initialData;
  });
  
  const [error, setError] = useState<Error | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const revalidate = useCallback(async () => {
    if (!enabled) return;
    setIsValidating(true);
    try {
      const freshData = await fetcherRef.current();
      setData(freshData);
      safeSetItem(`swr_cache_${key}`, JSON.stringify(freshData));
      optionsRef.current.onSuccess?.(freshData);
      setError(null);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsValidating(false);
    }
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled) return;
    
    revalidate();

    if (refreshInterval) {
      const interval = setInterval(revalidate, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [key, revalidate, refreshInterval, enabled]);

  return { data, error, isValidating, mutate: revalidate };
}

