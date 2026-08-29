import { jsPDF } from 'jspdf';
import { savePDFMobile } from '../utils/mobileSaver';
import { sanitizePdfText } from '../utils/pdfSanitizer';

/**
 * Generates the jsPDF document instance and returns it as a Blob.
 */
export function generateNotesPDFBlob(title: string, markdownContent: string, actionType: string): Blob {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // A4 width: 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // A4 height: 297mm
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2); // 170mm

  let currentY = 25;

  // Add standard header/footer layout on each page
  const addFooter = (pageNum: number) => {
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    
    // Subtle horizontal divider above the footer
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    
    // Page indicators
    doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text('HelpYou AI - Super Note-Maker', pageWidth - margin, pageHeight - 10, { align: 'right' });
  };

  // Header Decorative Colored Bar
  doc.setFillColor(124, 58, 237); // Purple Accent
  doc.rect(margin, currentY, contentWidth, 3, 'F');
  currentY += 10;

  // Main Document Title (cleaned from extension and emojis)
  const cleanTitle = sanitizePdfText(title.replace(/\.[^/.]+$/, ""));
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  
  // Wrap title if it's too long
  const wrappedTitle: string[] = doc.splitTextToSize(cleanTitle, contentWidth);
  for (const line of wrappedTitle) {
    doc.text(line, margin, currentY);
    currentY += 10;
  }
  
  currentY += 2;

  // Meta-information line
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  doc.text(`Category: Note (${actionType.toUpperCase()})  |  Generated on: ${dateStr}`, margin, currentY);
  currentY += 8;

  // Subtle separator line
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 12;

  // Process and parse markdown lines
  const sanitizedMarkdown = sanitizePdfText(markdownContent);
  const rawLines = sanitizedMarkdown.split('\n');
  let pageCount = 1;

  addFooter(pageCount);

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i].trim();
    if (rawLine === '') {
      currentY += 4; // Spacing between paragraphs
      continue;
    }

    // Default styles for body text
    let fontSize = 10.5;
    let fontStyle = 'normal';
    let textColor = [55, 65, 81]; // Gray 700
    let cleanLine = rawLine;
    let indent = 0;

    // Detect markdown headings and lists to map them to appropriate styles
    if (rawLine.startsWith('# ')) {
      fontSize = 17;
      fontStyle = 'bold';
      textColor = [124, 58, 237]; // Purple
      cleanLine = rawLine.substring(2);
      currentY += 4;
    } else if (rawLine.startsWith('## ')) {
      fontSize = 14;
      fontStyle = 'bold';
      textColor = [79, 70, 229]; // Indigo
      cleanLine = rawLine.substring(3);
      currentY += 3;
    } else if (rawLine.startsWith('### ')) {
      fontSize = 12;
      fontStyle = 'bold';
      textColor = [31, 41, 55]; // Dark Gray
      cleanLine = rawLine.substring(4);
      currentY += 2;
    } else if (rawLine.startsWith('- ') || rawLine.startsWith('* ') || rawLine.startsWith('• ')) {
      fontSize = 10.5;
      fontStyle = 'normal';
      cleanLine = '• ' + rawLine.replace(/^[-*•]\s*/, '');
      indent = 6;
    } else if (/^\d+\.\s/.test(rawLine)) {
      fontSize = 10.5;
      fontStyle = 'normal';
      cleanLine = rawLine;
      indent = 6;
    }

    // Strip out typical markdown bold, italic, code-block syntax elements for a clean printed document
    cleanLine = cleanLine.replace(/\*\*(.*?)\*\*/g, '$1');
    cleanLine = cleanLine.replace(/\*(.*?)\*/g, '$1');
    cleanLine = cleanLine.replace(/__(.*?)__/g, '$1');
    cleanLine = cleanLine.replace(/_(.*?)_/g, '$1');
    cleanLine = cleanLine.replace(/`(.*?)`/g, '$1');
    cleanLine = sanitizePdfText(cleanLine);

    // Setup typography context in jsPDF
    doc.setFont('Helvetica', fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    const maxLineW = contentWidth - indent;
    const wrappedLines: string[] = doc.splitTextToSize(cleanLine, maxLineW);

    for (const line of wrappedLines) {
      // Manage page break boundaries (leaving a comfortable margin at the bottom)
      if (currentY > pageHeight - 22) {
        doc.addPage();
        pageCount++;
        addFooter(pageCount);
        currentY = 25; // Reset coordinate to top
        
        // Restore typography context for continuation of current line block
        doc.setFont('Helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      }

      doc.text(line, margin + indent, currentY);
      currentY += (fontSize * 0.45) + 2.5; // Dynamically computed line height
    }
  }

  return doc.output('blob');
}

/**
 * Exports generated study notes to a beautiful, professionally structured PDF document.
 * Handles text wrapping, clean typography styling, page headers/footers, and page overflow seamlessly.
 */
export function exportNotesToPDF(title: string, markdownContent: string, actionType: string) {
  const cleanTitle = title.replace(/\.[^/.]+$/, "");
  const safeFilename = cleanTitle.toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'study_notes';
  const fullFilename = `${safeFilename}_notes.pdf`;
  const blob = generateNotesPDFBlob(title, markdownContent, actionType);

  savePDFMobile(blob, fullFilename);
}
