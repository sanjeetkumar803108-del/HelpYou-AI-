/**
 * Exam Essay Calibration Engine
 * Dynamically calibrates essay tones, academic formats, and structural rubrics
 * to match the student's authentic examination system (CBSE, IB DP, AP, A-Levels,
 * Colloquium Doctum / VWO, IELTS / TOEFL, SAT / ACT, UPSC, and custom boards).
 */

export interface ExamOption {
  id: string;
  label: string;
  desc: string;
}

export interface ExamEssayConfig {
  examName: string;
  badgeLabel: string;
  defaultTone: string;
  defaultFormat: string;
  tones: ExamOption[];
  formats: ExamOption[];
}

export function getExamEssayCalibration(
  targetExam?: string,
  country?: string,
  gradeLevel?: string
): ExamEssayConfig {
  const exam = (targetExam || '').trim().toLowerCase();
  const c = (country || '').trim().toLowerCase();
  const g = (gradeLevel || '').trim().toLowerCase();

  // 1. IB Diploma Programme (IB DP / TOK / Extended Essay)
  if (
    exam.includes('ib') || 
    exam.includes('international baccalaureate') || 
    exam.includes('tok') || 
    exam.includes('extended essay')
  ) {
    return {
      examName: targetExam || 'IB DP',
      badgeLabel: '🎯 Calibrated for IB Diploma Programme',
      defaultTone: 'IB Evaluative & Analytical',
      defaultFormat: 'Extended Essay (EE) Structure',
      tones: [
        { id: 'ib_evaluative', label: 'IB Evaluative & Analytical', desc: 'Criterion-based critical reasoning without personal bias' },
        { id: 'tok_reflective', label: 'TOK Critical Reflection', desc: 'Knowledge claims, counter-claims & real-world situations' },
        { id: 'comparative_literary', label: 'Comparative Literary', desc: 'Contrasts authorial choices, tone, and conventions' },
        { id: 'scholarly_academic', label: 'Scholarly Academic', desc: 'Rigorous academic vocabulary with global perspective' },
      ],
      formats: [
        { id: 'ee_structure', label: 'Extended Essay (EE) Structure', desc: 'Intro, Research Question, Substantive Body, Evaluation, Conclusion' },
        { id: 'tok_essay', label: 'TOK Essay Format', desc: 'Intro to RLS, Knowledge Framework, Analysis of Perspectives, Conclusion' },
        { id: 'paper2_comparative', label: 'Paper 2 Comparative Essay', desc: 'Side-by-side thematic & structural literary analysis' },
        { id: 'mla_academic', label: 'MLA / Chicago Citations', desc: 'Scholarly referencing with parenthetical in-text citations' },
      ],
    };
  }

  // 2. AP (Advanced Placement - College Board)
  if (
    exam.includes('ap ') || 
    exam.startsWith('ap') || 
    exam.includes('advanced placement') || 
    exam.includes('apush') ||
    exam.includes('capstone')
  ) {
    return {
      examName: targetExam || 'Advanced Placement (AP)',
      badgeLabel: '🎯 Calibrated for College Board AP Rubric',
      defaultTone: 'AP Rhetorical Analysis',
      defaultFormat: 'AP Free-Response (FRQ) Structure',
      tones: [
        { id: 'ap_rhetorical', label: 'AP Rhetorical Analysis', desc: 'Analyzes author\'s purpose, rhetorical appeals (ethos/logos/pathos) & devices' },
        { id: 'ap_synthesis', label: 'Synthesis / Evidence-Based', desc: 'Synthesizes multiple authoritative sources into a cohesive line of reasoning' },
        { id: 'ap_argumentative', label: 'Defensible Argumentative', desc: 'Defensible thesis with nuanced line of reasoning and counter-claims' },
        { id: 'ap_literary', label: 'Literary & Thematic Analysis', desc: 'Analyzes complexity, symbolism, figurative devices, and central theme' },
      ],
      formats: [
        { id: 'ap_frq', label: 'AP Free-Response (FRQ) Structure', desc: 'Defensible Thesis, 3 Evidence & Commentary paragraphs, Synthesis' },
        { id: 'ap_synthesis_fmt', label: 'Synthesis Essay (with Cited Sources)', desc: 'Incorporates Cited Sources A, B, C into an original argument' },
        { id: 'ap_dbq', label: 'DBQ Document-Based Structure', desc: 'Historical Context, Thesis, Document Analysis (HIPP), Complexity point' },
        { id: 'ap_5para', label: 'Standard 5-Paragraph AP Model', desc: 'Classic structured introduction, 3 body arguments, conclusion' },
      ],
    };
  }

  // 3. CBSE / ICSE / State Boards (India)
  if (
    exam.includes('cbse') || 
    exam.includes('icse') || 
    exam.includes('isc') || 
    exam.includes('state board') || 
    exam.includes('hsc') || 
    exam.includes('sslc') ||
    exam.includes('board exam') ||
    c.includes('india')
  ) {
    const isICSE = exam.includes('icse') || exam.includes('isc');
    const boardName = isICSE ? 'ICSE / ISC' : 'CBSE Board';
    return {
      examName: targetExam || boardName,
      badgeLabel: `🎯 Calibrated for ${boardName} Exam Scoring`,
      defaultTone: 'Formal Expository',
      defaultFormat: `${boardName} Essay Structure`,
      tones: [
        { id: 'formal_expository', label: 'Formal Expository', desc: 'Objective, clear, high-scoring structured board presentation' },
        { id: 'analytical_balanced', label: 'Analytical & Balanced', desc: 'Examines merits, demerits, causes, effects, and constructive solutions' },
        { id: 'persuasive_speech', label: 'Persuasive / Opinion', desc: 'Article, debate, and speech style with compelling rhetoric' },
        { id: 'reflective_descriptive', label: 'Reflective & Descriptive', desc: 'Rich vocabulary and thoughtful personal or societal reflection' },
      ],
      formats: [
        { id: 'cbse_essay', label: `${boardName} Essay Structure`, desc: 'Introduction, Causes & Dimensions, Real-world Impacts, Concrete Solutions, Conclusion' },
        { id: 'article_speech', label: 'Article / Speech Format', desc: 'Catchy Heading, Byline, Opening Hook, 3-Paragraph Elaboration, Concluding Appeal' },
        { id: 'analytical_essay', label: 'Formal Analytical Essay', desc: 'Structured analysis with subheadings, facts, and balanced takeaways' },
        { id: 'standard_academic', label: 'Standard 5-Paragraph Format', desc: 'Universal academic intro, body arguments, and summary' },
      ],
    };
  }

  // 4. GCSE / A-Levels / Cambridge (CIE / Edexcel / OCR / UK)
  if (
    exam.includes('a-level') || 
    exam.includes('a level') || 
    exam.includes('gcse') || 
    exam.includes('igcse') || 
    exam.includes('cambridge') || 
    exam.includes('edexcel') || 
    exam.includes('ocr') ||
    c.includes('united kingdom') || 
    c.includes('uk')
  ) {
    return {
      examName: targetExam || 'A-Levels / Cambridge',
      badgeLabel: '🎯 Calibrated for Cambridge & A-Level Assessment',
      defaultTone: 'Critical & Evaluative (PEEL)',
      defaultFormat: 'A-Level Discursive Essay',
      tones: [
        { id: 'peel_critical', label: 'Critical & Evaluative (PEEL)', desc: 'Point, Evidence, Explanation, Link to overarching thesis' },
        { id: 'discursive_balanced', label: 'Discursive & Balanced', desc: 'Weighs contrasting scholarly perspectives before delivering a critical verdict' },
        { id: 'formal_scholarly_uk', label: 'Formal Scholarly (UK)', desc: 'Sophisticated British academic prose with precise academic terminology' },
        { id: 'literary_contextual', label: 'Literary & Contextual', desc: 'Examines language, structural craft, and contextual factors (AO1-AO4)' },
      ],
      formats: [
        { id: 'alevel_discursive', label: 'A-Level Discursive Essay', desc: 'Introduction & Scope, Thesis Arguments, Counter-Arguments, Critical Synthesis' },
        { id: 'peel_structure', label: 'PEEL Paragraph Essay Structure', desc: 'Standard UK examination paragraph architecture' },
        { id: 'harvard_referenced', label: 'Harvard Referencing Format', desc: 'Scholarly citations (Author, Year) and integrated references list' },
        { id: 'standard_uk', label: 'Standard Cambridge Structure', desc: 'Formal introduction, thematic body development, and evaluative summary' },
      ],
    };
  }

  // 5. Colloquium Doctum / Dutch VWO / European Pre-University
  if (
    exam.includes('colloquium doctum') || 
    exam.includes('vwo') || 
    exam.includes('havo') || 
    exam.includes('dutch') || 
    c.includes('netherlands') || 
    c.includes('holland')
  ) {
    return {
      examName: targetExam || 'Colloquium Doctum (VWO)',
      badgeLabel: '🎯 Calibrated for Colloquium Doctum & VWO Standards',
      defaultTone: 'VWO Academic Rigorous',
      defaultFormat: 'VWO Academic Essay Structure',
      tones: [
        { id: 'vwo_rigorous', label: 'VWO Academic Rigorous', desc: 'Direct scientific logic, conceptual precision, zero filler or vague rhetoric' },
        { id: 'expository_analytical', label: 'Expository & Analytical', desc: 'Systematic breakdown of mechanisms, theorems, or empirical phenomena' },
        { id: 'formal_argumentative', label: 'Formal Argumentative', desc: 'Rigorous hypothesis testing, counter-arguments, and rational deduction' },
        { id: 'critical_inquiry', label: 'Critical Scientific Inquiry', desc: 'Evaluates boundary conditions, empirical evidence, and validity' },
      ],
      formats: [
        { id: 'vwo_structure', label: 'VWO Academic Essay Structure', desc: 'Problem Definition, Theoretical Framework, Critical Analysis, Synthesis' },
        { id: 'scientific_paper', label: 'Scientific Paper Structure', desc: 'Abstract/Summary, Introduction, Core Findings & Discussion, Conclusion' },
        { id: 'apa_7th', label: 'APA 7th Edition Format', desc: 'Scholarly in-text citations and academic reference mapping' },
        { id: 'standard_analytical', label: 'Standard Analytical Model', desc: 'Thesis statement, evidence-backed body sections, final conclusion' },
      ],
    };
  }

  // 6. IELTS / TOEFL / Duolingo / English Proficiency
  if (
    exam.includes('ielts') || 
    exam.includes('toefl') || 
    exam.includes('duolingo') || 
    exam.includes('pte') || 
    exam.includes('cefr')
  ) {
    const isTOEFL = exam.includes('toefl');
    const examTitle = isTOEFL ? 'TOEFL iBT' : 'IELTS Academic';
    return {
      examName: targetExam || examTitle,
      badgeLabel: `🎯 Calibrated for ${examTitle} (Band 9 / 30-Score)`,
      defaultTone: isTOEFL ? 'TOEFL Academic & Logical' : 'IELTS Band 9 Academic',
      defaultFormat: isTOEFL ? 'TOEFL Independent Essay' : 'IELTS Task 2 Structure (4-5 Paras)',
      tones: [
        { id: 'ielts_band9', label: isTOEFL ? 'TOEFL Academic & Logical' : 'IELTS Band 9 Academic', desc: 'Rich lexical resource, varied syntactic structures, natural cohesive flow' },
        { id: 'balanced_discursive', label: 'Balanced Discursive', desc: 'Discuss both views, evaluate arguments, and state clear reasoned opinion' },
        { id: 'direct_opinion', label: 'Direct Agree / Disagree', desc: 'Clear, unambiguous stance defended consistently from intro to conclusion' },
        { id: 'problem_solution', label: 'Problem & Solution Focus', desc: 'Detailed analysis of underlying causes followed by concrete viable solutions' },
      ],
      formats: [
        { id: 'ielts_task2', label: isTOEFL ? 'TOEFL Independent Essay' : 'IELTS Task 2 Structure (4-5 Paras)', desc: 'Introduction (Paraphrase + Stance), Body 1 (Idea + Detail), Body 2, Conclusion' },
        { id: 'both_views_format', label: 'Discuss Both Views & Opinion', desc: 'View A evaluated, View B evaluated, Personal synthesis & verdict' },
        { id: 'problem_solution_fmt', label: 'Causes & Solutions Blueprint', desc: 'Problem outline, primary root causes, concrete actionable solutions' },
        { id: 'standard_academic', label: 'Standard Academic Format', desc: 'Universal formal essay architecture' },
      ],
    };
  }

  // 7. SAT / ACT / College Admissions
  if (
    exam.includes('sat') || 
    exam.includes('act') || 
    exam.includes('college admissions') || 
    exam.includes('common app')
  ) {
    return {
      examName: targetExam || 'SAT / ACT / College Entrance',
      badgeLabel: '🎯 Calibrated for SAT / College Board Standards',
      defaultTone: 'Evidence-Based Argumentative',
      defaultFormat: 'Standard 5-Paragraph Model',
      tones: [
        { id: 'evidence_based', label: 'Evidence-Based Argumentative', desc: 'Sharp central claim backed by textual evidence and sound logical reasoning' },
        { id: 'persuasive_rhetorical', label: 'Persuasive Rhetorical', desc: 'Dynamic, authoritative voice that persuades the reader with clarity' },
        { id: 'analytical_commentary', label: 'Analytical Commentary', desc: 'Deep deconstruction of underlying mechanisms and societal implications' },
        { id: 'academic_collegiate', label: 'Academic Collegiate', desc: 'Polished pre-university standard appropriate for college-level writing' },
      ],
      formats: [
        { id: 'sat_5para', label: 'Standard 5-Paragraph Model', desc: 'Introductory hook + thesis, 3 focused argument paragraphs, conclusion' },
        { id: 'admissions_personal', label: 'College Admissions Personal Essay', desc: 'Engaging narrative hook, meaningful challenge, reflective growth & outlook' },
        { id: 'apa_format', label: 'APA 7th Edition Format', desc: 'Academic headers, parenthetical citations, and reference section' },
        { id: 'mla_format', label: 'MLA 9th Edition Format', desc: 'Humanities style with student header and Works Cited list' },
      ],
    };
  }

  // 8. UPSC / Civil Services / Public Competitive Exams
  if (
    exam.includes('upsc') || 
    exam.includes('civil services') || 
    exam.includes('ias') || 
    exam.includes('pcs') || 
    exam.includes('public service')
  ) {
    return {
      examName: targetExam || 'UPSC Mains Essay',
      badgeLabel: '🎯 Calibrated for UPSC Civil Services Mains Rubric',
      defaultTone: 'Balanced & Multi-Dimensional',
      defaultFormat: 'UPSC Mains 360° Essay (Quote to Way Forward)',
      tones: [
        { id: 'upsc_multidimensional', label: 'Balanced & Multi-Dimensional', desc: 'Social, Economic, Political, Environmental, Ethical, and International dimensions' },
        { id: 'constructive_futuristic', label: 'Constructive & Futuristic', desc: 'Actionable policy solutions grounded in constitutional values and vision' },
        { id: 'analytical_crisp', label: 'Analytical & Crisp', desc: 'Structured headings, empirical data, government initiatives, and balanced synthesis' },
        { id: 'formal_expository', label: 'Formal Expository', desc: 'Authoritative, dignified, objective, and non-partisan civil service voice' },
      ],
      formats: [
        { id: 'upsc_360', label: 'UPSC Mains 360° Essay (Quote to Way Forward)', desc: 'Anecdote/Quote Hook, Multi-dimensional Analysis, Schemes, Way Forward & Concluding Vision' },
        { id: 'policy_report', label: 'Analytical Policy Report Format', desc: 'Issue Overview, Stakeholder Impacts, Policy Gaps, Strategic Recommendations' },
        { id: 'philosophical_essay', label: 'Philosophical & Abstract Essay', desc: 'Unpacks philosophical quote with historical, ethical, and contemporary examples' },
        { id: 'standard_academic', label: 'Standard Academic Format', desc: 'Universal structured exposition' },
      ],
    };
  }

  // 9. Named Custom Exam Fallback (e.g. NEET, JEE, GRE, GMAT, Law, Abitur, Baccalauréat)
  if (targetExam && targetExam.trim().length > 0 && targetExam.toLowerCase() !== 'general') {
    return {
      examName: targetExam,
      badgeLabel: `🎯 Calibrated for ${targetExam}`,
      defaultTone: `${targetExam} Analytical Tone`,
      defaultFormat: `${targetExam} Essay Structure`,
      tones: [
        { id: 'custom_analytical', label: `${targetExam} Analytical Tone`, desc: `Calibrated specifically for ${targetExam} scoring and curriculum standards` },
        { id: 'critical_evaluative', label: 'Critical & Evaluative', desc: 'Rigorous assessment of theories, evidence, and logical counterpoints' },
        { id: 'formal_academic', label: 'Formal Academic', desc: 'Objective scholarship with elevated vocabulary and clear structure' },
        { id: 'persuasive_argument', label: 'Persuasive Argumentative', desc: 'Direct, convincing thesis supported by empirical logic' },
      ],
      formats: [
        { id: 'custom_exam_fmt', label: `${targetExam} Essay Structure`, desc: `Follows the official examination composition standards for ${targetExam}` },
        { id: 'standard_academic', label: 'Standard 5-Paragraph Model', desc: 'Clear thesis statement, three supportive body arguments, and conclusion' },
        { id: 'apa_format', label: 'APA 7th Edition Format', desc: 'Parenthetical citations and formal academic bibliography' },
        { id: 'mla_format', label: 'MLA 9th Edition Format', desc: 'Standard humanities citations and Works Cited list' },
      ],
    };
  }

  // 10. Default General Academic Suite (When no specific exam is set)
  return {
    examName: 'Standard Academic',
    badgeLabel: '🎓 Standard Academic Writing Suite',
    defaultTone: 'Academic',
    defaultFormat: 'Standard',
    tones: [
      { id: 'academic', label: 'Academic', desc: 'Formal, objective, scholarly language with intellectual clarity' },
      { id: 'persuasive', label: 'Persuasive', desc: 'Direct, convincing, logic-driven arguments with compelling rhetoric' },
      { id: 'creative', label: 'Creative', desc: 'Evocative storytelling, vivid imagery, and engaging emotional resonance' },
      { id: 'casual', label: 'Casual', desc: 'Engaging, conversational, and energetic mentor style' },
    ],
    formats: [
      { id: 'standard', label: 'Standard', desc: 'Compelling title, thesis-driven introduction, substantive body, and conclusion' },
      { id: 'apa', label: 'APA Format', desc: 'APA 7th edition header, parenthetical citations, and references list' },
      { id: 'mla', label: 'MLA Format', desc: 'MLA 9th edition header, in-text citations, and Works Cited list' },
    ],
  };
}

