/**
 * HELPYOU AI — GLOBAL TOAST PROVIDER
 *
 * Mount this ONCE at the root level (App.tsx) inside the main wrapper.
 * It listens for 'show-toast' custom events dispatched by showToast()
 * and renders beautiful, animated in-app notifications.
 *
 * Replaces ALL native alert() / window.alert() black popup boxes.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { ToastEvent, ToastType } from '../utils/toast';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 shrink-0" />,
  error: <AlertCircle className="w-4 h-4 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0" />,
  info: <Info className="w-4 h-4 shrink-0" />,
};

const STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-950/95 border-emerald-700/60 text-emerald-100 shadow-emerald-900/40',
  error:   'bg-red-950/95 border-red-700/60 text-red-100 shadow-red-900/40',
  warning: 'bg-amber-950/95 border-amber-700/60 text-amber-100 shadow-amber-900/40',
  info:    'bg-zinc-900/95 border-zinc-700/60 text-zinc-100 shadow-zinc-900/40',
};

const ICON_STYLES: Record<ToastType, string> = {
  success: 'text-emerald-400',
  error:   'text-red-400',
  warning: 'text-amber-400',
  info:    'text-zinc-400',
};

export default function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type, duration = 3000 } = (e as CustomEvent<ToastEvent>).detail;
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setToasts(prev => {
        // Max 3 toasts at a time — drop oldest if exceeded
        const next = [...prev, { id, message, type, duration }];
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });

      setTimeout(() => removeToast(id), duration);
    };

    window.addEventListener('show-toast', handler);
    return () => window.removeEventListener('show-toast', handler);
  }, [removeToast]);

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
      aria-live="polite"
    >
      <AnimatePresence mode="sync">
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.93 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`
              flex items-start gap-3 px-4 py-3.5
              rounded-2xl border backdrop-blur-md shadow-2xl
              pointer-events-auto
              ${STYLES[toast.type]}
            `}
          >
            {/* Icon */}
            <span className={`mt-0.5 ${ICON_STYLES[toast.type]}`}>
              {ICONS[toast.type]}
            </span>

            {/* Message */}
            <p className="flex-1 text-xs font-semibold leading-relaxed break-words">
              {toast.message}
            </p>

            {/* Close button */}
            <button
              onClick={() => removeToast(toast.id)}
              className="mt-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
