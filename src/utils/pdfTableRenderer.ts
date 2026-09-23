import { jsPDF } from 'jspdf';
import { sanitizePdfText } from './pdfSanitizer';

export interface PdfTableOptions {
  margin?: number;
  contentWidth?: number;
  pageHeight?: number;
  headerBg?: [number, number, number];
  headerText?: [number, number, number];
  evenRowBg?: [number, number, number];
  oddRowBg?: [number, number, number];
  borderColor?: [number, number, number];
  textColor?: [number, number, number];
  fontSize?: number;
  onPageBreak?: () => void;
}

export interface PdfDiagramOptions {
  margin?: number;
  contentWidth?: number;
  pageHeight?: number;
  accentColor?: [number, number, number];
  bgColor?: [number, number, number];
  borderColor?: [number, number, number];
  textColor?: [number, number, number];
  fontSize?: number;
  onPageBreak?: () => void;
}

/**
 * Checks whether a markdown line represents a table row
 */
export function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // A table row typically contains pipe characters
  if (!trimmed.includes('|')) return false;
  // Exclude single pipe expressions like absolute values if they don't look like markdown tables
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return pipeCount >= 2 || (trimmed.startsWith('|') && trimmed.endsWith('|'));
}

/**
 * Checks if a line is a markdown table separator (e.g. |---|---| or |:---:|---:|)
 */
export function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\s*\|?\s*[-:]+[-| :]*\|?\s*$/.test(trimmed) && trimmed.includes('-');
}

/**
 * Converts mathematical powers, units, and carets into standard printable PDF superscripts & typography
 */
export function formatMathAndSuperscripts(text: string): string {
  if (!text) return '';
  return text
    // Common scientific unit carets -> clean Unicode superscripts (supported in WinAnsi)
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
    // Common algebraic and mathematical powers
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/\^1\b/g, '¹')
    .replace(/\^\{2\}/g, '²')
    .replace(/\^\{3\}/g, '³')
    .replace(/\^\{1\}/g, '¹')
    // Standard fractions
    .replace(/\b1\/2\b/g, '½')
    .replace(/\b1\/4\b/g, '¼')
    .replace(/\b3\/4\b/g, '¾')
    // Common mathematical operators
    .replace(/\\cdot\b/g, ' • ')
    .replace(/\\times\b/g, ' × ');
}

/**
 * Parses a table row string into individual cell strings
 */
function parseRowCells(rawLine: string): string[] {
  let line = rawLine.trim();
  if (line.startsWith('|')) line = line.substring(1);
  if (line.endsWith('|')) line = line.substring(0, line.length - 1);

  return line.split('|').map(c => {
    let cell = c.trim();
    // Strip bold/italic markdown formatting for clean tabular display
    cell = cell.replace(/\*\*(.*?)\*\*/g, '$1');
    cell = cell.replace(/\*(.*?)\*/g, '$1');
    cell = cell.replace(/__(.*?)__/g, '$1');
    cell = cell.replace(/_(.*?)_/g, '$1');
    cell = cell.replace(/`(.*?)`/g, '$1');
    cell = formatMathAndSuperscripts(cell);
    return sanitizePdfText(cell);
  });
}

/**
 * Renders a full markdown table with headers, zebra striping, borders, and auto-pagination
 */
export function renderPdfTable(
  doc: jsPDF,
  tableLines: string[],
  startY: number,
  options?: PdfTableOptions
): number {
  const {
    margin = 20,
    contentWidth = 170,
    pageHeight = 297,
    headerBg = [79, 70, 229], // Indigo 600
    headerText = [255, 255, 255],
    evenRowBg = [255, 255, 255],
    oddRowBg = [248, 250, 252], // Slate 50
    borderColor = [226, 232, 240], // Slate 200
    textColor = [31, 41, 55],
    fontSize = 8,
    onPageBreak
  } = options || {};

  let currentY = startY;

  // 1. Extract rows and ignore separator line
  const rawRows: string[][] = [];
  for (const line of tableLines) {
    if (isTableSeparator(line)) continue;
    const cells = parseRowCells(line);
    if (cells.length > 0 && cells.some(c => c.length > 0)) {
      rawRows.push(cells);
    }
  }

  if (rawRows.length === 0) return currentY;

  const header = rawRows[0];
  const dataRows = rawRows.slice(1);
  const colCount = Math.max(header.length, ...dataRows.map(r => r.length), 1);

  // Pad any short rows with empty strings
  for (const row of rawRows) {
    while (row.length < colCount) {
      row.push('');
    }
  }

  // 2. Compute dynamic column widths based on maximum content length
  const colWeights = new Array(colCount).fill(1);
  for (let c = 0; c < colCount; c++) {
    let maxLen = (header[c] || '').length;
    for (const row of dataRows) {
      const len = (row[c] || '').length;
      if (len > maxLen) maxLen = len;
    }
    // Bound weights between 12 and 60 for balanced proportions
    colWeights[c] = Math.max(12, Math.min(60, maxLen));
  }

  const totalWeight = colWeights.reduce((a, b) => a + b, 0);
  const colWidths = colWeights.map(w => Math.floor((w / totalWeight) * contentWidth));
  // Reconcile rounding difference to last column
  const sumW = colWidths.reduce((a, b) => a + b, 0);
  colWidths[colWidths.length - 1] += (contentWidth - sumW);

  // Helper to draw table header
  const drawHeader = () => {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fontSize + 0.5);

    let maxHeaderLines = 1;
    const wrappedHeaders: string[][] = [];

    for (let c = 0; c < colCount; c++) {
      const text = header[c] || '';
      const w = Math.max(10, colWidths[c] - 4);
      const lines = doc.splitTextToSize(text, w);
      wrappedHeaders.push(lines);
      if (lines.length > maxHeaderLines) maxHeaderLines = lines.length;
    }

    const hHeight = Math.max(7.5, maxHeaderLines * 4 + 3.5);

    // Draw header fill
    doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
    doc.rect(margin, currentY, contentWidth, hHeight, 'F');

    // Draw header text
    doc.setTextColor(headerText[0], headerText[1], headerText[2]);
    let colX = margin;
    for (let c = 0; c < colCount; c++) {
      const lines = wrappedHeaders[c];
      let textY = currentY + 4;
      for (const line of lines) {
        doc.text(line, colX + 2.5, textY);
        textY += 3.8;
      }
      colX += colWidths[c];
    }

    currentY += hHeight;
  };

  // Check if header fits on current page
  if (currentY + 18 > pageHeight - 20) {
    if (onPageBreak) onPageBreak();
    currentY = 25;
  }

  // Draw Header
  drawHeader();

  // 3. Draw Data Rows
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(fontSize);

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const wrappedCells: string[][] = [];
    let maxCellLines = 1;

    for (let c = 0; c < colCount; c++) {
      const cellText = row[c] || '';
      const w = Math.max(10, colWidths[c] - 4);
      const lines = doc.splitTextToSize(cellText, w);
      wrappedCells.push(lines);
      if (lines.length > maxCellLines) maxCellLines = lines.length;
    }

    const rowHeight = Math.max(6.5, maxCellLines * 3.6 + 3);

    // Check page overflow
    if (currentY + rowHeight > pageHeight - 20) {
      if (onPageBreak) onPageBreak();
      currentY = 25;
      // Re-draw header on next page for readability
      drawHeader();
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(fontSize);
    }

    // Zebra background
    const isOdd = r % 2 === 1;
    const bg = isOdd ? oddRowBg : evenRowBg;
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.rect(margin, currentY, contentWidth, rowHeight, 'F');

    // Horizontal bottom border
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.15);
    doc.line(margin, currentY + rowHeight, margin + contentWidth, currentY + rowHeight);

    // Vertical column divider
    let colDividerX = margin;
    for (let c = 0; c < colCount - 1; c++) {
      colDividerX += colWidths[c];
      doc.line(colDividerX, currentY, colDividerX, currentY + rowHeight);
    }

    // Cell text
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    let colX = margin;
    for (let c = 0; c < colCount; c++) {
      const lines = wrappedCells[c];
      let textY = currentY + 3.8;
      for (const line of lines) {
        doc.text(line, colX + 2.5, textY);
        textY += 3.5;
      }
      colX += colWidths[c];
    }

    currentY += rowHeight;
  }

  // Draw overall table outer boundary
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.3);
  doc.rect(margin, startY, contentWidth, currentY - startY);

  currentY += 5; // Spacing after table
  return currentY;
}

/**
 * Renders a monospace code, flowchart, or ASCII diagram block inside an elegant visual container
 */
export function renderPdfDiagramBlock(
  doc: jsPDF,
  rawLines: string[],
  startY: number,
  options?: PdfDiagramOptions
): number {
  const {
    margin = 20,
    contentWidth = 170,
    pageHeight = 297,
    accentColor = [14, 165, 233], // Sky 500
    bgColor = [248, 250, 252], // Slate 50
    borderColor = [203, 213, 225], // Slate 300
    textColor = [30, 41, 59], // Slate 800
    fontSize = 8,
    onPageBreak
  } = options || {};

  let currentY = startY;

  // Filter out boundary backtick indicators if present
  const lines: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) continue;
    // Format superscripts in diagram labels without collapsing whitespace
    lines.push(formatMathAndSuperscripts(line));
  }

  if (lines.length === 0) return currentY;

  // Page check for diagram header + at least 3 lines
  const estimatedH = lines.length * 4.2 + 9;
  if (currentY + Math.min(25, estimatedH) > pageHeight - 20) {
    if (onPageBreak) onPageBreak();
    currentY = 25;
  }

  // Calculate box height with page overflow handling
  const maxLineW = contentWidth - 8;
  const wrappedLines: string[] = [];
  doc.setFont('Courier', 'normal');
  doc.setFontSize(fontSize);

  for (const l of lines) {
    if (l.trim() === '') {
      wrappedLines.push('');
      continue;
    }
    const splits = doc.splitTextToSize(l, maxLineW);
    for (const s of splits) {
      wrappedLines.push(s);
    }
  }

  const boxHeight = wrappedLines.length * 4.2 + 8;

  // If diagram fits on current page
  if (currentY + boxHeight <= pageHeight - 20) {
    // Background card
    doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
    doc.roundedRect(margin, currentY, contentWidth, boxHeight, 2, 2, 'F');

    // Border
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, currentY, contentWidth, boxHeight, 2, 2, 'S');

    // Left Accent Strip
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.rect(margin, currentY, 2.2, boxHeight, 'F');

    // Header label
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.text('VISUAL SCHEMATIC / DIAGRAM', margin + 6, currentY + 4.5);

    // Monospace Diagram Lines
    doc.setFont('Courier', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    let textY = currentY + 8.5;
    for (const wLine of wrappedLines) {
      doc.text(wLine, margin + 6, textY);
      textY += 4.2;
    }

    currentY += boxHeight + 4;
  } else {
    // If diagram is multi-page, draw lines with continuous background
    doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.25);
    doc.setFont('Courier', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    for (const wLine of wrappedLines) {
      if (currentY + 6 > pageHeight - 20) {
        if (onPageBreak) onPageBreak();
        currentY = 25;
      }
      // Line background strip
      doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      doc.rect(margin, currentY - 3, contentWidth, 5, 'F');
      doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.rect(margin, currentY - 3, 1.8, 5, 'F');

      doc.text(wLine, margin + 6, currentY);
      currentY += 4.5;
    }
    currentY += 4;
  }

  return currentY;
}
