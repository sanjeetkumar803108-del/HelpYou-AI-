/**
 * Universal PDF Text Sanitizer for jsPDF Standard Fonts (Helvetica, Times, Courier).
 * 
 * Step 0: LaTeX/KaTeX math sanitizer — converts all math notation to readable plain text.
 * Step 1+: Maps Unicode emojis, surrogate pairs, IPA pronunciation symbols, Greek math glyphs,
 * smart quotes, and unprintable glyphs into clean, universally renderable PDF symbols 
 * so exported PDFs never display garbled symbols (like â€™, ðŸ"š, ï¿½, ???) or excessive spacing.
 */

export function sanitizePdfText(text: string): string {
  if (!text) return '';

  let str = text;

  // Protect code/diagram blocks so monospace indentation and ASCII characters are preserved
  const codeBlocks: string[] = [];
  str = str.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__PDF_CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // 0. LaTeX / KaTeX Sanitizer — convert math to readable plain text FIRST
  //    so downstream steps never see raw LaTeX commands as garbled output.

  // 0a. Strip display-math delimiters: $$...$$ and \[...\]
  str = str.replace(/\$\$([\s\S]*?)\$\$/g, function(_m, inner) { return inner.trim(); });
  str = str.replace(/\\\[([\s\S]*?)\\\]/g, function(_m, inner) { return inner.trim(); });

  // 0b. Strip inline-math delimiters: $...$ and \(...\)
  str = str.replace(/\$(.*?)\$/g, function(_m, inner) { return inner.trim(); });
  str = str.replace(/\\\(([\s\S]*?)\\\)/g, function(_m, inner) { return inner.trim(); });

  // 0c. Structural LaTeX: fractions, roots, superscripts, subscripts
  // Common fractions into clean Unicode glyphs
  str = str
    .replace(/\\frac\{1\}\{2\}/g, '½')
    .replace(/\\frac\{1\}\{4\}/g, '¼')
    .replace(/\\frac\{3\}\{4\}/g, '¾');
  // General fractions: \frac{a}{b} -> (a)/(b)  [two passes for nested]
  str = str.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  str = str.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  // Square root
  str = str.replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)');
  str = str.replace(/\\sqrt\s+(\S+)/g, 'sqrt($1)');

  // Common units and powers to real superscripts (supported in WinAnsi)
  str = str
    .replace(/m\/s\^2\b/g, 'm/s²')
    .replace(/m\/s\^\{2\}/g, 'm/s²')
    .replace(/cm\^3\b/g, 'cm³')
    .replace(/cm\^\{3\}/g, 'cm³')
    .replace(/m\^2\b/g, 'm²')
    .replace(/m\^\{2\}/g, 'm²')
    .replace(/m\^3\b/g, 'm³')
    .replace(/m\^\{3\}/g, 'm³')
    .replace(/km\^2\b/g, 'km²')
    .replace(/km\^\{2\}/g, 'km²')
    .replace(/kg\/m\^3\b/g, 'kg/m³')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/\^1\b/g, '¹')
    .replace(/\^\{2\}/g, '²')
    .replace(/\^\{3\}/g, '³')
    .replace(/\^\{1\}/g, '¹');

  // General superscript/subscript braces
  str = str.replace(/\^\{([^{}]*)\}/g, '^$1');
  str = str.replace(/_\{([^{}]*)\}/g, '_$1');

  // 0d. Bracket/delimiter commands
  str = str
    .replace(/\\left\|/g, '|').replace(/\\right\|/g, '|')
    .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
    .replace(/\\left\[/g, '[').replace(/\\right\]/g, ']')
    .replace(/\\left\\{/g, '{').replace(/\\right\\}/g, '}')
    .replace(/\\left\{/g, '{').replace(/\\right\}/g, '}');

  // 0e. Arrows & relations
  str = str
    .replace(/\\rightarrow/g, '->').replace(/\\leftarrow/g, '<-')
    .replace(/\\Rightarrow/g, '=>').replace(/\\Leftarrow/g, '<=')
    .replace(/\\leftrightarrow/g, '<->').replace(/\\Leftrightarrow/g, '<=>')
    .replace(/\\to\b/g, '->').replace(/\\gets\b/g, '<-')
    .replace(/\\leq\b/g, '<=').replace(/\\geq\b/g, '>=')
    .replace(/\\neq\b/g, '!=').replace(/\\approx\b/g, '~=')
    .replace(/\\equiv\b/g, '=').replace(/\\propto\b/g, 'proportional to')
    .replace(/\\infty\b/g, 'infinity');

  // 0f. Operators (preserve native WinAnsi characters ×, ÷, ±)
  str = str
    .replace(/\\times\b/g, '×').replace(/\\cdot\b/g, '•')
    .replace(/\\div\b/g, '÷').replace(/\\pm\b/g, '±').replace(/\\mp\b/g, '-/+')
    .replace(/\\int\b/g, 'integral').replace(/\\sum\b/g, 'sum').replace(/\\prod\b/g, 'product')
    .replace(/\\partial\b/g, 'd').replace(/\\nabla\b/g, 'del');

  // 0g. Math functions
  str = str
    .replace(/\\lim\b/g, 'lim').replace(/\\ln\b/g, 'ln').replace(/\\log\b/g, 'log')
    .replace(/\\exp\b/g, 'exp').replace(/\\det\b/g, 'det').replace(/\\max\b/g, 'max')
    .replace(/\\min\b/g, 'min').replace(/\\sup\b/g, 'sup').replace(/\\inf\b/g, 'inf')
    .replace(/\\sin\b/g, 'sin').replace(/\\cos\b/g, 'cos').replace(/\\tan\b/g, 'tan')
    .replace(/\\csc\b/g, 'csc').replace(/\\sec\b/g, 'sec').replace(/\\cot\b/g, 'cot')
    .replace(/\\arcsin\b/g, 'arcsin').replace(/\\arccos\b/g, 'arccos').replace(/\\arctan\b/g, 'arctan');

  // 0h. Greek letters (lowercase)
  str = str
    .replace(/\\alpha\b/g, 'alpha').replace(/\\beta\b/g, 'beta').replace(/\\gamma\b/g, 'gamma')
    .replace(/\\delta\b/g, 'delta').replace(/\\epsilon\b/g, 'epsilon').replace(/\\varepsilon\b/g, 'epsilon')
    .replace(/\\zeta\b/g, 'zeta').replace(/\\eta\b/g, 'eta').replace(/\\theta\b/g, 'theta')
    .replace(/\\vartheta\b/g, 'theta').replace(/\\iota\b/g, 'iota').replace(/\\kappa\b/g, 'kappa')
    .replace(/\\lambda\b/g, 'lambda').replace(/\\mu\b/g, 'mu').replace(/\\nu\b/g, 'nu')
    .replace(/\\xi\b/g, 'xi').replace(/\\pi\b/g, 'pi').replace(/\\varpi\b/g, 'pi')
    .replace(/\\rho\b/g, 'rho').replace(/\\varrho\b/g, 'rho').replace(/\\sigma\b/g, 'sigma')
    .replace(/\\varsigma\b/g, 'sigma').replace(/\\tau\b/g, 'tau').replace(/\\upsilon\b/g, 'upsilon')
    .replace(/\\phi\b/g, 'phi').replace(/\\varphi\b/g, 'phi').replace(/\\chi\b/g, 'chi')
    .replace(/\\psi\b/g, 'psi').replace(/\\omega\b/g, 'omega');

  // 0i. Greek letters (uppercase)
  str = str
    .replace(/\\Gamma\b/g, 'Gamma').replace(/\\Delta\b/g, 'Delta').replace(/\\Theta\b/g, 'Theta')
    .replace(/\\Lambda\b/g, 'Lambda').replace(/\\Xi\b/g, 'Xi').replace(/\\Pi\b/g, 'Pi')
    .replace(/\\Sigma\b/g, 'Sigma').replace(/\\Upsilon\b/g, 'Upsilon').replace(/\\Phi\b/g, 'Phi')
    .replace(/\\Psi\b/g, 'Psi').replace(/\\Omega\b/g, 'Omega');

  // 0j. Text formatting commands (extract content)
  str = str
    .replace(/\\textbf\{([^{}]*)\}/g, '$1')
    .replace(/\\textit\{([^{}]*)\}/g, '$1')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^{}]*)\}/g, '$1')
    .replace(/\\mathbf\{([^{}]*)\}/g, '$1')
    .replace(/\\mathit\{([^{}]*)\}/g, '$1')
    .replace(/\\boldsymbol\{([^{}]*)\}/g, '$1')
    .replace(/\\overline\{([^{}]*)\}/g, '$1')
    .replace(/\\underline\{([^{}]*)\}/g, '$1')
    .replace(/\\hat\{([^{}]*)\}/g, '$1-hat')
    .replace(/\\vec\{([^{}]*)\}/g, '$1-vec')
    .replace(/\\bar\{([^{}]*)\}/g, '$1-bar')
    .replace(/\\tilde\{([^{}]*)\}/g, '$1~')
    .replace(/\\dot\{([^{}]*)\}/g, '$1.')
    .replace(/\\ddot\{([^{}]*)\}/g, '$1..');

  // 0k. Spacing commands
  str = str
    .replace(/\\quad\b/g, '  ').replace(/\\qquad\b/g, '    ')
    .replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\:/g, ' ').replace(/\\!/g, '')
    .replace(/\\\\/g, ' ');

  // 0l. Strip LaTeX environments: \begin{...} ... \end{...}
  str = str.replace(/\\begin\{[^{}]*\}/g, '').replace(/\\end\{[^{}]*\}/g, '');

  // 0m. Strip any remaining unknown \command or \command{...} patterns
  str = str.replace(/\\[a-zA-Z]+(?:\{[^{}]*\})?/g, ' ');

  // 0n. Remove lone curly braces left from LaTeX grouping
  str = str.replace(/\{([^{}]*)\}/g, '$1').replace(/[{}]/g, '');

  // 1. Normalize Unicode IPA Pronunciation & Phonetic Symbols to readable Latin typography
  const phoneticMap: Record<string, string> = {
    'ə': 'e', 'ǝ': 'e', 'æ': 'ae', 'œ': 'oe', 'ʌ': 'u', 'ɑ': 'a', 'ɒ': 'o',
    'ɔ': 'o', 'ɛ': 'e', 'ɜ': 'er', 'ɪ': 'i', 'ʊ': 'u', 'iː': 'ee', 'uː': 'oo',
    'ɔː': 'or', 'ɑː': 'ah', 'ɜː': 'ur', 'eɪ': 'ay', 'aɪ': 'eye', 'ɔɪ': 'oy',
    'aʊ': 'ow', 'əʊ': 'oh', 'oʊ': 'oh', 'ɪə': 'eer', 'eə': 'air', 'ʊə': 'oor',
    'θ': 'th', 'ð': 'th', 'ʃ': 'sh', 'ʒ': 'zh', 'ʧ': 'ch', 'tʃ': 'ch',
    'ʤ': 'j', 'dʒ': 'j', 'ŋ': 'ng', 'ɡ': 'g', 'ɣ': 'gh', 'ʁ': 'r', 'ɾ': 'r',
    'ʔ': "'", 'ˈ': "'", 'ˌ': ',', 'ː': ':', 'ˑ': '.', '̃': '~'
  };

  for (const [symbol, replacement] of Object.entries(phoneticMap)) {
    str = str.split(symbol).join(replacement);
  }

  // 2. Convert common status, rating, bullet, and direction emojis to standard printable PDF glyphs
  str = str
    .replace(/[\u2705\u2714\u2611\u{1F5F8}]/gu, '✓ ')
    .replace(/[\u274C\u274E\u2716\u2718\u{1F5D9}]/gu, '✗ ')
    .replace(/[\u26A0\u{1F6A8}]/gu, '[!] ')
    .replace(/[\u27A1\u{1F449}\u25B6\u2794\u279C]/gu, '-> ')
    .replace(/[\u2B05\u{1F448}\u25C0]/gu, '<- ')
    .replace(/[\u2B06\u{1F53C}\u25B2]/gu, '^ ')
    .replace(/[\u2B07\u{1F53D}\u25BC]/gu, 'v ')
    .replace(/[\u2B50\u{1F31F}\u2728\u2734]/gu, '* ')
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

  // 2b. Unicode Superscript & Subscript characters
  // NOTE: ¹ (\u00B9), ² (\u00B2), and ³ (\u00B3) ARE natively supported in WinAnsi/Helvetica!
  // We keep them as real superscripts, and map only non-WinAnsi superscripts.
  const nonWinAnsiSuperscripts: Record<string, string> = {
    '\u2070': '^0', '\u2074': '^4', '\u2075': '^5', '\u2076': '^6',
    '\u2077': '^7', '\u2078': '^8', '\u2079': '^9', '\u207B': '^-',
    '\u207A': '^+', '\u207F': '^n', '\u2071': '^i',
  };
  const subscriptMap: Record<string, string> = {
    '\u2080': '_0', '\u2081': '_1', '\u2082': '_2', '\u2083': '_3',
    '\u2084': '_4', '\u2085': '_5', '\u2086': '_6', '\u2087': '_7',
    '\u2088': '_8', '\u2089': '_9', '\u208A': '_+', '\u208B': '_-',
    '\u2090': '_a', '\u2091': '_e', '\u2092': '_o', '\u2093': '_x',
    '\u2099': '_n',
  };
  for (const [ch, rep] of Object.entries(nonWinAnsiSuperscripts)) {
    str = str.split(ch).join(rep);
  }
  for (const [ch, rep] of Object.entries(subscriptMap)) {
    str = str.split(ch).join(rep);
  }

  // 3. Mathematical Greek & Scientific Unicode symbols mapping for core standard PDF fonts
  str = str
    .replace(/θ/g, 'theta')
    .replace(/π/g, 'pi')
    .replace(/α/g, 'alpha')
    .replace(/β/g, 'beta')
    .replace(/γ/g, 'gamma')
    .replace(/λ/g, 'lambda')
    .replace(/Δ/g, 'Delta')
    .replace(/δ/g, 'delta')
    .replace(/μ/g, 'mu')
    .replace(/σ/g, 'sigma')
    .replace(/ω/g, 'omega')
    .replace(/Ω/g, 'Omega')
    .replace(/Σ/g, 'Sum')
    .replace(/∞/g, 'infinity')
    .replace(/≈/g, '~=')
    .replace(/≠/g, '!=')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/√/g, 'sqrt')
    .replace(/∫/g, 'integral');

  // 4. Normalize Latin diacritics / accents (e.g. ā, ē, ī, ō, ū, ñ, é, à -> a, e, i, o, u, n, e, a)
  try {
    str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (_) {}

  // 5. Normalize smart quotes, dashes, and zero-width/invisible formatting characters
  str = str
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u02BB\u02BC]/g, "'")
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2002\u2003\u2009]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 6. Cleanly convert any remaining Unicode emojis or surrogate pairs
  try {
    str = str.replace(/\p{Extended_Pictographic}/gu, '• ');
  } catch (_) {
    str = str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '• ');
  }

  // 7. Clean up redundant spaces, extra blank lines, and repeated bullet points
  // IMPORTANT: Only collapse multiple spaces *between words*, preserving line indentation for graphs & diagrams!
  str = str
    .replace(/•\s*•+/g, '•')
    .replace(/([^\s\t])[ \t]{2,}/g, '$1 ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  // Restore protected code/diagram blocks
  str = str.replace(/__PDF_CODE_BLOCK_(\d+)__/g, (_m, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return codeBlocks[idx] || '';
  });

  return str;
}
