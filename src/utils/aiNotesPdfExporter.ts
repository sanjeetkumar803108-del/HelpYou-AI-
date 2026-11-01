import { jsPDF } from 'jspdf';
import { sanitizePdfText } from './pdfSanitizer';

export interface ConceptBranch {
  title: string;
  subtitle: string;
  bullets: string[];
}

export interface ConceptMap {
  rootTitle: string;
  rootDesc: string;
  branches: ConceptBranch[];
}

export interface MemoryTrick {
  title: string;
  analogyStory: string;
  keyTakeaway: string;
}

export interface FormulaBox {
  name: string;
  formula: string;
  variables: string[];
}

export interface ComparisonTable {
  headers: string[];
  rows: string[][];
}

export interface ExamTipBox {
  title: string;
  content: string;
}

export interface NotePage {
  pageNumber: number;
  pageTitle: string;
  subtitle: string;
  points: string[];
  formulaBox?: FormulaBox;
  comparisonTable?: ComparisonTable;
  examTipBox?: ExamTipBox;
}

export interface CrucialExamTrap {
  title: string;
  misconception: string;
  correctTruth: string;
  rule: string;
}

export interface SolvedCaseStudy {
  title: string;
  problemScenario: string;
  steps: string[];
  finalResult: string;
}

export interface AINotesData {
  metadata: {
    title: string;
    subject: string;
    chapter: string;
    exam: string;
    syllabusAuthority?: string;
    totalPages?: number;
  };
  conceptMap?: ConceptMap;
  memoryTrick?: MemoryTrick;
  pages: NotePage[];
  crucialExamTrap?: CrucialExamTrap;
  solvedCaseStudy?: SolvedCaseStudy;
}

/**
 * Universal Toppers Handwritten Notes PDF Generator
 * Creates an authentic, publication-grade multi-page PDF formatted like real notebook paper
 */
export function generateAINotesPDFBlob(notesData: AINotesData): Blob {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2); // 180mm
  const bottomLimit = pageHeight - 20;

  const metadata = notesData.metadata || {
    title: 'Study Notes',
    subject: 'General Science',
    chapter: 'Core Chapter',
    exam: 'Official Examination'
  };

  const checkPageBreak = (currentY: number, neededHeight: number): number => {
    if (currentY + neededHeight > bottomLimit) {
      doc.addPage();
      return 25;
    }
    return currentY;
  };

  // ==========================================
  // PAGE 1: CHAPTER OVERVIEW & CONCEPT MAP
  // ==========================================
  let currentY = 25;

  // Chapter Main Title
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(190, 24, 93); // Rose-700
  const titleLines = doc.splitTextToSize(sanitizePdfText(metadata.chapter || metadata.title), contentWidth);
  doc.text(titleLines, margin, currentY);
  currentY += titleLines.length * 7.5;

  // Sub-header details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99); // Zinc-600
  const metaText = `Subject: ${metadata.subject}   |   Exam: ${metadata.exam}`;
  doc.text(sanitizePdfText(metaText), margin, currentY);
  currentY += 8;

  // Horizontal divider
  doc.setDrawColor(244, 114, 182); // Rose-400
  doc.setLineWidth(0.8);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 6;

  // CONCEPT MAP FLOWCHART BOX
  if (notesData.conceptMap) {
    const cm = notesData.conceptMap;
    doc.setFillColor(245, 243, 255); // Violet-50
    doc.setDrawColor(196, 181, 253); // Violet-300
    doc.setLineWidth(0.4);

    const boxStartY = currentY;
    let innerY = currentY + 6;

    // Root Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(109, 40, 217); // Purple-700
    doc.text(`[CONCEPT MAP FLOWCHART] ${sanitizePdfText(cm.rootTitle || metadata.chapter)}`, margin + 4, innerY);
    innerY += 5;

    // Root Desc
    if (cm.rootDesc) {
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      const descLines = doc.splitTextToSize(sanitizePdfText(cm.rootDesc), contentWidth - 10);
      doc.text(descLines, margin + 4, innerY);
      innerY += descLines.length * 4.2 + 2;
    }

    // Branches
    if (Array.isArray(cm.branches) && cm.branches.length > 0) {
      cm.branches.forEach((branch, bIdx) => {
        innerY = checkPageBreak(innerY, 15);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(76, 29, 149);
        doc.text(`* ${sanitizePdfText(branch.title)}`, margin + 6, innerY);
        innerY += 4.5;

        if (Array.isArray(branch.bullets)) {
          branch.bullets.forEach((bText) => {
            innerY = checkPageBreak(innerY, 8);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(55, 65, 81);
            const bLines = doc.splitTextToSize(`- ${sanitizePdfText(bText)}`, contentWidth - 16);
            doc.text(bLines, margin + 10, innerY);
            innerY += bLines.length * 3.8;
          });
        }
        innerY += 1.5;
      });
    }

    const boxHeight = innerY - boxStartY + 4;
    doc.roundedRect(margin, boxStartY, contentWidth, boxHeight, 3, 3, 'S');
    currentY = innerY + 8;
  }

  // MEMORY TRICK & ANALOGY BOX
  if (notesData.memoryTrick) {
    currentY = checkPageBreak(currentY, 35);
    const mt = notesData.memoryTrick;
    const boxStartY = currentY;
    let innerY = currentY + 6;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(180, 83, 9); // Amber-700
    doc.text(`[MEMORY TRICK & REAL-WORLD ANALOGY] ${sanitizePdfText(mt.title || '')}`, margin + 4, innerY);
    innerY += 5.5;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(69, 26, 3);
    const storyLines = doc.splitTextToSize(`"${sanitizePdfText(mt.analogyStory || '')}"`, contentWidth - 10);
    doc.text(storyLines, margin + 4, innerY);
    innerY += storyLines.length * 4.2 + 3;

    if (mt.keyTakeaway) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(146, 64, 14);
      const takeawayLines = doc.splitTextToSize(`Key Takeaway: ${sanitizePdfText(mt.keyTakeaway)}`, contentWidth - 10);
      doc.text(takeawayLines, margin + 4, innerY);
      innerY += takeawayLines.length * 4.2;
    }

    const boxHeight = innerY - boxStartY + 4;
    doc.setFillColor(254, 243, 199); // Amber-100
    doc.setDrawColor(245, 158, 11); // Amber-500
    doc.roundedRect(margin, boxStartY, contentWidth, boxHeight, 2.5, 2.5, 'FD');
    currentY = innerY + 8;
  }

  // CRUCIAL EXAM TRAP BOX
  if (notesData.crucialExamTrap) {
    currentY = checkPageBreak(currentY, 35);
    const trap = notesData.crucialExamTrap;
    const boxStartY = currentY;
    let innerY = currentY + 6;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(190, 24, 93); // Rose-700
    doc.text(`[CRUCIAL EXAM TRAP] ${sanitizePdfText(trap.title || '')}`, margin + 4, innerY);
    innerY += 5.5;

    if (trap.misconception) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(185, 28, 28);
      const miscLines = doc.splitTextToSize(`Common Error: ${sanitizePdfText(trap.misconception)}`, contentWidth - 10);
      doc.text(miscLines, margin + 4, innerY);
      innerY += miscLines.length * 4 + 2;
    }

    if (trap.correctTruth) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(4, 120, 87);
      const truthLines = doc.splitTextToSize(`Correct Truth: ${sanitizePdfText(trap.correctTruth)}`, contentWidth - 10);
      doc.text(truthLines, margin + 4, innerY);
      innerY += truthLines.length * 4 + 2;
    }

    if (trap.rule) {
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(55, 65, 81);
      const ruleLines = doc.splitTextToSize(`Golden Rule: ${sanitizePdfText(trap.rule)}`, contentWidth - 10);
      doc.text(ruleLines, margin + 4, innerY);
      innerY += ruleLines.length * 4;
    }

    const boxHeight = innerY - boxStartY + 4;
    doc.setFillColor(255, 241, 242); // Rose-50
    doc.setDrawColor(244, 63, 94); // Rose-500
    doc.roundedRect(margin, boxStartY, contentWidth, boxHeight, 2.5, 2.5, 'FD');
    currentY = innerY + 8;
  }

  // ==========================================
  // SUBSEQUENT NOTEBOOK PAGES (RULED PAGES)
  // ==========================================
  if (Array.isArray(notesData.pages) && notesData.pages.length > 0) {
    notesData.pages.forEach((pg) => {
      doc.addPage();
      currentY = 25;

      // Pink left notebook margin line
      doc.setDrawColor(244, 114, 182); // Rose-400
      doc.setLineWidth(0.7);
      doc.line(margin + 4, 18, margin + 4, pageHeight - 16);

      const textX = margin + 8;
      const textWidth = contentWidth - 8;

      // Page Topic Header
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(190, 24, 93);
      const pageTitle = `Page ${pg.pageNumber}: ${sanitizePdfText(pg.pageTitle)}`;
      doc.text(pageTitle, textX, currentY);
      currentY += 6;

      if (pg.subtitle) {
        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        const subLines = doc.splitTextToSize(sanitizePdfText(pg.subtitle), textWidth);
        doc.text(subLines, textX, currentY);
        currentY += subLines.length * 4 + 3;
      }

      // Divider below topic title
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.3);
      doc.line(textX, currentY, pageWidth - margin, currentY);
      currentY += 5;

      // Bullet Points
      if (Array.isArray(pg.points) && pg.points.length > 0) {
        pg.points.forEach((pt) => {
          currentY = checkPageBreak(currentY, 12);
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(31, 41, 55);

          // Draw bullet
          doc.setTextColor(244, 63, 94);
          doc.text('*', textX, currentY);

          // Draw text
          doc.setTextColor(31, 41, 55);
          const ptLines = doc.splitTextToSize(sanitizePdfText(pt), textWidth - 5);
          doc.text(ptLines, textX + 4, currentY);
          currentY += ptLines.length * 4.6 + 2;
        });
      }

      // FORMULA BOX
      if (pg.formulaBox && pg.formulaBox.formula) {
        currentY = checkPageBreak(currentY, 26);
        const fb = pg.formulaBox;
        const boxStartY = currentY;
        let innerY = currentY + 5;

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(109, 40, 217);
        doc.text(`[FORMULA] ${sanitizePdfText(fb.name || '')}`, textX + 4, innerY);
        innerY += 5;

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(76, 29, 149);
        doc.text(sanitizePdfText(fb.formula), textX + 6, innerY);
        innerY += 5;

        if (Array.isArray(fb.variables) && fb.variables.length > 0) {
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          const varText = `Where: ${fb.variables.join(' | ')}`;
          const varLines = doc.splitTextToSize(sanitizePdfText(varText), textWidth - 10);
          doc.text(varLines, textX + 6, innerY);
          innerY += varLines.length * 3.8;
        }

        const boxH = innerY - boxStartY + 3;
        doc.setFillColor(245, 243, 255);
        doc.setDrawColor(196, 181, 253);
        doc.roundedRect(textX, boxStartY, textWidth, boxH, 2, 2, 'FD');
        currentY = innerY + 6;
      }

      // COMPARISON TABLE
      if (pg.comparisonTable && Array.isArray(pg.comparisonTable.headers) && Array.isArray(pg.comparisonTable.rows)) {
        const ct = pg.comparisonTable;
        currentY = checkPageBreak(currentY, 25 + (ct.rows.length * 8));

        const colCount = ct.headers.length || 2;
        const colW = (textWidth - 4) / colCount;

        // Table Header
        doc.setFillColor(243, 244, 246);
        doc.setDrawColor(209, 213, 219);
        doc.rect(textX, currentY, textWidth, 7, 'FD');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(31, 41, 55);
        ct.headers.forEach((h, hIdx) => {
          doc.text(sanitizePdfText(h), textX + (hIdx * colW) + 2, currentY + 5);
        });
        currentY += 7;

        // Table Rows
        ct.rows.forEach((row, rIdx) => {
          currentY = checkPageBreak(currentY, 8);
          if (rIdx % 2 === 1) {
            doc.setFillColor(249, 250, 251);
            doc.rect(textX, currentY, textWidth, 7, 'F');
          }
          doc.setDrawColor(229, 231, 235);
          doc.line(textX, currentY + 7, textX + textWidth, currentY + 7);

          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(55, 65, 81);
          row.forEach((cell, cIdx) => {
            const cellLines = doc.splitTextToSize(sanitizePdfText(cell), colW - 3);
            doc.text(cellLines[0] || '', textX + (cIdx * colW) + 2, currentY + 5);
          });
          currentY += 7;
        });
        currentY += 4;
      }

      // EXAM TIP BOX
      if (pg.examTipBox && pg.examTipBox.content) {
        currentY = checkPageBreak(currentY, 20);
        const et = pg.examTipBox;
        const boxStartY = currentY;
        let innerY = currentY + 5;

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(180, 83, 9);
        doc.text(`[EXAM TIP] ${sanitizePdfText(et.title || 'Pro Tip')}`, textX + 4, innerY);
        innerY += 4.5;

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(69, 26, 3);
        const tipLines = doc.splitTextToSize(sanitizePdfText(et.content), textWidth - 10);
        doc.text(tipLines, textX + 4, innerY);
        innerY += tipLines.length * 3.8;

        const boxH = innerY - boxStartY + 3;
        doc.setFillColor(254, 249, 195);
        doc.setDrawColor(234, 179, 8);
        doc.roundedRect(textX, boxStartY, textWidth, boxH, 2, 2, 'FD');
        currentY = innerY + 6;
      }
    });
  }

  // ==========================================
  // FINAL SECTION: SOLVED CASE STUDY
  // ==========================================
  if (notesData.solvedCaseStudy) {
    currentY = checkPageBreak(currentY, 50);
    const cs = notesData.solvedCaseStudy;
    const boxStartY = currentY;
    let innerY = currentY + 6;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(6, 95, 70); // Emerald-800
    doc.text(`[PRACTICAL EXAM CASE STUDY] ${sanitizePdfText(cs.title || '')}`, margin + 4, innerY);
    innerY += 6;

    if (cs.problemScenario) {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(55, 65, 81);
      const scLines = doc.splitTextToSize(`Problem: ${sanitizePdfText(cs.problemScenario)}`, contentWidth - 10);
      doc.text(scLines, margin + 4, innerY);
      innerY += scLines.length * 4.2 + 2;
    }

    if (Array.isArray(cs.steps) && cs.steps.length > 0) {
      cs.steps.forEach((st) => {
        innerY = checkPageBreak(innerY, 8);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(31, 41, 55);
        const stLines = doc.splitTextToSize(`> ${sanitizePdfText(st)}`, contentWidth - 12);
        doc.text(stLines, margin + 6, innerY);
        innerY += stLines.length * 3.8;
      });
      innerY += 2;
    }

    if (cs.finalResult) {
      innerY = checkPageBreak(innerY, 10);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(4, 120, 87);
      const resLines = doc.splitTextToSize(`Final Answer: ${sanitizePdfText(cs.finalResult)}`, contentWidth - 10);
      doc.text(resLines, margin + 4, innerY);
      innerY += resLines.length * 4.2;
    }

    const boxH = innerY - boxStartY + 4;
    doc.setFillColor(236, 253, 245); // Emerald-50
    doc.setDrawColor(16, 185, 129); // Emerald-500
    doc.roundedRect(margin, boxStartY, contentWidth, boxH, 2.5, 2.5, 'FD');
    currentY = innerY + 8;
  }

  // ==========================================
  // RUNNING HEADERS & FOOTERS ACROSS ALL PAGES
  // ==========================================
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Header divider line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(margin, 15, pageWidth - margin, 15);

    // Top header text
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text('HelpYou AI * Toppers Ruled Notebook', margin, 12);
    doc.setFont('Helvetica', 'normal');
    doc.text(sanitizePdfText(metadata.chapter || metadata.title), pageWidth - margin, 12, { align: 'right' });

    // Footer divider line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    // Bottom footer text
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text('Official Syllabus Calibrated * Zero Fluff', margin, pageHeight - 8);
    doc.setFont('Helvetica', 'bold');
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    doc.text('HelpYou AI', pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  return doc.output('blob');
}

