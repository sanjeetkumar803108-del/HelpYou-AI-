/**
 * Utility for safe tactile/haptic feedback using the HTML5 Vibration API.
 * Uses a default short tap (15ms) which is perfect for button clicks and navigation.
 */
export function triggerVibration(pattern: number | number[] = 15) {
  if (
    typeof window !== "undefined" &&
    typeof window.navigator !== "undefined" &&
    typeof window.navigator.vibrate === "function"
  ) {
    try {
      window.navigator.vibrate(pattern);
    } catch (error) {
      console.warn("Tactile feedback not supported or blocked by user preference:", error);
    }
  }
}
