export interface MistakeEntry {
  id?: string;
  userId: string;
  sourceFeature: string;
  question: string;
  wrongInput: string;
  correctConcept: string;
  createdAt: string;
  aiFix?: {
    why_it_happened: string;
    the_fix: string;
    pro_memory_trick: string;
  } | null;
}

// Clean up any legacy localStorage entry
try {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('study_temp_mistakes');
  }
} catch (_) {}

/**
 * Mistake Vault has been permanently retired.
 * Keeping no-op stub for backward compatibility without breaking existing consumers.
 */
export async function saveMistakeToVault(
  _sourceFeature: string,
  _question: string,
  _wrongInput: string,
  _correctConcept: string
): Promise<void> {
  // Permanently disabled
}

/**
 * Mistake detection permanently disabled.
 */
export async function detectAndLogMistake(
  _sourceFeature: string,
  _userPrompt: string,
  _aiResponse: string
): Promise<void> {
  // Permanently disabled
}
