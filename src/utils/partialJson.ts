/**
 * A robust, self-healing partial JSON parser for streaming JSON responses.
 * It uses a bracket-and-brace matching stack to complete partial JSON structures,
 * sanitizes unescaped LaTeX backslashes so math/chemistry formulas are not corrupted by JSON.parse,
 * and recursively heals itself if standard parsing fails due to incomplete keys/values.
 */

export function sanitizeLaTeXInJSON(raw: string): string {
  if (!raw) return raw;
  
  // Replace backslashes in JSON strings that are not standard JSON escapes
  // Standard JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
  // If \ is followed by a LaTeX command (e.g. \rightarrow, \frac, \text, \theta) or symbol (\{, \[, \_, \%, \$),
  // escape it to \\ so JSON.parse receives the literal backslash.
  return raw.replace(/\\(?:([a-zA-Z]+)|([^"\\/bfnrtu]))/g, (match, word, symbol) => {
    if (word) {
      if (word === 'b' || word === 'f' || word === 'n' || word === 'r' || word === 't') {
        return match; // standard 1-letter JSON escape
      }
      if (/^u[0-9a-fA-F]{4}$/.test(word)) {
        return match; // standard unicode escape
      }
      return '\\\\' + word;
    }
    if (symbol) {
      return '\\\\' + symbol;
    }
    return match;
  });
}

export function parsePartialJSON(jsonStr: string): any {
  if (!jsonStr) return null;
  
  let cleaned = jsonStr.trim();
  
  // Strip markdown block wrappers if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  }

  // Find the first opening brace
  const startIdx = cleaned.indexOf('{');
  if (startIdx === -1) {
    return null;
  }
  cleaned = cleaned.slice(startIdx);

  let state = 'NORMAL'; // NORMAL, IN_STRING, ESCAPE
  const stack: string[] = [];
  let result = '';

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    result += char;

    if (state === 'NORMAL') {
      if (char === '"') {
        state = 'IN_STRING';
      } else if (char === '{') {
        stack.push('{');
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === '[') {
        stack.push('[');
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    } else if (state === 'IN_STRING') {
      if (char === '\\') {
        state = 'ESCAPE';
      } else if (char === '"') {
        state = 'NORMAL';
      }
    } else if (state === 'ESCAPE') {
      state = 'IN_STRING';
    }
  }

  let closedStr = result;
  
  if (state === 'ESCAPE') {
    closedStr = closedStr.slice(0, -1) + '"';
    state = 'NORMAL';
  } else if (state === 'IN_STRING') {
    closedStr += '"';
    state = 'NORMAL';
  }

  // If in NORMAL state, clean up trailing separators that would make JSON invalid
  if (state === 'NORMAL') {
    closedStr = closedStr.trim();
    while (closedStr.endsWith(',') || closedStr.endsWith(':')) {
      closedStr = closedStr.slice(0, -1).trim();
    }
  }

  // Balance the brackets and braces
  for (let i = stack.length - 1; i >= 0; i--) {
    const openChar = stack[i];
    if (openChar === '{') {
      closedStr += '}';
    } else if (openChar === '[') {
      closedStr += ']';
    }
  }

  try {
    const sanitizedJSON = sanitizeLaTeXInJSON(closedStr);
    return JSON.parse(sanitizedJSON);
  } catch (e) {
    // Self-healing recursive fallback: if parsing fails, strip the last item
    // and try again. This gracefully handles incomplete key-value pairs (e.g. "title": "Inco )
    try {
      const lastComma = closedStr.lastIndexOf(',');
      if (lastComma !== -1 && lastComma < closedStr.length) {
        return parsePartialJSON(cleaned.slice(0, lastComma));
      }
    } catch (err) {}
    return null;
  }
}
