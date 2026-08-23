import { jsPDF } from 'jspdf';
import { savePDFMobile } from './mobileSaver';
import { savePdfToHistory } from './pdfHistory';
import { addStudyXP, trackQuestProgress } from './gamification';
import { triggerVibration } from './vibrate';

export interface FormulaItem {
  name: string;
  latex?: string;
  insertText?: string;
}

export interface FormulaCategoryItem {
  name: string;
  subtitle: string;
  icon: string;
  formulas: FormulaItem[];
}

/**
 * Converts common LaTeX strings to readable typography for clean PDF rendering
 */
function cleanLatexForPdf(latex: string): string {
  if (!latex) return '';
  return latex
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\pm/g, '±')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\int/g, '∫')
    .replace(/\\sum/g, '∑')
    .replace(/\\lim_\{([^}]+)\}/g, 'lim($1)')
    .replace(/\\to/g, '→')
    .replace(/\\infty/g, '∞')
    .replace(/\\theta/g, 'θ')
    .replace(/\\pi/g, 'π')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\binom\{([^}]+)\}\{([^}]+)\}/g, 'C($1, $2)')
    .replace(/\\left|\\right/g, '')
    .replace(/\\/g, '')
    .replace(/\{|\}/g, '')
    .trim();
}

/**
 * Generates and downloads a high-quality printable Formula Cheat Sheet PDF
 */
export async function exportFormulaSheetPDF(
  categories: FormulaCategoryItem[],
  selectedCategoryName?: string | null
): Promise<boolean> {
  triggerVibration(20);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 16;
  const contentWidth = pageWidth - (margin * 2); // 178mm

  const filteredCategories = selectedCategoryName
    ? categories.filter(c => c.name === selectedCategoryName)
    : categories;

  const titleText = selectedCategoryName 
    ? `${selectedCategoryName} — Formula Sheet`
    : 'HelpYou AI — Master Formula Sheet';

  let currentY = 20;

  const drawPageHeader = (pageNumber: number) => {
    // Top decorative bar
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.rect(margin, 12, contentWidth, 2.5, 'F');

    // Header branding
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('HELPYOU AI • SMART FORMULA COMPENDIUM', margin, 10);
    doc.text(`Page ${pageNumber}`, pageWidth - margin, 10, { align: 'right' });
  };

  const drawPageFooter = (pageNumber: number) => {
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setDrawColor(225, 225, 230);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    
    doc.text('Generated with HelpYou AI — AI Homework Helper & Scientific Calculator', margin, pageHeight - 7);
    doc.text(`support@helpyou.ai`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  };

  let pageIndex = 1;
  drawPageHeader(pageIndex);

  // Title Block
  currentY = 22;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(24, 24, 27);
  doc.text(titleText, margin, currentY);
  currentY += 6;

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(113, 113, 122);
  doc.text('Standardized Tier-1 Curriculum (US AP/SAT • UK A-Level • IB • Global STEM)', margin, currentY);
  currentY += 10;

  for (const category of filteredCategories) {
    // Check if category header fits
    if (currentY + 25 > pageHeight - 20) {
      drawPageFooter(pageIndex);
      doc.addPage();
      pageIndex++;
      drawPageHeader(pageIndex);
      currentY = 22;
    }

    // Category Header Box
    doc.setFillColor(244, 244, 248);
    doc.roundedRect(margin, currentY, contentWidth, 9, 2, 2, 'F');
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(67, 56, 202); // Dark Indigo
    doc.text(`${category.name}`, margin + 4, currentY + 6);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 150);
    doc.text(category.subtitle, pageWidth - margin - 4, currentY + 6, { align: 'right' });

    currentY += 13;

    // Formulas Grid
    for (const formula of category.formulas) {
      const cleanFormula = cleanLatexForPdf(formula.latex || formula.insertText || '');
      
      // Calculate height needed
      const nameLines = doc.splitTextToSize(formula.name, contentWidth - 10);
      const mathLines = doc.splitTextToSize(cleanFormula, contentWidth - 10);
      const boxHeight = Math.max(16, (nameLines.length * 4.5) + (mathLines.length * 5) + 6);

      if (currentY + boxHeight > pageHeight - 20) {
        drawPageFooter(pageIndex);
        doc.addPage();
        pageIndex++;
        drawPageHeader(pageIndex);
        currentY = 22;
      }

      // Formula Card Box
      doc.setDrawColor(228, 228, 231);
      doc.setLineWidth(0.3);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, currentY, contentWidth, boxHeight, 2, 2, 'FD');

      // Left Accent Strip
      doc.setFillColor(99, 102, 241);
      doc.roundedRect(margin, currentY, 1.5, boxHeight, 1, 1, 'F');

      // Formula Name
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(39, 39, 42);
      let textY = currentY + 5;
      for (const line of nameLines) {
        doc.text(line, margin + 4, textY);
        textY += 4.5;
      }

      // Formula Equation (Distinct Courier font for mathematical clarity)
      doc.setFont('Courier', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(79, 70, 229);
      for (const line of mathLines) {
        doc.text(line, margin + 4, textY + 1);
        textY += 5;
      }

      currentY += boxHeight + 3.5;
    }

    currentY += 4;
  }

  drawPageFooter(pageIndex);

  // Generate PDF Output
  const pdfBlob = doc.output('blob');
  const filename = selectedCategoryName 
    ? `${selectedCategoryName.replace(/[^a-zA-Z0-9]/g, '_')}_Formula_Sheet.pdf`
    : 'HelpYou_AI_Master_Formula_Sheet.pdf';

  const saved = await savePDFMobile(pdfBlob, filename);

  if (saved) {
    savePdfToHistory({
      title: filename,
      fileUri: URL.createObjectURL(pdfBlob),
      featureTag: 'Formula Sheet',
      fileSize: `${(pdfBlob.size / 1024).toFixed(1)} KB`,
      pageCount: pageIndex
    });
    addStudyXP(40, 'Exported Formula Sheet PDF');
    trackQuestProgress('calculator', 1);
  }

  return saved;
}
