/**
 * HELPYOU AI — GLOBAL IN-APP TOAST SYSTEM
 *
 * Replaces ALL native alert() / window.alert() calls across the app.
 * Usage:  showToast("Your message here")
 *         showToast("Success!", "success")
 *         showToast("Something failed", "error")
 *         showToast("Camera blocked", "warning")
 *
 * Automatically intercepts window.alert() so that even existing alerts
 * across third-party plugins or old components render as sleek in-app toasts.
 */

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastEvent {
  message: string;
  type: ToastType;
  duration?: number; // ms, default 3500
}

/**
 * Show a global in-app toast notification.
 */
export function showToast(message: string, type: ToastType = 'info', duration = 3500): void {
  if (typeof window === 'undefined') return;

  const cleanMessage = String(message || '')
    .replace(/^(\w+\s*:\s*)+/g, '') // remove prefixes like "Error: "
    .trim();

  if (!cleanMessage) return;

  window.dispatchEvent(
    new CustomEvent<ToastEvent>('show-toast', {
      detail: { message: cleanMessage, type, duration },
    })
  );
}

// ─── AUTOMATIC WINDOW.ALERT INTERCEPTOR ─────────────────────────────────────
// Ensures NO native black OS alert boxes can EVER appear anywhere in the app!
if (typeof window !== 'undefined') {
  const originalAlert = window.alert;

  window.alert = (msg?: any) => {
    try {
      const text = typeof msg === 'string' ? msg : (msg?.message || JSON.stringify(msg || ''));
      
      // Clean newlines from legacy multiline alert strings (e.g. "Title\n\nBody message")
      const formatted = text.replace(/\\n/g, '\n').replace(/\n+/g, ' — ').trim();

      const lower = formatted.toLowerCase();
      let type: ToastType = 'info';

      if (lower.includes('success') || lower.includes('copied') || lower.includes('saved') || lower.includes('restored') || lower.includes('subscribed')) {
        type = 'success';
      } else if (lower.includes('permission') || lower.includes('blocked') || lower.includes('denied') || lower.includes('allow') || lower.includes('offline')) {
        type = 'warning';
      } else if (lower.includes('fail') || lower.includes('error') || lower.includes('wrong') || lower.includes('invalid') || lower.includes('restricted')) {
        type = 'error';
      }

      showToast(formatted, type, 4000);
    } catch (e) {
      if (typeof originalAlert === 'function') {
        originalAlert(msg);
      }
    }
  };
}

