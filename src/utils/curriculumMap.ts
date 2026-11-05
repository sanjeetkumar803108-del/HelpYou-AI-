import { safeGetItem } from './storage';
import { auth } from '../lib/firebase';
import { getStoredExamBlueprint } from './academicBlueprint';
import { getVerifiedChapterSubTopics } from './communityCache';

export interface CurriculumSubject {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  themeColor: string;
  icon: string;
  topics: string[];
  chapterSubTopics?: Record<string, string[]>;
  nomenclature?: string;
  singularNomenclature?: string;
  isCore: boolean;
  tierLabel: string;
}

// Grouping logic helper
export function getGradeTierGroup(grade: string): '9-10' | '11-12' | 'College' {
  const normalized = (grade || '').toLowerCase();
  if (normalized.includes('9th') || normalized.includes('10th')) {
    return '9-10';
  }
  if (normalized.includes('college') || normalized.includes('university') || normalized.includes('freshman undergrad') || normalized.includes('undergrad')) {
    return 'College';
  }
  return '11-12';
}

// Master mapping dictionary
export const MASTER_CURRICULUM_MAP: Record<string, Record<string, Record<string, Array<{ key: string; title: string; subtitle: string; icon: string; topics: string[] }>>>> = {
  'USA': {
    '9-10': {
      'STEM / Engineering': [
        { key: 'math_9_10', title: 'Algebra 1 & Geometry', subtitle: '9-10 Prep Math', icon: '📐', topics: ['Linear Equations', 'Quadratic Functions', 'Coordinate Geometry', 'Congruence'] },
        { key: 'sci_9_10', title: 'Physical Science', subtitle: 'Introductory Physics & Chem', icon: '⚡', topics: ['Forces & Motion', 'Waves & Sound', 'Matter & Changes', 'Chemical Energy'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'biology_9_10', title: 'High School Biology', subtitle: 'Introductory Life Sciences', icon: '🧬', topics: ['Cellular Biology', 'Genetics Intro', 'Ecosystems & Biomes', 'Human Body Basics'] },
        { key: 'chem_9_10', title: 'Introductory Chemistry', subtitle: 'Foundations of Matter', icon: '🧪', topics: ['Elements & Compounds', 'Chemical Reactions', 'Periodic Table Basics', 'Acids & Bases'] }
      ],
      'Business / Economics': [
        { key: 'business_9_10', title: 'Introduction to Business', subtitle: 'Commerce & Career Basics', icon: '💼', topics: ['Business Ownership', 'Marketing Basics', 'Entrepreneurship', 'Corporate Ethics'] },
        { key: 'finance_9_10', title: 'Personal Finance', subtitle: 'Budgeting & Saving Basics', icon: '💵', topics: ['Checking Accounts', 'Investing Basics', 'Tax Foundations', 'Credit & Loans'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'history_9_10', title: 'World History 101', subtitle: 'Ancient to Modern Societies', icon: '🌍', topics: ['Ancient Civilizations', 'The Renaissance', 'World War I & II', 'Global Civil Movements'] },
        { key: 'english_9_10', title: 'English Language & Lit', subtitle: 'Grammar, Reading & Writing', icon: '📖', topics: ['Literary Devices', 'Argument Writing', 'Grammar Conventions', 'Text Analysis'] }
      ],
      'Computer Science': [
        { key: 'cs_9_10', title: 'Introduction to Coding', subtitle: 'Scratch & Python Fundamentals', icon: '💻', topics: ['Variables & Inputs', 'Conditional Logic', 'Simple Loops', 'Algorithmic Thinking'] }
      ]
    },
    '11-12': {
      'STEM / Engineering': [
        { key: 'adv_calc', title: 'AP Calculus BC', subtitle: 'Advanced Calculus', icon: '📐', topics: ['Limits', 'Derivatives', 'Integrals', 'Series'] },
        { key: 'adv_physics', title: 'AP Physics C: Mechanics', subtitle: 'Calculus-Based Physics', icon: '🚀', topics: ['Kinematics', 'Newton\'s Laws', 'Work & Energy', 'Rotational Motion'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'adv_biology', title: 'AP Biology', subtitle: 'College-level Biology', icon: '🧬', topics: ['Evolution', 'Cell Energetics', 'Genetics', 'Ecology'] },
        { key: 'adv_chem', title: 'AP Chemistry', subtitle: 'College-level Chemistry', icon: '🧪', topics: ['Atomic Structure', 'Chemical Bonds', 'Thermodynamics', 'Kinetics'] }
      ],
      'Business / Economics': [
        { key: 'adv_macro', title: 'AP Macroeconomics', subtitle: 'Global Economic Systems', icon: '📈', topics: ['GDP & Inflation', 'Aggregate Demand', 'Monetary Policy', 'International Trade'] },
        { key: 'adv_stats', title: 'AP Statistics', subtitle: 'College-level Stats', icon: '📊', topics: ['Data Distribution', 'Probability', 'Confidence Intervals', 'Significance Tests'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'adv_ushistory', title: 'AP US History', subtitle: 'United States Historical Eras', icon: '🏛️', topics: ['Colonization', 'American Revolution', 'Civil War & Reconstruction', 'The Cold War'] },
        { key: 'adv_english', title: 'AP English Language', subtitle: 'Rhetoric & Argumentation', icon: '✍️', topics: ['Rhetorical Analysis', 'Argumentative Synthesis', 'Persuasive Writing'] }
      ],
      'Computer Science': [
        { key: 'adv_cs', title: 'AP Computer Science A', subtitle: 'Java Programming & OOP', icon: '💻', topics: ['Primitive Types', 'Using Objects', 'Arrays & ArrayLists', 'Recursion'] }
      ]
    },
    'College': {
      'STEM / Engineering': [
        { key: 'calc_2', title: 'Calculus II', subtitle: 'Integrals & Series', icon: '📐', topics: ['Integration Techniques', 'Parametric Equations', 'Sequences & Series'] },
        { key: 'phys_1_mech', title: 'Physics I: Mechanics', subtitle: 'Mechanics & Kinetics', icon: '⚙️', topics: ['Kinematics', 'Force Systems', 'Momentum', 'Rotational Dynamics'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'gen_chem_101', title: 'General Chemistry 101', subtitle: 'Introductory College Chemistry', icon: '🧪', topics: ['Stoichiometry', 'Gases', 'Solutions', 'Acid-Base Equilibria'] },
        { key: 'intro_bio_101', title: 'Introductory Biology 101', subtitle: 'Introductory College Biology', icon: '🧬', topics: ['Cell Structure', 'Photosynthesis', 'Molecular Genetics', 'Evolutionary Theory'] }
      ],
      'Business / Economics': [
        { key: 'micro_econ_101', title: 'Microeconomics 101', subtitle: 'Consumer & Firm Choice', icon: '📈', topics: ['Supply & Demand', 'Elasticity', 'Market Structures', 'Game Theory'] },
        { key: 'fin_accounting', title: 'Financial Accounting 101', subtitle: 'Ledgers, Books & Balance Sheets', icon: '🧾', topics: ['Accounting Cycle', 'Financial Statements', 'Inventory & Assets', 'Liabilities'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'us_hist_101', title: 'US History 101', subtitle: 'Foundations of US Society', icon: '🏛️', topics: ['Early America', 'Civil War Era', 'Industrialization', 'Post-War Global Roles'] },
        { key: 'college_comp', title: 'College Composition', subtitle: 'College Writing & Rhetoric', icon: '✍️', topics: ['Critical Analysis', 'MLA/APA Research Writing', 'Thesis Construction', 'Revision Processes'] }
      ],
      'Computer Science': [
        { key: 'intro_cs', title: 'Intro to Programming (CS101)', subtitle: 'Coding & Algorithm Foundations', icon: '💻', topics: ['Variables & Flow Control', 'Functions & Recursion', 'Basic Data Structures', 'Debugging'] },
        { key: 'data_struct', title: 'Data Structures 101', subtitle: 'Linked Lists, Stacks & Trees', icon: '💾', topics: ['Linked Lists', 'Binary Trees', 'Hash Tables', 'Sorting Algorithms'] }
      ]
    }
  },
  'UK': {
    '9-10': {
      'STEM / Engineering': [
        { key: 'math_9_10', title: 'GCSE Maths (Higher)', subtitle: 'AQA/Edexcel GCSE Maths', icon: '📐', topics: ['Surds & Indices', 'Quadratic Graphs', 'Trigonometry', 'Vectors'] },
        { key: 'sci_9_10', title: 'GCSE Physics', subtitle: 'Triple Science Physics', icon: '⚡', topics: ['Energy Transfer', 'Electricity', 'Particle Model', 'Radioactivity'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'biology_9_10', title: 'GCSE Biology', subtitle: 'Triple Science Biology', icon: '🧬', topics: ['Cell Structure', 'Bioenergetics', 'Infection & Response', 'Inheritance'] },
        { key: 'chem_9_10', title: 'GCSE Chemistry', subtitle: 'Triple Science Chemistry', icon: '🧪', topics: ['Chemical Bonding', 'Quantitative Chemistry', 'Chemical Changes', 'Organic Chemistry'] }
      ],
      'Business / Economics': [
        { key: 'business_9_10', title: 'GCSE Business Studies', subtitle: 'GCSE Business Foundations', icon: '💼', topics: ['Enterprise', 'Marketing Mix', 'Operations', 'Financial Records'] },
        { key: 'finance_9_10', title: 'GCSE Economics', subtitle: 'Introductory Economics Systems', icon: '💵', topics: ['Market Failure', 'National Economy', 'Globalisation', 'Economic Policies'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'history_9_10', title: 'GCSE History', subtitle: 'Historical Eras Exam Prep', icon: '🌍', topics: ['Germany 1890-1945', 'Conflict and Tension', 'Elizabethan England', 'Health and the People'] },
        { key: 'english_9_10', title: 'GCSE English Language', subtitle: 'English Language Paper 1 & 2', icon: '📖', topics: ['Creative Reading', 'Writers Viewpoints', 'Spoken Language', 'Transactional Writing'] }
      ],
      'Computer Science': [
        { key: 'cs_9_10', title: 'GCSE Computer Science', subtitle: 'Algorithms & Python Basics', icon: '💻', topics: ['Data Representation', 'Python Programming', 'Computer Networks', 'Cyber Security'] }
      ]
    },
    '11-12': {
      'STEM / Engineering': [
        { key: 'adv_calc', title: 'A-Level Mathematics', subtitle: 'Core & Pure Mathematics', icon: '📐', topics: ['Algebraic Methods', 'Integration', 'Vectors', 'Differentiation'] },
        { key: 'adv_physics', title: 'A-Level Physics', subtitle: 'Advanced Physics Core', icon: '🚀', topics: ['Mechanics & Materials', 'Electricity', 'Nuclear Physics', 'Fields'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'adv_biology', title: 'A-Level Biology', subtitle: 'Core Biology A-Level', icon: '🧬', topics: ['Biological Molecules', 'Cell Division', 'Genetic Diversity', 'Gene Expression'] },
        { key: 'adv_chem', title: 'A-Level Chemistry', subtitle: 'Inorganic, Organic & Physical Chem', icon: '🧪', topics: ['Physical Chemistry', 'Organic Chemistry', 'Inorganic Chemistry', 'Spectroscopy'] }
      ],
      'Business / Economics': [
        { key: 'adv_macro', title: 'A-Level Economics', subtitle: 'Micro & Macroeconomics Core', icon: '📈', topics: ['Price Determination', 'Market Structures', 'Macroeconomic Performance', 'Financial Markets'] },
        { key: 'adv_stats', title: 'A-Level Statistics', subtitle: 'Statistical Methods A-Level', icon: '📊', topics: ['Probability Distribution', 'Correlation & Regression', 'Hypothesis Testing'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'adv_ushistory', title: 'A-Level History', subtitle: 'Modern British & World History', icon: '🏛️', topics: ['The Tudors', 'Democracy and Nazism', 'Stuart Britain', 'Cold War in Europe'] },
        { key: 'adv_english', title: 'A-Level English Language', subtitle: 'Language Analysis & Production', icon: '✍️', topics: ['Textual Variations', 'Children\'s Language Acquisition', 'Language Change'] }
      ],
      'Computer Science': [
        { key: 'adv_cs', title: 'A-Level Computer Science', subtitle: 'Algorithms & Database Theory', icon: '💻', topics: ['Data Structures', 'Regular Expressions', 'Network Protocols', 'Systems Architecture'] }
      ]
    },
    'College': {
      'STEM / Engineering': [
        { key: 'calc_2', title: 'University Calculus 1', subtitle: 'Advanced Mathematical Methods', icon: '📐', topics: ['Integration Theory', 'Differential Equations', 'Complex Numbers'] },
        { key: 'phys_1_mech', title: 'University Physics 1', subtitle: 'Classical Mechanics & Wave Systems', icon: '⚙️', topics: ['Newtonian Physics', 'Vector Forces', 'Harmonic Oscillators'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'gen_chem_101', title: 'Chemistry 101', subtitle: 'University Inorganic Chemistry', icon: '🧪', topics: ['Thermodynamics', 'Redox Reactions', 'Chemical Kinetics', 'Orbitals'] },
        { key: 'intro_bio_101', title: 'Biology 101', subtitle: 'University Cellular Biology', icon: '🧬', topics: ['Cellular Structure', 'Gene Coding', 'Evolutionary Biology', 'Metabolism'] }
      ],
      'Business / Economics': [
        { key: 'micro_econ_101', title: 'Microeconomics 101', subtitle: 'Price Theory & Firm Models', icon: '📈', topics: ['Market Efficiency', 'Utility Maximization', 'Monopolies', 'Oligopolistic Pricing'] },
        { key: 'fin_accounting', title: 'Financial Accounting', subtitle: 'University Finance Core', icon: '🧾', topics: ['Double Entry ledger', 'Trial Balance', 'Income Statement', 'Corporate Ratios'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'us_hist_101', title: 'Modern History 101', subtitle: 'Post-War Global Systems', icon: '🏛️', topics: ['Decolonization', 'Cold War Politics', 'European Integration', 'Globalized Cultures'] },
        { key: 'college_comp', title: 'Academic Writing 101', subtitle: 'Scholarly Writing & Citation', icon: '✍️', topics: ['Skeptic Argumentation', 'Peer Review Literature', 'Bibliography Construction'] }
      ],
      'Computer Science': [
        { key: 'intro_cs', title: 'Intro to Programming 101', subtitle: 'Modern Language Fundamentals', icon: '💻', topics: ['Programming Paradigms', 'Variables & Flow Control', 'Lists & Dictionaries', 'Debugging Core'] },
        { key: 'data_struct', title: 'Data Structures & Algorithms', subtitle: 'Complex Computing Methods', icon: '💾', topics: ['Algorithms Analysis', 'Linked Lists & Arrays', 'Binary Trees', 'Searching'] }
      ]
    }
  },
  'CA': {
    '9-10': {
      'STEM / Engineering': [
        { key: 'math_9_10', title: 'Grade 9/10 Academic Math (MPM2D)', subtitle: 'Ontario Curriculum Math', icon: '📐', topics: ['Linear Systems', 'Quadratic Relations', 'Analytic Geometry', 'Trigonometry'] },
        { key: 'sci_9_10', title: 'Grade 10 Science (SNC2D)', subtitle: 'Academic Science SNC2D', icon: '⚡', topics: ['Chemical Reactions', 'Tissues & Organs', 'Climate Change', 'Light & Optics'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'biology_9_10', title: 'Grade 10 Biology (SNC2D)', subtitle: 'General Life Sciences', icon: '🧬', topics: ['Cell Division', 'Organ Systems', 'Ecosystem Sustainability', 'Animal vs Plant Tissues'] },
        { key: 'chem_9_10', title: 'Grade 10 Chemistry (SNC2D)', subtitle: 'Matter & Chemical Reactions', icon: '🧪', topics: ['Chemical Equations', 'Ionic & Covalent Bonds', 'Acids & Bases Intro', 'Chemical Safety'] }
      ],
      'Business / Economics': [
        { key: 'business_9_10', title: 'Grade 10 Business (BBI2O)', subtitle: 'Introduction to Business Studies', icon: '💼', topics: ['Business Ownership', 'Marketing Basics', 'Entrepreneurship Intro', 'Accounting Basics'] },
        { key: 'finance_9_10', title: 'Grade 10 Business Technology', subtitle: 'Digital Literacy & Commerce', icon: '💵', topics: ['Word Processing', 'Spreadsheet Formulas', 'Database Basics', 'Digital Presentation'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'history_9_10', title: 'Grade 10 Canadian History (CHC2D)', subtitle: 'History since WWI', icon: '🌍', topics: ['Canada in WWI', 'The Great Depression', 'Canada in WWII', 'Post-War Social Shifts'] },
        { key: 'english_9_10', title: 'Grade 10 English Academic (ENG2D)', subtitle: 'Literacy & Literature Analysis', icon: '📖', topics: ['Novel Study', 'Shakespeare Plays', 'Short Story Essays', 'Media Literacy'] }
      ],
      'Computer Science': [
        { key: 'cs_9_10', title: 'Grade 10 Computer Studies (ICS2O)', subtitle: 'Ontario Coding Intro', icon: '💻', topics: ['Python Variables', 'Decisions & Loops', 'Basic HTML/CSS', 'Hardware Foundations'] }
      ]
    },
    '11-12': {
      'STEM / Engineering': [
        { key: 'core_math', title: 'Grade 11/12 Functions', subtitle: 'Advanced Functions (MHF4U)', icon: '📐', topics: ['Polynomial Functions', 'Rational Functions', 'Trigonometric Functions', 'Exponential Functions'] },
        { key: 'adv_calc', title: 'Calculus and Vectors (MCV4U)', subtitle: 'Ontario MCV4U Curriculum', icon: '📐', topics: ['Limits', 'Derivatives', 'Vector Planes', 'Lines & Intersection'] },
        { key: 'adv_physics', title: 'Grade 12 Physics (SPH4U)', subtitle: 'University Preparation Physics', icon: '🚀', topics: ['Forces & Dynamics', 'Energy & Momentum', 'Gravitational Fields', 'Light Waves & Optics'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'adv_biology', title: 'Grade 12 Biology (SBI4U)', subtitle: 'SBI4U Curriculum Prep', icon: '🧬', topics: ['Biochemistry', 'Metabolic Processes', 'Molecular Genetics', 'Homeostasis'] },
        { key: 'adv_chem', title: 'Grade 12 Chemistry (SCH4U)', subtitle: 'SCH4U Curriculum Prep', icon: '🧪', topics: ['Structure and Properties', 'Energy Changes', 'Chemical Systems', 'Electrochemistry'] }
      ],
      'Business / Economics': [
        { key: 'adv_macro', title: 'Grade 12 Economics (CIA4U)', subtitle: 'Canadian & Global Economics', icon: '📈', topics: ['Macroeconomics', 'Market Intervention', 'Fiscal Policy', 'International Trade'] },
        { key: 'adv_stats', title: 'Grade 12 Data Management (MDM4U)', subtitle: 'Data Management Statistics', icon: '📊', topics: ['Permutations', 'Probability Distribution', 'One-variable Statistics', 'Index Numbers'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'adv_ushistory', title: 'Canadian History (CHI4U)', subtitle: 'Canadian History & Identity', icon: '🏛️', topics: ['Indigenous History', 'Confederation Era', 'World Wars Impact', 'Modern Identity'] },
        { key: 'core_reading', title: 'University Preparation English', subtitle: 'English Grade 12 (ENG4U)', icon: '✍️', topics: ['Critical Thinking', 'Literary Essay Structure', 'Public Speaking', 'Grammar Synthesis'] }
      ],
      'Computer Science': [
        { key: 'adv_cs', title: 'Grade 12 Computer Science (ICS4U)', subtitle: 'University Prep Java', icon: '💻', topics: ['Object-Oriented Programming', 'Recursive Algorithms', 'Sorting & Searching', 'Software Engineering Plan'] }
      ]
    },
    'College': {
      'STEM / Engineering': [
        { key: 'calc_2', title: 'Calculus I', subtitle: 'University Limits & Integrals', icon: '📐', topics: ['Limits & Continuity', 'Derivative Rules', 'Critical Points', 'Fundamental Theorem'] },
        { key: 'phys_1_mech', title: 'Physics I: Mechanics', subtitle: 'University Physics Mechanics', icon: '⚙️', topics: ['Vectors', 'Kinematics', 'Friction & Dynamics', 'Conservation Laws'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'gen_chem_101', title: 'General Chemistry 101', subtitle: 'Introductory College Chemistry', icon: '🧪', topics: ['Atomic Orbitals', 'Molecular Bonds', 'Gas States', 'Solution Stoichiometry'] },
        { key: 'intro_bio_101', title: 'Introductory Biology 101', subtitle: 'Introductory College Biology', icon: '🧬', topics: ['Cellular Biology', 'Molecular Genetics', 'Evolutionary Biology', 'Ecosystem Analysis'] }
      ],
      'Business / Economics': [
        { key: 'micro_econ_101', title: 'Microeconomics 101', subtitle: 'Consumer Choice Theory', icon: '📈', topics: ['Supply & Demand Theory', 'Utility & Indifference Curves', 'Production Cost Curves', 'Oligopoly Theory'] },
        { key: 'fin_accounting', title: 'Financial Accounting 101', subtitle: 'Financial Ledger & Sheets', icon: '🧾', topics: ['Double-Entry Ledger', 'Depreciation Calculation', 'Statement of Cash Flows', 'Ratios'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'us_hist_101', title: 'US/Canadian History 101', subtitle: 'Foundations of North America', icon: '🏛️', topics: ['Pre-Contact Civilizations', 'The Colonial System', 'Westward Expansion', 'Industrial Era'] },
        { key: 'college_comp', title: 'College Composition', subtitle: 'Academic Writing & Rhetoric', icon: '✍️', topics: ['Rhetorical Analysis', 'Thesis Construction', 'Synthesized Research Paper', 'APA/MLA Citation'] }
      ],
      'Computer Science': [
        { key: 'intro_cs', title: 'Intro to Programming (CS101)', subtitle: 'Algorithms & Python Foundations', icon: '💻', topics: ['Syntax & Types', 'Functional Design', 'Collections Framework', 'File I/O & Exceptions'] },
        { key: 'data_struct', title: 'Data Structures 101', subtitle: 'Linked Lists, Stacks & Queues', icon: '💾', topics: ['Arrays & Linked Lists', 'Stacks & Queues', 'Hash Tables', 'Binary Trees & BST'] }
      ]
    }
  },
  'AU': {
    '9-10': {
      'STEM / Engineering': [
        { key: 'math_9_10', title: 'Year 9/10 Math (Advanced)', subtitle: 'Australian National Curriculum', icon: '📐', topics: ['Indices & Surds', 'Algebraic Fractions', 'Trigonometry', 'Quadratic Equations'] },
        { key: 'sci_9_10', title: 'Year 10 Science (Physics/Chem)', subtitle: 'National Curriculum Science', icon: '⚡', topics: ['Newton\'s Laws Intro', 'Chemical Reactions', 'Periodic Table Trends', 'Global Systems'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'biology_9_10', title: 'Year 10 Science (Biology)', subtitle: 'National Life Sciences', icon: '🧬', topics: ['Genetics & DNA', 'Evolutionary Theory', 'Ecosystem Interactions', 'Biological Adaptation'] },
        { key: 'chem_9_10', title: 'Year 10 Science (Chemistry)', subtitle: 'Matter & Reactions', icon: '🧪', topics: ['Elements & Valency', 'Types of Reactions', 'Reaction Rates Intro', 'Conservation of Mass'] }
      ],
      'Business / Economics': [
        { key: 'business_9_10', title: 'Year 9/10 Commerce', subtitle: 'NSW Curriculum Commerce', icon: '💼', topics: ['Consumer & Financial Decisions', 'Investing', 'Law & Society', 'Business Planning'] },
        { key: 'finance_9_10', title: 'Year 10 Business Studies', subtitle: 'Introduction to Business Operations', icon: '💵', topics: ['Small Business Setup', 'Marketing Mix', 'Account Logs', 'Economic Environment'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'history_9_10', title: 'Year 9/10 History (Australian)', subtitle: 'Modern Australian History', icon: '🌍', topics: ['Australia in WWI & WWII', 'Indigenous Civil Rights', 'Post-War Immigration', 'Pop Culture'] },
        { key: 'english_9_10', title: 'Year 10 English', subtitle: 'Australian Curriculum English', icon: '📖', topics: ['Shakespearean Study', 'Persuasive Texts', 'Poetry Analysis', 'Grammar Conventions'] }
      ],
      'Computer Science': [
        { key: 'cs_9_10', title: 'Year 9/10 Info & Software Tech', subtitle: 'NSW IST Software Design', icon: '💻', topics: ['Algorithms & Flowcharts', 'Python Coding Basics', 'HTML/CSS Layouts', 'Database Fields'] }
      ]
    },
    '11-12': {
      'STEM / Engineering': [
        { key: 'core_math', title: 'ATAR Mathematics Methods', subtitle: 'Calculus & Stats Methods', icon: '📐', topics: ['Functions and Graphs', 'Trigonometric Functions', 'Differential Calculus', 'Discrete Random Variables'] },
        { key: 'adv_calc', title: 'ATAR Specialist Mathematics', subtitle: 'Advanced Specialist Maths', icon: '📐', topics: ['Complex Numbers', 'Vectors in 3D', 'Integration Techniques', 'Differential Equations'] },
        { key: 'adv_physics', title: 'ATAR Physics', subtitle: 'ATAR Curriculum Physics', icon: '🚀', topics: ['Motion and Forces', 'Gravity & Electromagnetism', 'Wave Particle Duality', 'Standard Model'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'adv_biology', title: 'ATAR Biology', subtitle: 'National Biology Prep', icon: '🧬', topics: ['Cellular Processes', 'Homeostasis', 'Infectious Diseases', 'Evolutionary Change'] },
        { key: 'adv_chem', title: 'ATAR Chemistry', subtitle: 'National Chemistry Prep', icon: '🧪', topics: ['Atomic Structure', 'Intermolecular Forces', 'Equilibrium', 'Organic Synthesis'] }
      ],
      'Business / Economics': [
        { key: 'adv_macro', title: 'ATAR Economics', subtitle: 'Macroeconomics Australian Scope', icon: '📈', topics: ['Global Economy', 'Australia\'s Trade', 'Economic Growth', 'Fiscal & Monetary Policy'] },
        { key: 'adv_stats', title: 'ATAR Mathematics Applications', subtitle: 'Practical & Financial Math', icon: '📊', topics: ['Financial Modeling', 'Matrices', 'Bivariate Data Analysis', 'Networks & Graphs'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'adv_ushistory', title: 'ATAR Modern History', subtitle: 'Modern History Revolutions', icon: '🏛️', topics: ['American Revolution', 'Russian Revolution', 'World War I', 'The Cold War'] },
        { key: 'core_reading', title: 'ATAR English', subtitle: 'HSC / VCE ATAR English Core', icon: '✍️', topics: ['Reading & Responding', 'Persuasive Speech Writing', 'Comparative Texts', 'Rhetorical Essays'] }
      ],
      'Computer Science': [
        { key: 'adv_cs', title: 'ATAR Computer Science', subtitle: 'Software Design & Database', icon: '💻', topics: ['System Architectures', 'Software Design Cycle', 'Data Structures', 'Database Normalisation'] }
      ]
    },
    'College': {
      'STEM / Engineering': [
        { key: 'calc_2', title: 'Calculus I', subtitle: 'University Differential Calculus', icon: '📐', topics: ['Limits & Tangents', 'Implicit Differentiation', 'Integration Theory', 'Applications'] },
        { key: 'phys_1_mech', title: 'Physics I: Mechanics', subtitle: 'Classical Physics Mechanics', icon: '⚙️', topics: ['Vector Statics', 'Angular Kinematics', 'Gravitation', 'Friction & Drag'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'gen_chem_101', title: 'General Chemistry 101', subtitle: 'College Chemistry Core', icon: '🧪', topics: ['Molecular Geometry', 'Periodic Properties', 'Solutions & Kinetics', 'Gibbs Free Energy'] },
        { key: 'intro_bio_101', title: 'Introductory Biology 101', subtitle: 'College Biology Core', icon: '🧬', topics: ['Cell Structure & Energy', 'Gene Transcription', 'Evolutionary Trees', 'Population Genetics'] }
      ],
      'Business / Economics': [
        { key: 'micro_econ_101', title: 'Microeconomics 101', subtitle: 'Market Efficiency & Choices', icon: '📈', topics: ['Consumer Choice Theory', 'Producer cost Optimization', 'Monopolies & Mergers', 'Externalities'] },
        { key: 'fin_accounting', title: 'Financial Accounting', subtitle: 'Finance & Ledger Audits', icon: '🧾', topics: ['Debit/Credit Rules', 'Balance Sheet Reporting', 'Asset Depreciations', 'Trial Balances'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'us_hist_101', title: 'Australian/World History 101', subtitle: 'Modern Historical Contexts', icon: '🏛️', topics: ['Early Australian Settlement', 'Global Colonization', 'The World Wars', 'Global Post-Colonialism'] },
        { key: 'college_comp', title: 'College Composition', subtitle: 'Expository & Rhetorical Writing', icon: '✍️', topics: ['Analytical Argumentation', 'Synthesizing Literature', 'MLA Style Citations', 'Revision Cycles'] }
      ],
      'Computer Science': [
        { key: 'intro_cs', title: 'Intro to Programming (CS101)', subtitle: 'Coding Foundations', icon: '💻', topics: ['Functional Programming', 'Control Loops & Types', 'Basic Sorting Algorithms', 'File Handling'] },
        { key: 'data_struct', title: 'Data Structures & Algorithms', subtitle: 'Advanced Coding Methods', icon: '💾', topics: ['Time/Space Complexity', 'Linked Lists & Stacks', 'Hash Maps', 'BST & Graphs'] }
      ]
    }
  },
  'Global': {
    '9-10': {
      'STEM / Engineering': [
        { key: 'math_9_10', title: 'MYP Mathematics (Extended)', subtitle: 'International Baccalaureate Prep', icon: '📐', topics: ['Algebraic Equations', 'Surds & Indices', 'Geometry Transformations', 'Bivariate Data'] },
        { key: 'sci_9_10', title: 'MYP Physics & Chemistry', subtitle: 'Integrated Sciences Program', icon: '⚡', topics: ['Force & Kinematics', 'Atoms & Elements', 'Thermal Energy', 'Organic Reactions'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'biology_9_10', title: 'MYP Biology & Chemistry', subtitle: 'Integrated Science Biology', icon: '🧬', topics: ['Cell structure', 'Ecology Basics', 'Genetics Intro', 'Classification'] },
        { key: 'chem_9_10', title: 'MYP Science (Life Sciences)', subtitle: 'Integrated Science Chemistry', icon: '🧪', topics: ['Chemical Compounds', 'Reactions and Equations', 'PH Scale', 'Periodic Law'] }
      ],
      'Business / Economics': [
        { key: 'business_9_10', title: 'MYP Business Studies', subtitle: 'Global Commerce Studies', icon: '💼', topics: ['Business Setup', 'Global Marketing', 'Corporate Balance', 'Operations'] },
        { key: 'finance_9_10', title: 'MYP Economics', subtitle: 'Global Economic Systems', icon: '💵', topics: ['Needs & Wants', 'Supply and Demand Basics', 'Global Trade Intro', 'Government Roles'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'history_9_10', title: 'MYP Individuals & Societies', subtitle: 'World History and Social Studies', icon: '🌍', topics: ['Ancient Societies', 'Colonialism', 'Industrial Revolution', 'Modern Rights'] },
        { key: 'english_9_10', title: 'MYP English Language & Lit', subtitle: 'Global Literature & Language', icon: '📖', topics: ['Theme Analysis', 'Creative Essay Construction', 'Media Rhetoric', 'Poetic Forms'] }
      ],
      'Computer Science': [
        { key: 'cs_9_10', title: 'MYP Computer Science', subtitle: 'Global Coding Foundations', icon: '💻', topics: ['Python Variables & Inputs', 'Control Statements', 'List Variables', 'Designing UI Projects'] }
      ]
    },
    '11-12': {
      'STEM / Engineering': [
        { key: 'core_math', title: 'IB Math Analysis & Approaches HL', subtitle: 'Rigorous College-Prep Mathematics', icon: '📐', topics: ['Complex Algebra', 'Calculus Theory', 'Probability Distribution', 'Trigonometric Series'] },
        { key: 'adv_calc', title: 'IB Mathematics SL', subtitle: 'Core Calculus & Functions', icon: '📐', topics: ['Limits', 'Derivatives', 'Integration', 'Probability Distributions'] },
        { key: 'adv_physics', title: 'IB Physics HL', subtitle: 'IB Diploma Physics Program', icon: '🚀', topics: ['Thermal Physics', 'Fields & Gravitation', 'Electromagnetic Induction', 'Quantum Physics'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'adv_biology', title: 'IB Biology HL', subtitle: 'IB Diploma Biology Program', icon: '🧬', topics: ['Cell Biology', 'Genetics & Inheritance', 'Animal Physiology', 'Nucleic Acids'] },
        { key: 'adv_chem', title: 'IB Chemistry HL', subtitle: 'IB Diploma Chemistry Program', icon: '🧪', topics: ['Stoichiometry', 'Chemical Bonding', 'Chemical Equilibrium', 'Organic Reactions'] }
      ],
      'Business / Economics': [
        { key: 'adv_macro', title: 'IB Economics HL', subtitle: 'Macro & Global Economic Models', icon: '📈', topics: ['Elasticities', 'Macro Policies', 'Global Trade & Protectionism', 'Development Economics'] },
        { key: 'adv_stats', title: 'IB Business Management HL', subtitle: 'Business Models & Accounts', icon: '📊', topics: ['Business Strategy', 'Financial Accounts', 'Operations Management', 'Human Resources'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'adv_ushistory', title: 'IB History HL', subtitle: 'World Wars & Modern History', icon: '🏛️', topics: ['Causes of WWI', 'Democratic States', 'Authoritarian States', 'The Cold War'] },
        { key: 'core_reading', title: 'IB English A Literature HL', subtitle: 'Comparative Literature Studies', icon: '✍️', topics: ['Literary Commentary', 'Comparative Essay Prep', 'Global Issues Rhetoric'] }
      ],
      'Computer Science': [
        { key: 'adv_cs', title: 'IB Computer Science HL', subtitle: 'Java Programming & Abstract Theory', icon: '💻', topics: ['Systems Life Cycle', 'Abstract Data Types', 'Resource Management', 'Object Oriented Coding'] }
      ]
    },
    'College': {
      'STEM / Engineering': [
        { key: 'calc_2', title: 'Calculus I', subtitle: 'Introductory Limits & Derivatives', icon: '📐', topics: ['Limits Theory', 'Derivative Applications', 'Integration Calculus'] },
        { key: 'phys_1_mech', title: 'Physics I: Mechanics', subtitle: 'Vector Statics & Rigid Bodies', icon: '⚙️', topics: ['Forces & Vectors', 'Rigid Body Kinematics', 'Work & Energy Rules'] }
      ],
      'Pre-Med / AP Sciences': [
        { key: 'gen_chem_101', title: 'General Chemistry 101', subtitle: 'Inorganic Chemistry Principles', icon: '🧪', topics: ['Atom Models', 'Valence Electrons', 'Chemical Stoichiometry', 'Reactions'] },
        { key: 'intro_bio_101', title: 'Introductory Biology 101', subtitle: 'Cell biology & Metabolic Systems', icon: '🧬', topics: ['Cell Life Cycle', 'Protein Synthesis', 'Genetic Mapping', 'Species Evolution'] }
      ],
      'Business / Economics': [
        { key: 'micro_econ_101', title: 'Microeconomics 101', subtitle: 'Demand, Supply & Prices', icon: '📈', topics: ['Market Equilibriums', 'Utility Models', 'Production Limits', 'Competitive Markets'] },
        { key: 'fin_accounting', title: 'Financial Accounting 101', subtitle: 'Corporate Accounts & Ledgers', icon: '🧾', topics: ['Accounting Cycle', 'Journal Ledgers', 'Statement of Cash Flows', 'Ratios Analysis'] }
      ],
      'Humanities / Liberal Arts': [
        { key: 'us_hist_101', title: 'World History 101', subtitle: 'Global Civilizations & Empires', icon: '🏛️', topics: ['Imperialism', 'Industrial Revolutions', 'The Cold War Era', 'Global Organizations'] },
        { key: 'college_comp', title: 'College Composition', subtitle: 'Writing, Rhetoric & Synthesis', icon: '✍️', topics: ['Critical Analysis Papers', 'Citations APA/MLA', 'Draft Refinement', 'Scholarly Style'] }
      ],
      'Computer Science': [
        { key: 'intro_cs', title: 'Intro to Programming (CS101)', subtitle: 'Coding Paradigms in Python', icon: '💻', topics: ['Loops & Decisions', 'Functions & Inputs', 'Collections', 'Exceptions & File I/O'] },
        { key: 'data_struct', title: 'Data Structures 101', subtitle: 'Linked Arrays, BST & Stacks', icon: '💾', topics: ['Complexity Big-O', 'Arrays & Lists', 'Double Linked Nodes', 'Binary Search Trees'] }
      ]
    }
  }
};

// Curated authentic syllabus chapters for standard academic subjects
export const CURATED_SUBJECT_CHAPTERS: Record<string, { icon: string; themeColor: string; units: string[] }> = {
  'mathematics': {
    icon: '📐',
    themeColor: 'bg-blue-50/70 text-blue-600 border-blue-100',
    units: [
      'Limits, Continuity & Differentiability',
      'Derivatives & Applications of Derivatives',
      'Integrals & Fundamental Theorem of Calculus',
      'Differential Equations & Mathematical Modeling',
      'Matrices, Determinants & Linear Algebra',
      'Vector Algebra & Three-Dimensional Geometry',
      'Probability, Distributions & Permutations',
      'Relations, Functions & Inverse Trigonometry',
      'Trigonometric Functions & Complex Numbers'
    ]
  },
  'physics': {
    icon: '⚡',
    themeColor: 'bg-indigo-50/70 text-indigo-600 border-indigo-100',
    units: [
      'Units, Measurements & Vector Kinematics',
      'Newton’s Laws of Motion & Friction',
      'Work, Energy, Power & Collisions',
      'System of Particles & Rotational Dynamics',
      'Gravitation & Satellite Motion',
      'Thermodynamics, Heat & Kinetic Theory',
      'Oscillations & Simple Harmonic Motion',
      'Waves, Acoustics & Doppler Effect',
      'Electrostatics, Coulomb’s Law & Capacitance',
      'Current Electricity & DC Circuits',
      'Magnetic Effects of Current & Magnetism',
      'Electromagnetic Induction & AC Circuits',
      'Optics: Ray Optics & Wave Optics',
      'Modern Physics, Atoms, Nuclei & Semiconductors'
    ]
  },
  'chemistry': {
    icon: '🧪',
    themeColor: 'bg-purple-50/70 text-purple-600 border-purple-100',
    units: [
      'Atomic Structure & Quantum Numbers',
      'Periodic Classification & Chemical Bonding',
      'Thermodynamics, Enthalpy & Spontaneity',
      'Chemical & Ionic Equilibrium',
      'Redox Reactions & Electrochemistry',
      'Chemical Kinetics & Reaction Rates',
      'Solutions & Colligative Properties',
      'Coordination Compounds & Transition Elements',
      'Organic Chemistry: Hydrocarbons & Haloalkanes',
      'Alcohols, Phenols, Ethers & Carbonyls',
      'Amines, Diazonium Salts & Nitrogen Chemistry',
      'Biomolecules, Polymers & Practical Chemistry'
    ]
  },
  'biology': {
    icon: '🧬',
    themeColor: 'bg-emerald-50/70 text-emerald-600 border-emerald-100',
    units: [
      'The Living World & Biological Classification',
      'Plant Kingdom & Morphology of Flowering Plants',
      'Animal Kingdom & Structural Organisation',
      'Cell: The Unit of Life & Cell Cycle',
      'Biomolecules & Enzyme Catalysis',
      'Plant Physiology: Photosynthesis & Respiration',
      'Human Physiology: Circulation, Breathing & Digestion',
      'Neural Control, Coordination & Endocrine System',
      'Reproduction in Flowering Plants & Humans',
      'Genetics: Principles of Inheritance & Molecular Basis',
      'Evolution, Adaptation & Population Dynamics',
      'Biotechnology: Principles, Recombinant DNA & Applications',
      'Ecology, Ecosystems, Biodiversity & Conservation'
    ]
  },
  'computer': {
    icon: '💻',
    themeColor: 'bg-cyan-50/70 text-cyan-600 border-cyan-100',
    units: [
      'Programming Foundations & Control Flow',
      'Functions, Recursion & Scope',
      'Data Structures: Arrays, Lists, Stacks & Queues',
      'Algorithms: Sorting, Searching & Complexity Analysis',
      'Object-Oriented Programming (OOP) Principles',
      'Relational Databases, SQL Queries & Normalization',
      'Computer Networks, Protocols & Web Architecture',
      'Boolean Logic, Hardware Architecture & Operating Systems'
    ]
  },
  'history': {
    icon: '🏛️',
    themeColor: 'bg-amber-50/70 text-amber-600 border-amber-100',
    units: [
      'Ancient Civilizations & Early Societies',
      'Empires, Feudal Structures & Global Trade',
      'Renaissance, Enlightenment & Scientific Awakening',
      'Industrial Revolution & Socio-Political Transformation',
      'National Movements, Colonialism & Decolonization',
      'The World Wars & Interwar Geopolitics',
      'Post-War Cold War Politics, Non-Alignment & Globalization'
    ]
  },
  'economics': {
    icon: '📊',
    themeColor: 'bg-emerald-50/70 text-emerald-600 border-emerald-100',
    units: [
      'Consumer Behavior, Utility & Demand Elasticity',
      'Production Functions, Cost Curves & Revenue',
      'Market Structures: Perfect Competition & Monopolies',
      'National Income Accounting & Macro Aggregates',
      'Money, Banking & Central Bank Monetary Policy',
      'Government Budget, Fiscal Deficits & Public Policy',
      'Balance of Payments, Foreign Exchange & Global Trade'
    ]
  },
  'english': {
    icon: '📖',
    themeColor: 'bg-rose-50/70 text-rose-600 border-rose-100',
    units: [
      'Reading Comprehension & Critical Inferences',
      'Poetry Interpretation & Literary Devices',
      'Analytical, Argumentative & Persuasive Essays',
      'Formal Letters, Notices & Professional Writing',
      'Grammar, Sentence Transformations, Voice & Syntax',
      'Vocabulary Mastery, Phrasal Verbs & Rhetorical Analysis'
    ]
  },
  'geography': {
    icon: '🌍',
    themeColor: 'bg-teal-50/70 text-teal-600 border-teal-100',
    units: [
      'Geomorphology & Earth’s Crust Dynamics',
      'Climatology, Atmospheric Pressure & Wind Systems',
      'Oceanography, Marine Currents & Tides',
      'Biogeography, Soils & Ecosystem Distribution',
      'Human Geography, Population & Migration Patterns',
      'Economic Geography, Natural Resources & Energy',
      'Regional Development, Geopolitics & Cartography'
    ]
  }
};

export function getCuratedUnitsForSubject(subjectName: string): { icon: string; themeColor: string; units: string[] } {
  const clean = (subjectName || '').toLowerCase();
  if (clean.includes('math') || clean.includes('calc') || clean.includes('algebra') || clean.includes('stat') || clean.includes('geom') || clean.includes('functions')) {
    return CURATED_SUBJECT_CHAPTERS['mathematics'];
  }
  if (clean.includes('phys') || clean.includes('mechanic') || clean.includes('optics') || clean.includes('electro')) {
    return CURATED_SUBJECT_CHAPTERS['physics'];
  }
  if (clean.includes('chem') || clean.includes('organic') || clean.includes('inorganic')) {
    return CURATED_SUBJECT_CHAPTERS['chemistry'];
  }
  if (clean.includes('bio') || clean.includes('zoolog') || clean.includes('botan') || clean.includes('genetics') || clean.includes('life')) {
    return CURATED_SUBJECT_CHAPTERS['biology'];
  }
  if (clean.includes('comput') || clean.includes('coding') || clean.includes('software') || clean.includes('program') || clean.includes('it') || clean.includes('cs') || clean.includes('data')) {
    return CURATED_SUBJECT_CHAPTERS['computer'];
  }
  if (clean.includes('econ') || clean.includes('financ') || clean.includes('commerc') || clean.includes('account') || clean.includes('business')) {
    return CURATED_SUBJECT_CHAPTERS['economics'];
  }
  if (clean.includes('hist') || clean.includes('pol') || clean.includes('civic') || clean.includes('social') || clean.includes('governance')) {
    return CURATED_SUBJECT_CHAPTERS['history'];
  }
  if (clean.includes('geog') || clean.includes('earth') || clean.includes('terrain') || clean.includes('climate')) {
    return CURATED_SUBJECT_CHAPTERS['geography'];
  }
  if (clean.includes('eng') || clean.includes('literat') || clean.includes('writ') || clean.includes('verbal')) {
    return CURATED_SUBJECT_CHAPTERS['english'];
  }
  return {
    icon: '📚',
    themeColor: 'bg-indigo-50/70 text-indigo-600 border-indigo-100',
    units: [
      'Core Principles & Foundational Concepts',
      'Advanced Theoretical Frameworks',
      'Analytical Problem Solving & Methodologies',
      'Case Studies, Real-World Scenarios & Evidence',
      'Official Exam Traps, Formulas & Critical Synthesis',
      'Comprehensive High-Yield Examination Review'
    ]
  };
}

/**
 * Curated authentic high-yield exam sub-topics for standard curriculum chapters.
 * Ensures that 100% of students see immediate 4-6 rich sub-topics even before AI research completes.
 */
export const CURATED_CHAPTER_SUBTOPICS: Record<string, string[]> = {
  // Physics
  'kinematics': ['Motion in a Straight Line & Graphs', 'Equations of Motion (Calculus)', 'Vectors & Relative Velocity', 'Projectile Motion', 'Uniform Circular Motion'],
  'motion': ['Newton\'s Laws & Inertial Frames', 'Momentum Conservation & Impulse', 'Friction: Static & Kinetic', 'Dynamics of Circular Motion & Banking'],
  'work': ['Work Done by Constant & Variable Force', 'Work-Energy Theorem & Kinetic Energy', 'Potential Energy & Conservative Forces', 'Power & Elastic/Inelastic Collisions'],
  'rotation': ['Center of Mass & Rigid Body Systems', 'Moment of Inertia & Parallel/Perpendicular Axes', 'Torque & Angular Momentum Conservation', 'Rolling Motion Without Slipping'],
  'gravitation': ['Kepler\'s Laws of Planetary Motion', 'Universal Gravitation & Field Intensity', 'Gravitational Potential Energy & Escape Velocity', 'Earth Satellites & Orbital Mechanics'],
  'thermodynamics': ['Zeroth & First Law of Thermodynamics', 'Isothermal & Adiabatic Gas Processes', 'Second Law & Carnot Engine Efficiency', 'Kinetic Theory of Gases & Mean Free Path'],
  'oscillations': ['Simple Harmonic Motion & Phase Equations', 'Energy in SHM: Kinetic & Potential', 'Simple Pendulum & Spring-Mass Oscillations', 'Damped & Forced Oscillations (Resonance)'],
  'waves': ['Transverse & Longitudinal Wave Equations', 'Principle of Superposition & Standing Waves', 'Beats & Sound Intensity in Organ Pipes', 'Doppler Effect in Sound'],
  'electrostatics': ['Coulomb\'s Law & Electric Field Intensity', 'Gauss\'s Law & Continuous Charge Applications', 'Electric Potential & Equipotential Surfaces', 'Capacitors, Series/Parallel & Dielectric Polarization'],
  'current': ['Ohm\'s Law, Drift Velocity & Resistance', 'Kirchhoff\'s Current & Voltage Laws', 'Wheatstone Bridge & Meter Bridge Analysis', 'Electric Power & Internal Resistance of Cells'],
  'magnetism': ['Biot-Savart Law & Magnetic Field on Axis', 'Ampere\'s Circuital Law & Solenoid/Toroid', 'Lorentz Force & Magnetic Dipole Moment', 'Moving Coil Galvanometer & Conversion'],
  'induction': ['Faraday\'s & Lenz\'s Laws of Induction', 'Self & Mutual Inductance Principles', 'LCR Series Resonance & Power Factor', 'AC Generator & Step-Up/Step-Down Transformers'],
  'optics': ['Refraction at Spherical Surfaces & Lenses', 'Total Internal Reflection & Prism Dispersion', 'Optical Instruments: Microscope & Telescope', 'Wavefront, Huygens Principle & Interference', 'Young\'s Double Slit Experiment & Diffraction'],
  'modern': ['Photoelectric Effect & Einstein\'s Equation', 'Bohr\'s Model of Hydrogen Atom & Spectra', 'Nuclear Binding Energy, Fission & Fusion', 'Semiconductor Diodes, Rectifiers & Logic Gates'],

  // Chemistry
  'atomic': ['Bohr Model & Hydrogen Line Spectrum', 'de Broglie Wavelength & Heisenberg Uncertainty', 'Quantum Numbers & Orbital Shapes', 'Aufbau Principle, Pauli & Hund\'s Rules'],
  'bonding': ['Ionic vs Covalent Bonds (Fajan\'s Rule)', 'VSEPR Theory & Molecular Geometry', 'Hybridization (sp, sp2, sp3, dsp2)', 'Molecular Orbital Theory & Bond Order', 'Hydrogen Bonding & Dipole Moments'],
  'equilibrium': ['Law of Chemical Equilibrium & Kp vs Kc', 'Le Chatelier\'s Principle & Equilibrium Shifts', 'Ionic Product of Water & pH Calculations', 'Buffer Solutions, Hydrolysis & Solubility Product'],
  'redox': ['Oxidation Numbers & Redox Balancing', 'Galvanic Cells & Standard Electrode Potentials', 'Nernst Equation & Gibbs Free Energy', 'Electrolysis & Faraday\'s Laws of Electrolysis'],
  'kinetics': ['Rate of Reaction & Rate Law Expressions', 'Integrated Rate Equations (0th & 1st Order)', 'Half-Life Period & Collision Theory', 'Arrhenius Equation & Activation Energy'],
  'solutions': ['Raoult\'s Law for Volatile & Non-volatile Solutes', 'Colligative Properties & Elevation/Depression', 'Osmotic Pressure & Reverse Osmosis', 'Van\'t Hoff Factor & Abnormal Molar Mass'],
  'coordination': ['Werner\'s Coordination Theory', 'IUPAC Nomenclature & Isomerism in Complexes', 'Valence Bond Theory & Crystal Field Theory (CFT)', 'Color, Magnetic Properties & Synergic Bonding'],
  'organic': ['IUPAC Nomenclature & Structural Isomerism', 'Inductive, Resonance & Hyperconjugation Effects', 'Electrophilic Addition in Alkenes (Markovnikov)', 'Aromaticity & Electrophilic Substitution (Benzene)', 'Nucleophilic Substitution: SN1 vs SN2 Mechanisms'],
  'carbonyl': ['Nucleophilic Addition to Aldehydes & Ketones', 'Aldol Condensation & Cross-Aldol Reactions', 'Cannizzaro Reaction & Haloform Test', 'Carboxylic Acid Acidity & Esterification'],
  'biomolecules': ['Carbohydrates: Monosaccharides & Glycosidic Link', 'Proteins: Amino Acids & Peptide Bond Structure', 'Nucleic Acids: DNA Double Helix & RNA Types', 'Enzymes, Vitamins & Denaturation of Proteins'],

  // Biology
  'living': ['Characteristics of Living Organisms & Taxa', 'Five Kingdom Classification & Monera/Protista', 'Fungi: Phycomycetes, Ascomycetes & Basidiomycetes', 'Viruses, Viroids, Prions & Lichens'],
  'cell': ['Prokaryotic vs Eukaryotic Organelles', 'Cell Membrane: Fluid Mosaic Model', 'Endomembrane System: ER, Golgi & Lysosomes', 'Mitochondria & Chloroplast Ultrastructure', 'Mitosis & Meiosis: Phases & Crossing Over'],
  'photosynthesis': ['Light Reactions & Electron Transport Chain', 'Photophosphorylation: Cyclic & Non-cyclic', 'Calvin Cycle (C3 Pathway) & C4 Pathway', 'Photorespiration & Factors Affecting Photosynthesis'],
  'respiration': ['Glycolysis (EMP Pathway) & Link Reaction', 'Krebs Cycle (Citric Acid Cycle)', 'Electron Transport System (ETS) & Oxidative Phosphorylation', 'Fermentation & Respiratory Quotient (RQ)'],
  'circulation': ['Blood Components, ABO Groups & Rh Factor', 'Human Heart Structure & Cardiac Conduction', 'Cardiac Cycle, Stroke Volume & ECG Waves', 'Double Circulation & Regulation of Cardiac Activity'],
  'genetics': ['Mendel\'s Laws & Monohybrid/Dihybrid Crosses', 'Incomplete Dominance, Codominance & Multiple Alleles', 'Chromosomal Theory of Inheritance & Linkage', 'Sex-Linked Inheritance & Pedigree Analysis', 'DNA Replication: Enzymes & Leading/Lagging Strands', 'Transcription, Genetic Code & Translation (Lac Operon)'],
  'evolution': ['Origin of Life & Miller-Urey Experiment', 'Evidence for Evolution: Homology & Analogy', 'Darwin\'s Theory of Natural Selection', 'Hardy-Weinberg Equilibrium & Genetic Drift'],
  'biotechnology': ['Restriction Enzymes & DNA Ligase Tools', 'Cloning Vectors (pBR322) & Recombinant DNA', 'Polymerase Chain Reaction (PCR) & Gel Electrophoresis', 'Applications: Bt Cotton, Insulin & Gene Therapy'],
  'ecology': ['Organisms & Environmental Abiotic Factors', 'Population Growth Models: Exponential & Logistic', 'Ecosystem Structure: Food Chains & Energy Pyramids', 'Nutrient Cycles & Biodiversity Conservation Strategies'],

  // Mathematics
  'limits': ['Intuitive & Epsilon-Delta Limit Concepts', 'Standard Trigonometric & Exponential Limits', 'L\'Hopital\'s Rule for Indeterminate Forms', 'Continuity on Intervals & Discontinuity Types'],
  'derivatives': ['First Principles Differentiation & Standard Formulas', 'Chain Rule, Product Rule & Implicit Differentiation', 'Logarithmic & Parametric Differentiation', 'Tangents, Normals & Mean Value Theorems (Rolle\'s/LMVT)', 'Monotonicity, Maxima & Minima Optimization'],
  'integrals': ['Indefinite Integration: Substitution & Partial Fractions', 'Integration by Parts (ILATE Rule)', 'Definite Integrals & Fundamental Theorem of Calculus', 'Properties of Definite Integrals (King\'s Property)', 'Area Under Curves & Area Between Two Curves'],
  'differential': ['Order & Degree of Differential Equations', 'Variable Separable Method & Homogeneous Equations', 'Linear Differential Equations (Integrating Factor)', 'Applications in Population Growth & Decay Models'],
  'matrices': ['Matrix Operations & Symmetric/Skew-Symmetric', 'Determinant Properties & Minors/Cofactors', 'Adjoint & Inverse of Square Matrices', 'System of Linear Equations (Cramer\'s Rule & Matrix Inversion)'],
  'vectors': ['Scalar & Vector Components in 3D', 'Dot (Scalar) Product & Orthogonality Conditions', 'Cross (Vector) Product & Area of Parallelograms', 'Scalar Triple Product & Coplanarity of Vectors'],
  '3d': ['Direction Cosines & Direction Ratios', 'Equation of a Line in Space (Vector & Cartesian)', 'Shortest Distance Between Two Skew Lines', 'Equation of a Plane & Angle Between Two Planes'],
  'probability': ['Conditional Probability & Multiplication Theorem', 'Law of Total Probability & Bayes\' Theorem', 'Random Variables & Probability Distributions', 'Binomial Distribution & Expected Value/Variance']
};

/**
 * Intelligently retrieves or synthesizes authentic sub-topics for any given chapter.
 */
export function getSubTopicsForChapter(
  subjectTitle: string,
  chapterTitle: string,
  blueprintSubTopics?: Record<string, string[]>
): string[] {
  let initialTopics: string[] = [];

  // 1. Direct match in researched blueprint
  if (blueprintSubTopics && typeof blueprintSubTopics === 'object') {
    if (Array.isArray(blueprintSubTopics[chapterTitle]) && blueprintSubTopics[chapterTitle].length > 0) {
      initialTopics = blueprintSubTopics[chapterTitle].slice(0, 6);
    } else {
      const cleanChap = chapterTitle.toLowerCase().trim();
      const foundKey = Object.keys(blueprintSubTopics).find(k => {
        const kClean = k.toLowerCase().trim();
        return kClean === cleanChap || kClean.includes(cleanChap) || cleanChap.includes(kClean);
      });
      if (foundKey && Array.isArray(blueprintSubTopics[foundKey]) && blueprintSubTopics[foundKey].length > 0) {
        initialTopics = blueprintSubTopics[foundKey].slice(0, 6);
      }
    }
  }

  // 2. Keyword match against CURATED_CHAPTER_SUBTOPICS
  if (initialTopics.length === 0) {
    const searchStr = `${subjectTitle} ${chapterTitle}`.toLowerCase();
    for (const [key, subTopics] of Object.entries(CURATED_CHAPTER_SUBTOPICS)) {
      if (searchStr.includes(key)) {
        initialTopics = subTopics.slice(0, 6);
        break;
      }
    }
  }

  // 3. Fallback: High-yield pedagogical structure tailored to the chapter title
  if (initialTopics.length === 0) {
    const cleanTitle = chapterTitle.replace(/^CH\s*\d+\s*[:\-–]?\s*/i, '').trim();
    initialTopics = [
      `Foundations & Core Principles of ${cleanTitle}`,
      `Theoretical Laws, Formulas & Derivations`,
      `Analytical Problem Solving & Graphical Analysis`,
      `High-Yield Examination Traps & Applications`
    ];
  }

  // 4. Merge Community & User Verified Custom Topics for this Chapter
  const verifiedList = getVerifiedChapterSubTopics(subjectTitle, chapterTitle);
  if (verifiedList && verifiedList.length > 0) {
    const existingLower = new Set(initialTopics.map(t => t.toLowerCase().trim()));
    const additional = verifiedList.filter(v => !existingLower.has(v.toLowerCase().trim()));
    return [...initialTopics, ...additional];
  }

  return initialTopics;
}

/**
 * Resolves the authentic educational term used for subdivisions (Chapters vs Units vs Domains vs Topics)
 * based on the user's exam board, level, and country.
 */
export function getExamNomenclature(examName?: string, country?: string): { plural: string; singular: string } {
  const normExam = (examName || '').toLowerCase();
  const normCountry = (country || '').toLowerCase();

  // Netherlands / European university entrance (e.g., Colloquium Doctum, VWO, HAVO)
  if (normExam.includes('colloquium') || normExam.includes('doctum') || normExam.includes('vwo') || normExam.includes('havo') || normCountry.includes('netherland') || normCountry.includes('dutch') || normCountry.includes('nl')) {
    return { plural: 'Domains', singular: 'Domain' };
  }

  // International Baccalaureate (IB)
  if (normExam.includes('ib') || normExam.includes('baccalaureate')) {
    return { plural: 'Themes', singular: 'Theme' };
  }

  // UK & Commonwealth (GCSE, A-Levels, Cambridge, Edexcel, Ofqual)
  if (normExam.includes('gcse') || normExam.includes('a-level') || normExam.includes('alevel') || normCountry.includes('uk') || normCountry.includes('united kingdom') || normCountry.includes('britain')) {
    return { plural: 'Topics', singular: 'Topic' };
  }

  // USA Standardized & AP (College Board AP, SAT, ACT)
  if (normExam.includes('ap ') || normExam.startsWith('ap') || normExam.includes('advanced placement') || normExam.includes('sat') || normExam.includes('act') || normCountry.includes('usa') || normCountry.includes('us')) {
    return { plural: 'Units', singular: 'Unit' };
  }

  // India & National Systems (CBSE, ICSE, NEET, JEE, State Boards)
  if (normCountry.includes('india') || normExam.includes('neet') || normExam.includes('jee') || normExam.includes('cbse') || normExam.includes('icse') || normExam.includes('upsc')) {
    if (normExam.includes('neet') || normExam.includes('jee')) {
      return { plural: 'Units', singular: 'Unit' };
    }
    return { plural: 'Chapters', singular: 'Chapter' };
  }

  // Medical / Professional
  if (normExam.includes('usmle') || normExam.includes('plab') || normExam.includes('mcat') || normExam.includes('nclex')) {
    return { plural: 'Modules', singular: 'Module' };
  }

  // Default international standard
  return { plural: 'Chapters', singular: 'Chapter' };
}

/**
 * Strips exam names, parentheticals, and verbose prefix noise from subject titles
 * so students instantly recognize the subject (e.g. "Mathematics A", "Physics").
 */
export function cleanSubjectTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  let clean = rawTitle.trim();

  // Pattern 1: Leading exam name with parentheses and colon: "Colloquium Doctum (Entrance Exam): Mathematics A"
  clean = clean.replace(/^[^(:]+\([^)]*\)\s*:\s*/i, '');

  // Pattern 2: Any prefix before a colon: e.g. "CBSE Class 12: Chemistry" -> "Chemistry"
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const candidate = parts[parts.length - 1].trim();
    if (candidate.length >= 2) {
      clean = candidate;
    }
  }

  // Pattern 3: Leading exam name with parentheses and hyphen: "Colloquium Doctum (...) - Mathematics A"
  clean = clean.replace(/^[^(–—\-]+\([^)]*\)\s*[–—\-]\s*/i, '');

  // Pattern 4: Strip leading exam names with dash: e.g. "Colloquium Doctum - Mathematics"
  if (clean.includes(' - ') || clean.includes(' – ') || clean.includes(' — ')) {
    const parts = clean.split(/\s+[–—\-]\s+/);
    const rightPart = parts[parts.length - 1].trim();
    if (rightPart.length >= 2) {
      clean = rightPart;
    }
  }

  // Pattern 5: Strip trailing exam name in parentheses: e.g. "Mathematics A (Colloquium Doctum)" -> "Mathematics A"
  clean = clean.replace(/\s*\([^)]*(?:Exam|Examination|Board|Level|Grade|Colloquium|Curriculum|Course|Entrance)[^)]*\)\s*/gi, ' ').trim();

  // Remove duplicate internal whitespace
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean || rawTitle.trim();
}

// Main dynamic curriculum resolver
export function getScalableRelevantQuizzes(grade: string, track: string, countryRegion: string = 'USA') {
  // 1. Dynamic Check: Prioritize user's chosen subjects & calibrated exam blueprint 100%!
  const uid = auth.currentUser?.uid || safeGetItem('last_logged_in_user') || '';
  const blueprint = getStoredExamBlueprint(uid);
  const targetExam = (uid ? safeGetItem(`academic_exam_${uid}`) : null)
    || (!uid ? (safeGetItem('academic_exam') || safeGetItem('target_exam')) : '')
    || '';
  const nomenclature = getExamNomenclature(targetExam, countryRegion);

  // 2. Gather ONLY the subjects the user explicitly chosen in their academic setup / profile
  let chosenSubjects: string[] = [];

  const rawSubjs = uid ? safeGetItem(`academic_subjects_${uid}`) : safeGetItem('academic_subjects');
  if (rawSubjs) {
    try {
      const parsed = JSON.parse(rawSubjs);
      if (Array.isArray(parsed) && parsed.length > 0) {
        chosenSubjects = parsed.map(s => String(s).trim()).filter(Boolean);
      }
    } catch (_) {
      const split = rawSubjs.split(',').map(s => s.trim()).filter(Boolean);
      if (split.length > 0) chosenSubjects = split;
    }
  }

  // Fallback to single subject ONLY if user has no explicit multi-subject list
  if (chosenSubjects.length === 0) {
    const rawSingle = uid 
      ? (safeGetItem(`academic_subject_${uid}`) || safeGetItem(`selected_subject_${uid}`) || safeGetItem(`subject_${uid}`))
      : (safeGetItem('academic_subject') || safeGetItem('selected_subject') || safeGetItem('subject'));
    if (rawSingle) {
      chosenSubjects = rawSingle.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  const subjectsList: { rawKey: string; cleanTitle: string }[] = [];
  const seenClean = new Set<string>();

  const addSubjectCandidate = (cand: string) => {
    const raw = (cand || '').trim();
    if (!raw) return;
    const clean = cleanSubjectTitle(raw);
    const lowerClean = clean.toLowerCase();
    if (!seenClean.has(lowerClean)) {
      seenClean.add(lowerClean);
      subjectsList.push({ rawKey: raw, cleanTitle: clean });
    }
  };

  if (chosenSubjects.length > 0) {
    // ⭐️ USER CHOSEN SUBJECTS: STRICTLY and ONLY render the subjects chosen by the user!
    // Never append unchosen subjects from blueprint or foreign defaults!
    chosenSubjects.forEach(s => addSubjectCandidate(s));
  } else if (blueprint && typeof blueprint === 'object' && Object.keys(blueprint).length > 0) {
    // Fallback ONLY when user has not configured any subjects:
    Object.keys(blueprint).forEach(k => addSubjectCandidate(k));
  }

  // If user has chosen subjects, ALWAYS render their chosen subjects with clean names!
  if (subjectsList.length > 0) {
    return subjectsList.map(({ rawKey, cleanTitle }, idx) => {
      // Find matching blueprint entry (case-insensitive or partial)
      let bpMatch = null;
      if (blueprint && typeof blueprint === 'object') {
        const cleanTarget = cleanTitle.toLowerCase().trim();
        const foundKey = Object.keys(blueprint).find(k => {
          const cleanK = cleanSubjectTitle(k).toLowerCase().trim();
          const rawK = k.toLowerCase().trim();
          return cleanK === cleanTarget || rawK.includes(cleanTarget) || cleanTarget.includes(cleanK);
        });
        if (foundKey) bpMatch = blueprint[foundKey];
      }

      const curated = getCuratedUnitsForSubject(cleanTitle);

      // Prefer live-researched coreUnits from blueprint if available and has >= 4 units; otherwise use curated units
      const topics = (bpMatch && Array.isArray(bpMatch.coreUnits) && bpMatch.coreUnits.length >= 4)
        ? bpMatch.coreUnits
        : curated.units;

      const subNomenclature = bpMatch?.nomenclature || nomenclature.plural;
      const subSingular = (bpMatch?.nomenclature ? bpMatch.nomenclature.replace(/s$/, '') : nomenclature.singular);

      // Populate authentic, exam-aligned sub-topics for every single chapter in this subject
      const chapterSubTopics: Record<string, string[]> = {};
      topics.forEach(chap => {
        chapterSubTopics[chap] = getSubTopicsForChapter(cleanTitle, chap, bpMatch?.subTopics);
      });

      return {
        id: `user_subj_${idx}_${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        key: `user_subj_${idx}_${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        title: cleanTitle,
        subtitle: '', // Strictly no verbose descriptions per student UX mandate
        themeColor: curated.themeColor,
        icon: curated.icon,
        topics,
        chapterSubTopics,
        nomenclature: subNomenclature,
        singularNomenclature: subSingular,
        isCore: true,
        tierLabel: ''
      };
    });
  }
  const normalizedCountry = countryRegion === 'US' || countryRegion === 'USA' ? 'USA' :
                             countryRegion === 'UK' ? 'UK' :
                             countryRegion === 'CA' || countryRegion === 'Canada' ? 'CA' :
                             countryRegion === 'AU' || countryRegion === 'Australia' ? 'AU' : 'Global';

  const gradeGroup = getGradeTierGroup(grade);
  let finalQuizzes = [];

  if (normalizedCountry === 'CA' && gradeGroup === '11-12') {
    const isGrade11 = (grade || '').toLowerCase().includes('11th');
    if (isGrade11) {
      finalQuizzes = [
        { key: 'ca_mcr3u', title: 'Functions (MCR3U)', subtitle: 'Ontario Grade 11 Functions (MCR3U)', icon: '📐', topics: ['Quadratic Relations', 'Exponential Functions', 'Trigonometric Ratios', 'Sequences & Series'] },
        { key: 'ca_sph3u', title: 'Grade 11 Physics (SPH3U)', subtitle: 'Ontario Grade 11 Physics (SPH3U)', icon: '🚀', topics: ['Kinematics & Forces', 'Work, Energy & Power', 'Waves & Sound', 'Electricity & Magnetism'] },
        { key: 'ca_sbi3u', title: 'Grade 11 Biology (SBI3U)', subtitle: 'Ontario Grade 11 Biology (SBI3U)', icon: '🧬', topics: ['Diversity of Living Things', 'Evolutionary Biology', 'Genetic Processes', 'Anatomy of Animals'] },
        { key: 'ca_sch3u', title: 'Grade 11 Chemistry (SCH3U)', subtitle: 'Ontario Grade 11 Chemistry (SCH3U)', icon: '🧪', topics: ['Matter & Bonding', 'Chemical Reactions', 'Quantities in Chemical Reactions', 'Solutions & Solubility'] }
      ];
    } else {
      finalQuizzes = [
        { key: 'ca_mhf4u', title: 'Advanced Functions (MHF4U)', subtitle: 'Ontario Grade 12 Advanced Functions (MHF4U)', icon: '📐', topics: ['Polynomial Functions', 'Rational Functions', 'Trigonometric Functions', 'Exponential Functions'] },
        { key: 'ca_mcv4u', title: 'Calculus and Vectors (MCV4U)', subtitle: 'Ontario MCV4U Curriculum', icon: '📐', topics: ['Limits', 'Derivatives', 'Vector Planes', 'Lines & Intersection'] },
        { key: 'ca_sph4u', title: 'Grade 12 Physics (SPH4U)', subtitle: 'University Preparation Physics (SPH4U)', icon: '🚀', topics: ['Forces & Dynamics', 'Energy & Momentum', 'Gravitational Fields', 'Light Waves & Optics'] },
        { key: 'ca_sbi4u', title: 'Grade 12 Biology (SBI4U)', subtitle: 'Ontario Grade 12 Biology (SBI4U)', icon: '🧬', topics: ['Biochemistry', 'Metabolic Processes', 'Molecular Genetics', 'Homeostasis'] }
      ];
    }
  } else {
    const trackMap = MASTER_CURRICULUM_MAP[normalizedCountry] || MASTER_CURRICULUM_MAP['Global'];
    const gradeMap = trackMap[gradeGroup] || trackMap['11-12'];
    
    // Find track specific subjects
    finalQuizzes = gradeMap[track] || gradeMap['STEM / Engineering'] || [];
    
    // If track has fewer than 4 items, let's pad it with key subjects from other tracks to keep it consistently high-fidelity (4 items)
    if (finalQuizzes.length < 4) {
      const allItemsInGrade = Object.values(gradeMap).flat();
      const uniqueMap = new Map<string, typeof finalQuizzes[0]>();
      finalQuizzes.forEach(item => uniqueMap.set(item.key, item));
      
      for (const item of allItemsInGrade) {
        if (uniqueMap.size >= 4) break;
        uniqueMap.set(item.key, item);
      }
      finalQuizzes = Array.from(uniqueMap.values());
    }
  }

  // Map to the required UI presentation schema
  return finalQuizzes.map(item => {
    const cleanTitle = cleanSubjectTitle(item.title);
    return {
      id: item.key,
      key: item.key,
      title: cleanTitle,
      subtitle: '', // Strictly no verbose descriptions per student UX mandate
      themeColor: item.key.includes('math') || item.key.includes('calc') || item.key.includes('functions') || item.key.includes('mcr3u') || item.key.includes('mhf4u') || item.key.includes('mcv4u') ? 'bg-blue-50/70 text-blue-600 border-blue-100' :
                  item.key.includes('sci') || item.key.includes('physics') || item.key.includes('sph') ? 'bg-indigo-50/70 text-indigo-600 border-indigo-100' :
                  item.key.includes('bio') || item.key.includes('biology') || item.key.includes('sbi') ? 'bg-emerald-50/70 text-emerald-600 border-emerald-100' :
                  item.key.includes('cs') || item.key.includes('programming') || item.key.includes('ics') ? 'bg-cyan-50/70 text-cyan-600 border-cyan-100' :
                  'bg-purple-50/70 text-purple-600 border-purple-100',
      icon: item.icon,
      topics: item.topics,
      nomenclature: nomenclature.plural,
      singularNomenclature: nomenclature.singular,
      isCore: true,
      tierLabel: ''
    };
  });
}
