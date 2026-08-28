/**
 * A robust, self-healing partial JSON parser for streaming & complete JSON responses.
 * 1. Properly escapes unescaped control characters (literal newlines, carriage returns, tabs) inside strings.
 * 2. Sanitizes single-escaped LaTeX backslashes (\frac, \sqrt, \times, \pm, \int, \theta, etc.) so JSON.parse succeeds.
 * 3. Balances open strings, brackets, and braces for smooth real-time streaming preview.
 * 4. Includes an intelligent regex fallback that extracts all steps and content if strict JSON.parse fails.
 */

export function sanitizeLaTeXInJSON(raw: string): string {
  if (!raw) return raw;

  let inString = false;
  let isEscaped = false;
  let out = '';

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (isEscaped) {
        // We are right after a backslash
        isEscaped = false;
        
        // Standard JSON escape characters: ", \, /, b, f, n, r, t, u
        if (char === '"' || char === '\\' || char === '/' || char === 'b' || char === 'f' || char === 'n' || char === 'r' || char === 't') {
          out += '\\' + char;
        } else if (char === 'u') {
          // Check if followed by 4 hex digits
          const next4 = raw.slice(i + 1, i + 5);
          if (/^[0-9a-fA-F]{4}$/.test(next4)) {
            out += '\\u';
          } else {
            // Not a valid unicode escape, escape the backslash: \\u
            out += '\\\\u';
          }
        } else {
          // It was a LaTeX command or symbol (e.g. \frac, \sqrt, \alpha, \pm, \{, etc.)
          // Double-escape the backslash so JSON.parse sees literal \char
          out += '\\\\' + char;
        }
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
        out += '"';
      } else if (char === '\n') {
        // Raw literal newline inside a JSON string -> escape to \n
        out += '\\n';
      } else if (char === '\r') {
        // Raw carriage return -> escape to \r
        out += '\\r';
      } else if (char === '\t') {
        // Raw tab -> escape to \t
        out += '\\t';
      } else {
        out += char;
      }
    } else {
      if (char === '"') {
        inString = true;
        out += '"';
      } else {
        out += char;
      }
    }
  }

  if (isEscaped) {
    out += '\\';
  }

  return out;
}

/**
 * Fallback regex extractor to rescue data if JSON.parse fails on malformed input.
 */
function extractWithRegex(cleaned: string): any {
  try {
    const topicMatch = cleaned.match(/"topic_title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    const topic_title = topicMatch ? JSON.parse(`"${topicMatch[1]}"`) : "Math & Science Solution";

    const formatMatch = cleaned.match(/"format_type"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    const format_type = formatMatch ? formatMatch[1] : "steps";

    // Extract solution steps
    const steps: any[] = [];
    const stepRegex = /\{\s*"step_id"\s*:\s*(\d+)[^}]*?"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[^}]*?"content"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"(?:[^}]*?"is_final_answer"\s*:\s*(true|false))?/gis;
    
    let match;
    while ((match = stepRegex.exec(cleaned)) !== null) {
      try {
        const step_id = parseInt(match[1], 10);
        const title = JSON.parse(`"${match[2]}"`);
        const content = JSON.parse(`"${match[3]}"`);
        const is_final_answer = match[4] === 'true';
        steps.push({ step_id, title, content, is_final_answer });
      } catch (e) {
        // If inner JSON.parse for string fails, use raw string unescaped
        steps.push({
          step_id: parseInt(match[1], 10) || steps.length + 1,
          title: match[2].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          content: match[3].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          is_final_answer: match[4] === 'true'
        });
      }
    }

    // Extract suggestions
    const suggestions: string[] = [];
    const sugMatch = cleaned.match(/"suggestions"\s*:\s*\[([\s\S]*?)\]/i);
    if (sugMatch) {
      const items = sugMatch[1].match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
      if (items) {
        for (const item of items) {
          try {
            suggestions.push(JSON.parse(item));
          } catch {
            suggestions.push(item.replace(/^"|"$/g, ''));
          }
        }
      }
    }

    // Extract key_formula & exam_trap if present
    let key_formula: string | undefined;
    const formulaMatch = cleaned.match(/"key_formula"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (formulaMatch) {
      try { key_formula = JSON.parse(`"${formulaMatch[1]}"`); } catch { key_formula = formulaMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
    }

    let exam_trap: string | undefined;
    const trapMatch = cleaned.match(/"exam_trap"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (trapMatch) {
      try { exam_trap = JSON.parse(`"${trapMatch[1]}"`); } catch { exam_trap = trapMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
    }

    if (steps.length > 0) {
      return { topic_title, format_type, key_formula, exam_trap, solution_steps: steps, suggestions };
    }
  } catch (err) {
    console.warn("Regex extraction failed:", err);
  }
  return null;
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

  // 1. Sanitize control characters and LaTeX backslashes
  const sanitized = sanitizeLaTeXInJSON(cleaned);

  // 2. Try direct JSON.parse first
  try {
    const directParsed = JSON.parse(sanitized);
    if (directParsed && typeof directParsed === 'object') {
      return directParsed;
    }
  } catch {}

  // 3. Balance partial streaming JSON
  let state = 'NORMAL'; // NORMAL, IN_STRING, ESCAPE
  const stack: string[] = [];
  let result = '';

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
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
    const parsed = JSON.parse(closedStr);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {
    // If balancing parse fails, use recursive fallback by trimming incomplete tail
    try {
      const lastComma = closedStr.lastIndexOf(',');
      if (lastComma !== -1 && lastComma < closedStr.length - 2) {
        const fallback = parsePartialJSON(sanitized.slice(0, lastComma));
        if (fallback) return fallback;
      }
    } catch (err) {}
  }

  // 4. Ultimate safety fallback: Regex extractor
  return extractWithRegex(sanitized) || extractWithRegex(cleaned);
}
