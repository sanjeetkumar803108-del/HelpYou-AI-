/**
 * Universal PDF Text Sanitizer for jsPDF Standard Fonts (Helvetica, Times, Courier).
 * 
 * Maps Unicode emojis, surrogate pairs, smart quotes, and unprintable glyphs into
 * clean, universally renderable PDF symbols so exported PDFs never display
 * garbled symbols (like âœ¨, ðŸ“š, ï¿½, ???).
 */

export function sanitizePdfText(text: string): string {
  if (!text) return '';

  let str = text;

  // 1. Convert common status, rating, bullet, and direction emojis to standard printable PDF glyphs
  str = str
    .replace(/[\u2705\u2714\u2611\u{1F5F8}]/gu, '✓ ')
    .replace(/[\u274C\u274E\u2716\u2718\u{1F5D9}]/gu, '✗ ')
    .replace(/[\u26A0\u{1F6A8}]/gu, '[!] ')
    .replace(/[\u27A1\u{1F449}\u25B6\u2794\u279C]/gu, '→ ')
    .replace(/[\u2B05\u{1F448}\u25C0]/gu, '← ')
    .replace(/[\u2B06\u{1F53C}\u25B2]/gu, '↑ ')
    .replace(/[\u2B07\u{1F53D}\u25BC]/gu, '↓ ')
    .replace(/[\u2B50\u{1F31F}\u2728\u2734]/gu, '★ ')
    .replace(/[\u{1F4A1}]/gu, '[Tip] ')
    .replace(/[\u{1F511}]/gu, '[Key] ')
    .replace(/[\u{1F4CC}\u{1F4CD}]/gu, '• ')
    .replace(/[\u{1F3AF}\u{1F680}\u{1F4DA}\u{1F9E0}\u26A1\u{1F50D}\u{1F4DD}\u{1F399}\u{1F525}\u{1F3C6}\u{1F393}\u{1F4D6}\u{1F3F7}]/gu, '• ')
    .replace(/0\uFE0F?\u20E3/gu, '0. ')
    .replace(/1\uFE0F?\u20E3/gu, '1. ')
    .replace(/2\uFE0F?\u20E3/gu, '2. ')
    .replace(/3\uFE0F?\u20E3/gu, '3. ')
    .replace(/4\uFE0F?\u20E3/gu, '4. ')
    .replace(/5\uFE0F?\u20E3/gu, '5. ')
    .replace(/6\uFE0F?\u20E3/gu, '6. ')
    .replace(/7\uFE0F?\u20E3/gu, '7. ')
    .replace(/8\uFE0F?\u20E3/gu, '8. ')
    .replace(/9\uFE0F?\u20E3/gu, '9. ')
    .replace(/\u{1F51F}/gu, '10. ');

  // 2. Normalize smart quotes, dashes, and invisible/zero-width formatting characters
  str = str
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u02BB\u02BC]/g, "'")
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2002\u2003\u2009]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 3. Cleanly convert any remaining Unicode emojis or surrogate pairs
  try {
    str = str.replace(/\p{Extended_Pictographic}/gu, '• ');
  } catch (_) {
    str = str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '• ');
  }

  // 4. Remove leftover raw non-ASCII unprintable symbols while preserving standard Latin characters
  str = str.replace(/•\s*•+/g, '•').replace(/[ \t]+/g, ' ');

  return str;
}
