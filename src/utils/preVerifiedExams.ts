export interface PreVerifiedExam {
  aliases: string[];
  officialExamName: string;
  country: string;
  hasElectives: boolean;
  grades: Array<{ id: string; label: string; desc: string; isCollege: boolean }>;
  subjects: Array<{ id: string; title: string; subtitle: string; icon: string }>;
}

export const PRE_VERIFIED_EXAMS: PreVerifiedExam[] = [
  {
    aliases: ['ssc cgl', 'ssc cgl exam', 'ssc-cgl', 'cgl', 'staff selection commission cgl', 'ssc cgl 2025', 'ssc cgl 2026'],
    officialExamName: 'Staff Selection Commission Combined Graduate Level (SSC CGL)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Graduate_Final_Year', label: 'Final Year Undergraduate', desc: 'Appearing in final year of Graduation', isCollege: true },
      { id: 'Graduate_Full_Time', label: 'Graduate Aspirant (Full-Time)', desc: 'Dedicated full-time SSC CGL preparation', isCollege: true },
      { id: 'Working_Professional', label: 'Working Professional', desc: 'Preparing along with employment', isCollege: true }
    ],
    subjects: [
      { id: 'Quantitative_Aptitude', title: 'Quantitative Aptitude (Math)', subtitle: 'Arithmetic, Advanced Math, Algebra & Geometry', icon: '📐' },
      { id: 'General_Intelligence_Reasoning', title: 'General Intelligence & Reasoning', subtitle: 'Analogies, Syllogisms, Coding-Decoding & Puzzles', icon: '🧠' },
      { id: 'English_Comprehension', title: 'English Comprehension & Grammar', subtitle: 'Vocabulary, Grammar, Error Spotting & Reading Comprehension', icon: '📚' },
      { id: 'General_Awareness', title: 'General Awareness (GK & GS)', subtitle: 'History, Polity, Geography, Economy & Current Affairs', icon: '🏛️' }
    ]
  },
  {
    aliases: ['ssc chsl', 'ssc chsl exam', 'ssc-chsl', 'chsl', 'ssc 10+2'],
    officialExamName: 'Staff Selection Commission Combined Higher Secondary Level (SSC CHSL)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class_12', label: 'Class 12 / 10+2 Passed', desc: '12th Appearing or Completed Aspirant', isCollege: false },
      { id: 'Full_Time_Aspirant', label: 'Full-Time CHSL Aspirant', desc: 'Dedicated Government Exam Preparation', isCollege: false }
    ],
    subjects: [
      { id: 'Quantitative_Aptitude', title: 'Quantitative Aptitude', subtitle: 'Basic Arithmetic & Number Systems', icon: '📐' },
      { id: 'General_Intelligence', title: 'General Intelligence & Reasoning', subtitle: 'Verbal & Non-Verbal Reasoning', icon: '🧠' },
      { id: 'English_Language', title: 'English Language', subtitle: 'Grammar, Vocab & Comprehension', icon: '📚' },
      { id: 'General_Awareness', title: 'General Awareness', subtitle: 'Current Affairs & Static GK', icon: '🏛️' }
    ]
  },
  {
    aliases: ['banking', 'bank po', 'bank clerk', 'ibps po', 'sbi po', 'ibps clerk', 'sbi clerk', 'bank exam', 'rbi grade b'],
    officialExamName: 'Banking Recruitment Examinations (IBPS / SBI PO & Clerk)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Graduate_Aspirant', label: 'Graduate Aspirant', desc: 'Full-time Banking Preparation', isCollege: true },
      { id: 'Final_Year_Student', label: 'Final Year Student', desc: 'Pre-Banking College Preparation', isCollege: true }
    ],
    subjects: [
      { id: 'Quantitative_Aptitude', title: 'Quantitative Aptitude', subtitle: 'Data Interpretation, Arithmetic & Series', icon: '📐' },
      { id: 'Reasoning_Ability', title: 'Reasoning Ability', subtitle: 'Puzzles, Seating Arrangements & Logic', icon: '🧠' },
      { id: 'English_Language', title: 'English Language', subtitle: 'Reading Comprehension, Cloze Test & Grammar', icon: '📚' },
      { id: 'Banking_Awareness', title: 'Banking & Financial Awareness', subtitle: 'Economy, RBI Guidelines & Current Affairs', icon: '🏦' }
    ]
  },
  {
    aliases: ['rrb ntpc', 'railway exam', 'rrb', 'ntpc', 'rrb group d', 'railway recruitment'],
    officialExamName: 'Railway Recruitment Board NTPC (RRB NTPC)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Graduate_Level', label: 'Graduate Level NTPC', desc: 'Station Master, Goods Guard, etc.', isCollege: true },
      { id: 'Undergraduate_Level', label: 'Undergraduate Level (10+2)', desc: 'Junior Clerk, Trains Clerk, etc.', isCollege: false }
    ],
    subjects: [
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Number System, Decimals, Fractions, LCM & Ratio', icon: '📐' },
      { id: 'General_Intelligence_Reasoning', title: 'General Intelligence and Reasoning', subtitle: 'Analogies, Syllogisms, Coding & Venn Diagrams', icon: '🧠' },
      { id: 'General_Awareness', title: 'General Awareness', subtitle: 'Current Events, General Science, History & Polity', icon: '🌍' }
    ]
  },
  {
    aliases: ['neet', 'neet ug', 'neet 2025', 'neet 2026', 'neet exam', 'neet ug national eligibility', 'national eligibility cum entrance test'],
    officialExamName: 'NEET UG (National Eligibility cum Entrance Test)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class 12', label: 'Class 12', desc: '12th Board Appearing & Senior Secondary', isCollege: false },
      { id: 'Class 11', label: 'Class 11', desc: '11th Grade / 1st Year Entrance Prep', isCollege: false },
      { id: 'Dropper / Repeater', label: 'Dropper / Repeater', desc: 'Dedicated Full-Time Preparation / Gap Year', isCollege: false },
      { id: 'Class 10', label: 'Class 10', desc: 'Pre-Foundation & Early Prep', isCollege: false }
    ],
    subjects: [
      { id: 'Physics', title: 'Physics', subtitle: 'Mechanics, Electrodynamics, Modern Physics, Optics', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry', subtitle: 'Physical, Organic & Inorganic Chemistry', icon: '🧪' },
      { id: 'Biology', title: 'Biology', subtitle: 'Botany & Zoology, Human Physiology, Genetics', icon: '🧬' }
    ]
  },
  {
    aliases: ['jee', 'jee main', 'jee mains', 'iit jee', 'jee main 2025', 'jee main 2026', 'iit jee main', 'joint entrance examination'],
    officialExamName: 'JEE Main (Joint Entrance Examination)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class 12', label: 'Class 12', desc: '12th Board Appearing & JEE Aspirant', isCollege: false },
      { id: 'Class 11', label: 'Class 11', desc: '11th Grade / 1st Year Entrance Prep', isCollege: false },
      { id: 'Dropper / Repeater', label: 'Dropper / Repeater', desc: 'Full-Time Dedicated JEE Preparation', isCollege: false },
      { id: 'Class 10', label: 'Class 10', desc: 'Pre-Foundation & Early Prep', isCollege: false }
    ],
    subjects: [
      { id: 'Physics', title: 'Physics', subtitle: 'Mechanics, Thermodynamics, Electromagnetism, Modern Physics', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry', subtitle: 'Physical, Inorganic, and Organic Chemistry', icon: '🧪' },
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Calculus, Algebra, Coordinate Geometry, Vectors', icon: '📐' }
    ]
  },
  {
    aliases: ['jee adv', 'jee advanced', 'iit jee advanced'],
    officialExamName: 'JEE Advanced (Joint Entrance Examination Advanced)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class 12', label: 'Class 12', desc: '12th Board Appearing & JEE Advanced Prep', isCollege: false },
      { id: 'Class 11', label: 'Class 11', desc: '11th Grade Foundation', isCollege: false },
      { id: 'Dropper / Repeater', label: 'Dropper / Repeater', desc: 'Dedicated Full-Time JEE Advanced Aspirant', isCollege: false }
    ],
    subjects: [
      { id: 'Physics', title: 'Physics', subtitle: 'Advanced Mechanics, Waves, Electrodynamics & Modern Physics', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry', subtitle: 'Advanced Physical, Organic Synthesis & Coordination', icon: '🧪' },
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Advanced Calculus, Complex Numbers, Vectors & 3D', icon: '📐' }
    ]
  },
  {
    aliases: ['cbse 12', 'cbse 12th', 'cbse class 12', 'cbse board 12', 'class 12 cbse', 'cbse boards'],
    officialExamName: 'CBSE Class 12 Board Examination',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Class 12', label: 'Class 12', desc: '12th Senior Secondary Board Year', isCollege: false },
      { id: 'Class 11', label: 'Class 11', desc: '11th Senior Secondary Foundation', isCollege: false }
    ],
    subjects: [
      { id: 'Physics', title: 'Physics', subtitle: 'Electrostatics, Optics, Magnetism & Modern Physics', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry', subtitle: 'Solutions, Electrochemistry, Organic & Coordination', icon: '🧪' },
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Calculus, Relations & Functions, Vectors & 3D', icon: '📐' },
      { id: 'Biology', title: 'Biology', subtitle: 'Reproduction, Genetics, Evolution & Biotechnology', icon: '🧬' },
      { id: 'Computer Science', title: 'Computer Science', subtitle: 'Python, Computational Thinking, SQL & Networks', icon: '💻' },
      { id: 'English Core', title: 'English Core', subtitle: 'Reading Comprehension, Creative Writing & Literature', icon: '📚' }
    ]
  },
  {
    aliases: ['cbse 10', 'cbse 10th', 'cbse class 10', 'class 10 cbse', 'cbse board 10', 'cbse'],
    officialExamName: 'CBSE Class 10 Board Examination',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Class 10', label: 'Class 10', desc: '10th Secondary Board Exam Year', isCollege: false },
      { id: 'Class 9', label: 'Class 9', desc: '9th Pre-Board Secondary Foundation', isCollege: false }
    ],
    subjects: [
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Real Numbers, Polynomials, Trigonometry & Geometry', icon: '📐' },
      { id: 'Science', title: 'Science', subtitle: 'Chemical Reactions, Life Processes, Light & Electricity', icon: '🔬' },
      { id: 'Social Science', title: 'Social Science', subtitle: 'History, Geography, Political Science & Economics', icon: '🌍' },
      { id: 'English Language & Literature', title: 'English Language & Literature', subtitle: 'Reading, Writing & Literature Textbooks', icon: '📚' }
    ]
  },
  {
    aliases: ['icse', 'icse class 10', 'icse 10th', 'icse board'],
    officialExamName: 'ICSE Class 10 (Indian Certificate of Secondary Education)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Class 10', label: 'Class 10', desc: 'ICSE Class 10 Board Year', isCollege: false },
      { id: 'Class 9', label: 'Class 9', desc: 'Class 9 Foundation Prep', isCollege: false }
    ],
    subjects: [
      { id: 'English', title: 'English Language & Literature', subtitle: 'Grammar, Essay & Drama Analysis', icon: '📚' },
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Commercial Math, Algebra, Geometry & Mensuration', icon: '📐' },
      { id: 'Physics', title: 'Physics', subtitle: 'Force, Work, Light, Sound & Electricity', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry', subtitle: 'Periodic Properties, Chemical Bonding & Acids', icon: '🧪' },
      { id: 'Biology', title: 'Biology', subtitle: 'Basic Biology, Plant & Human Physiology', icon: '🧬' }
    ]
  },
  {
    aliases: ['upsc', 'upsc cse', 'civil services', 'ias', 'ips', 'ias exam'],
    officialExamName: 'UPSC Civil Services Examination (CSE)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Full-Time Aspirant', label: 'Full-Time Aspirant', desc: 'Dedicated CSE Preparation', isCollege: true },
      { id: 'College Final Year', label: 'College Final Year', desc: 'Undergraduate Aspirant', isCollege: true }
    ],
    subjects: [
      { id: 'General Studies I', title: 'General Studies I', subtitle: 'Indian Heritage, History, Geography & Society', icon: '🏛️' },
      { id: 'General Studies II', title: 'General Studies II (CSAT & Polity)', subtitle: 'Constitution, Governance, Polity & Reasoning', icon: '⚖️' },
      { id: 'General Studies III', title: 'General Studies III', subtitle: 'Economy, Agriculture, Science & Security', icon: '📊' },
      { id: 'General Studies IV', title: 'General Studies IV (Ethics)', subtitle: 'Ethics, Integrity & Aptitude Case Studies', icon: '🧠' }
    ]
  },
  {
    aliases: ['sat', 'digital sat', 'psat'],
    officialExamName: 'SAT (Digital Scholastic Assessment Test)',
    country: 'United States',
    hasElectives: false,
    grades: [
      { id: '11th Grade (Junior)', label: '11th Grade', desc: 'Prime SAT Testing Year', isCollege: false },
      { id: '12th Grade (Senior)', label: '12th Grade', desc: 'Final Fall SAT Attempts', isCollege: false }
    ],
    subjects: [
      { id: 'Reading and Writing', title: 'Reading and Writing', subtitle: 'Craft and Structure, Information and Ideas, Expression of Ideas', icon: '📖' },
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Algebra, Advanced Math, Problem-Solving & Geometry', icon: '📐' }
    ]
  },
  {
    aliases: ['act', 'act exam'],
    officialExamName: 'ACT (American College Testing)',
    country: 'United States',
    hasElectives: false,
    grades: [
      { id: '11th Grade (Junior)', label: '11th Grade', desc: 'Prime ACT Testing Year', isCollege: false },
      { id: '12th Grade (Senior)', label: '12th Grade', desc: 'Final ACT Attempts', isCollege: false }
    ],
    subjects: [
      { id: 'English', title: 'English', subtitle: 'Usage, Mechanics & Rhetorical Skills', icon: '✍️' },
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Pre-Algebra, Algebra, Coordinate Geometry', icon: '📐' },
      { id: 'Reading', title: 'Reading', subtitle: 'Prose Fiction, Social Studies, Humanities', icon: '📖' },
      { id: 'Science', title: 'Science', subtitle: 'Data Representation, Research Summaries', icon: '🔬' }
    ]
  },
  {
    aliases: ['nda', 'national defence academy'],
    officialExamName: 'NDA (National Defence Academy Examination)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class 12', label: 'Class 12', desc: '12th Appearing Defence Aspirant', isCollege: false },
      { id: 'Class 11', label: 'Class 11', desc: 'Early NDA Foundation', isCollege: false }
    ],
    subjects: [
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Algebra, Trigonometry, Calculus, Vectors & Statistics', icon: '📐' },
      { id: 'General Ability Test', title: 'General Ability Test (GAT)', subtitle: 'English Grammar, Physics, Chemistry, History & Current Affairs', icon: '🛡️' }
    ]
  },
  {
    aliases: ['cat', 'cat exam', 'iim cat'],
    officialExamName: 'CAT (Common Admission Test for MBA)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Final Year Undergrad', label: 'Final Year Undergrad', desc: 'College Pre-MBA Aspirant', isCollege: true },
      { id: 'Dedicated Gap Year', label: 'Dedicated Gap Year', desc: 'Full-Time MBA Prep', isCollege: true }
    ],
    subjects: [
      { id: 'VARC', title: 'Verbal Ability & Reading Comprehension (VARC)', subtitle: 'RC Passages, Parajumbles, Summary & Sentence Completion', icon: '📚' },
      { id: 'DILR', title: 'Data Interpretation & Logical Reasoning (DILR)', subtitle: 'Caselets, Tables, Graphs, Puzzles & Seating Arrangements', icon: '📊' },
      { id: 'QA', title: 'Quantitative Ability (QA)', subtitle: 'Arithmetic, Algebra, Geometry & Modern Math', icon: '📐' }
    ]
  },
  {
    aliases: ['gate', 'gate exam'],
    officialExamName: 'GATE (Graduate Aptitude Test in Engineering)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'B.Tech / B.E. Final Year', label: 'B.Tech / B.E. Final Year', desc: 'Graduation Year Aspirant', isCollege: true },
      { id: 'College Graduate', label: 'College Graduate', desc: 'Full-Time GATE Aspirant', isCollege: true }
    ],
    subjects: [
      { id: 'Engineering Mathematics', title: 'Engineering Mathematics & Aptitude', subtitle: 'Discrete Math, Linear Algebra, Calculus & Aptitude', icon: '📐' },
      { id: 'Core Engineering Discipline', title: 'Core Engineering Discipline', subtitle: 'Subject-specific specialization papers', icon: '⚙️' }
    ]
  }
];

export function findPreVerifiedExam(inputExam: string, _userCountry?: string): PreVerifiedExam | null {
  if (!inputExam || typeof inputExam !== 'string') return null;
  const clean = inputExam.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  for (const entry of PRE_VERIFIED_EXAMS) {
    for (const alias of entry.aliases) {
      const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      if (clean === cleanAlias || clean.startsWith(cleanAlias) || cleanAlias.startsWith(clean)) {
        return entry;
      }
      if (clean.includes(cleanAlias)) {
        return entry;
      }
    }
  }

  // Token-level semantic matching
  if (words.includes('cgl')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('SSC CGL')) || null;
  }
  if (words.includes('chsl')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('SSC CHSL')) || null;
  }
  if (words.includes('ssc')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('SSC CGL')) || null;
  }
  if (words.includes('neet')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('NEET UG')) || null;
  }
  if (words.includes('jee')) {
    if (words.includes('advanced') || words.includes('adv')) {
      return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('JEE Advanced')) || null;
    }
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('JEE Main')) || null;
  }
  if (words.includes('cbse')) {
    if (words.includes('10') || words.includes('10th') || words.includes('x')) {
      return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('CBSE Class 10')) || null;
    }
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('CBSE Class 12')) || null;
  }
  if (words.includes('icse')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('ICSE Class 10')) || null;
  }
  if (words.includes('upsc') || words.includes('ias')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('UPSC')) || null;
  }
  if (words.includes('sat')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('SAT')) || null;
  }
  if (words.includes('act')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('ACT')) || null;
  }
  if (words.includes('cat')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('CAT')) || null;
  }
  if (words.includes('gate')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('GATE')) || null;
  }
  if (words.includes('bank') || words.includes('ibps') || words.includes('sbi')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('Banking')) || null;
  }
  if (words.includes('rrb') || words.includes('railway') || words.includes('ntpc')) {
    return PRE_VERIFIED_EXAMS.find(e => e.officialExamName.includes('Railway')) || null;
  }

  return null;
}

