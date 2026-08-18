export interface CurriculumSubject {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  themeColor: string;
  icon: string;
  topics: string[];
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

// Main dynamic curriculum resolver
export function getScalableRelevantQuizzes(grade: string, track: string, countryRegion: string = 'USA') {
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
    return {
      id: item.key,
      key: item.key,
      title: item.title,
      subtitle: item.subtitle,
      themeColor: item.key.includes('math') || item.key.includes('calc') || item.key.includes('functions') || item.key.includes('mcr3u') || item.key.includes('mhf4u') || item.key.includes('mcv4u') ? 'bg-blue-50/70 text-blue-600 border-blue-100' :
                  item.key.includes('sci') || item.key.includes('physics') || item.key.includes('sph') ? 'bg-indigo-50/70 text-indigo-600 border-indigo-100' :
                  item.key.includes('bio') || item.key.includes('biology') || item.key.includes('sbi') ? 'bg-emerald-50/70 text-emerald-600 border-emerald-100' :
                  item.key.includes('cs') || item.key.includes('programming') || item.key.includes('ics') ? 'bg-cyan-50/70 text-cyan-600 border-cyan-100' :
                  'bg-purple-50/70 text-purple-600 border-purple-100',
      icon: item.icon,
      topics: item.topics,
      isCore: item.key.includes('math') || item.key.includes('reading') || item.key.includes('english') || item.key.includes('functions') || item.key.includes('mcr3u') || item.key.includes('mhf4u') || item.key.includes('mcv4u'),
      tierLabel: gradeGroup === '9-10' ? 'High School (9-10)' : gradeGroup === '11-12' ? 'Senior High (11-12)' : 'College 101'
    };
  });
}
