export interface PreVerifiedExam {
  aliases: string[];
  shortName?: string;
  officialExamName: string;
  country: string;
  hasElectives: boolean;
  grades: Array<{ id: string; label: string; desc: string; isCollege: boolean }>;
  subjects: Array<{ id: string; title: string; subtitle: string; icon: string }>;
}

export const PRE_VERIFIED_EXAMS: PreVerifiedExam[] = [
  // 1. SSC CGL
  {
    aliases: ['ssc cgl', 'ssc cgl exam', 'ssc-cgl', 'cgl', 'staff selection commission cgl', 'ssc cgl 2025', 'ssc cgl 2026', 'ssc combined graduate level'],
    shortName: 'SSC CGL',
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

  // 2. SSC CHSL
  {
    aliases: ['ssc chsl', 'ssc chsl exam', 'ssc-chsl', 'chsl', 'ssc 10+2', 'combined higher secondary level'],
    shortName: 'SSC CHSL',
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

  // 3. SSC MTS & Havaldar
  {
    aliases: ['ssc mts', 'mts', 'ssc multi tasking', 'havaldar', 'ssc mts havaldar'],
    shortName: 'SSC MTS',
    officialExamName: 'Staff Selection Commission Multi-Tasking Staff (SSC MTS & Havaldar)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class_10_Passed', label: 'Class 10 Matriculation Passed', desc: 'Matric Pass Aspirant', isCollege: false },
      { id: 'Dedicated_Aspirant', label: 'Dedicated Full-Time Aspirant', desc: 'Early Govt Career Preparation', isCollege: false }
    ],
    subjects: [
      { id: 'Numerical_Mathematical_Ability', title: 'Numerical & Mathematical Ability', subtitle: 'Integers, Whole Numbers, LCM, HCF & Percentage', icon: '📐' },
      { id: 'Reasoning_Problem_Solving', title: 'Reasoning Ability & Problem Solving', subtitle: 'Alpha-numeric series, Coding, Analogies & Directions', icon: '🧠' },
      { id: 'General_Awareness', title: 'General Awareness', subtitle: 'Social Studies, General Science & Environmental Studies', icon: '🏛️' },
      { id: 'English_Language_Comprehension', title: 'English Language and Comprehension', subtitle: 'Vocabulary, Grammar, Sentence structure & Reading', icon: '📚' }
    ]
  },

  // 4. SSC GD Constable
  {
    aliases: ['ssc gd', 'ssc gd constable', 'gd constable', 'capf gd'],
    shortName: 'SSC GD',
    officialExamName: 'Staff Selection Commission General Duty Constable (SSC GD)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class_10_Matric', label: 'Class 10 Matric Passed', desc: 'Defence / Paramilitary Aspirant', isCollege: false },
      { id: 'Dedicated_Constable_Prep', label: 'Full-Time GD Aspirant', desc: 'Paramilitary Force Preparation', isCollege: false }
    ],
    subjects: [
      { id: 'General_Intelligence_Reasoning', title: 'General Intelligence & Reasoning', subtitle: 'Visual memory, Spatial orientation & Analogies', icon: '🧠' },
      { id: 'General_Knowledge_Awareness', title: 'General Knowledge & General Awareness', subtitle: 'India & neighboring countries, History & Geography', icon: '🏛️' },
      { id: 'Elementary_Mathematics', title: 'Elementary Mathematics', subtitle: 'Number systems, Averages, Ratio & Time-Work', icon: '📐' },
      { id: 'English_Hindi', title: 'English / Hindi Language', subtitle: 'Basic comprehension, Grammar & Vocabulary', icon: '📚' }
    ]
  },

  // 5. Banking (IBPS, SBI PO & Clerk)
  {
    aliases: ['banking', 'bank po', 'bank clerk', 'ibps po', 'sbi po', 'ibps clerk', 'sbi clerk', 'bank exam', 'rbi grade b', 'rrb po', 'rrb clerk'],
    shortName: 'Banking Exams',
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

  // 6. Railway RRB NTPC & Group D
  {
    aliases: ['rrb ntpc', 'railway exam', 'rrb', 'ntpc', 'rrb group d', 'railway recruitment', 'rrb alp'],
    shortName: 'RRB NTPC',
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
      { id: 'General_Awareness', title: 'General Awareness & General Science', subtitle: 'Current Events, Science, History & Polity', icon: '🌍' }
    ]
  },

  // 7. NEET UG
  {
    aliases: ['neet', 'neet ug', 'neet 2025', 'neet 2026', 'neet exam', 'neet ug national eligibility', 'national eligibility cum entrance test'],
    shortName: 'NEET UG',
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

  // 8. JEE Main
  {
    aliases: ['jee', 'jee main', 'jee mains', 'iit jee', 'jee main 2025', 'jee main 2026', 'iit jee main', 'joint entrance examination'],
    shortName: 'JEE Main',
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

  // 9. JEE Advanced
  {
    aliases: ['jee adv', 'jee advanced', 'iit jee advanced'],
    shortName: 'JEE Advanced',
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

  // 10. UPSC Civil Services Examination
  {
    aliases: ['upsc', 'upsc cse', 'civil services', 'ias', 'ips', 'ias exam', 'upsc prelims', 'upsc mains'],
    shortName: 'UPSC CSE',
    officialExamName: 'UPSC Civil Services Examination (CSE)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Full-Time Aspirant', label: 'Full-Time Aspirant', desc: 'Dedicated CSE Preparation', isCollege: true },
      { id: 'College Final Year', label: 'College Final Year', desc: 'Undergraduate Aspirant', isCollege: true },
      { id: 'Working Professional', label: 'Working Professional', desc: 'Preparing along with employment', isCollege: true }
    ],
    subjects: [
      { id: 'General Studies I', title: 'General Studies I', subtitle: 'Indian Heritage, History, Geography & Society', icon: '🏛️' },
      { id: 'General Studies II', title: 'General Studies II (CSAT & Polity)', subtitle: 'Constitution, Governance, Polity & Reasoning', icon: '⚖️' },
      { id: 'General Studies III', title: 'General Studies III', subtitle: 'Economy, Agriculture, Science & Security', icon: '📊' },
      { id: 'General Studies IV', title: 'General Studies IV (Ethics)', subtitle: 'Ethics, Integrity & Aptitude Case Studies', icon: '🧠' },
      { id: 'Essay', title: 'Essay Paper', subtitle: 'Philosophical, Social & Governance Essays', icon: '✍️' }
    ]
  },

  // 11. BPSC (Bihar Public Service Commission)
  {
    aliases: ['bpsc', 'bpsc cce', 'bihar psc', 'bpsc prelims', 'bpsc mains', 'bpsc 70th', 'bpsc 71st'],
    shortName: 'BPSC',
    officialExamName: 'Bihar Public Service Commission Combined Competitive Examination (BPSC CCE)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Graduate_Final_Year', label: 'Final Year Undergraduate', desc: 'Graduation Year Candidate', isCollege: true },
      { id: 'Fresh_Graduate', label: 'Graduate Full-Time Aspirant', desc: 'Full-Time BPSC Civil Services Prep', isCollege: true },
      { id: 'Working_Professional', label: 'Working Professional', desc: 'Preparing alongside Job', isCollege: true }
    ],
    subjects: [
      { id: 'General_Studies_Paper_I', title: 'General Studies Paper I', subtitle: 'Modern History of India, Bihar Culture, Current Events & Statistical Analysis', icon: '📜' },
      { id: 'General_Studies_Paper_II', title: 'General Studies Paper II', subtitle: 'Indian Polity, Economy, Geography & Role of Science and Technology', icon: '🌐' },
      { id: 'General_Hindi', title: 'General Hindi', subtitle: 'Qualifying Essay, Grammar, Syntax & Summarization', icon: '📖' },
      { id: 'Essay', title: 'Essay Paper', subtitle: 'Socio-economic, philosophical & Bihar-specific cultural themes', icon: '✍️' },
      { id: 'General_Studies_Prelims', title: 'General Studies (Prelims)', subtitle: 'Objective General Science, History, Bihar GK, Polity & Mental Ability', icon: '📊' }
    ]
  },

  // 12. UPPSC (Uttar Pradesh Public Service Commission)
  {
    aliases: ['uppsc', 'uppcs', 'up psc', 'uppsc pcs', 'up civil services', 'uppsc prelims', 'uppsc mains'],
    shortName: 'UPPSC',
    officialExamName: 'Uttar Pradesh Combined State / Upper Subordinate Services (UPPSC PCS)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Graduate_Aspirant', label: 'Graduate Full-Time Aspirant', desc: 'Full-Time UP PCS Preparation', isCollege: true },
      { id: 'Final_Year_Student', label: 'Final Year Undergrad', desc: 'College Pre-PCS Aspirant', isCollege: true },
      { id: 'Working_Professional', label: 'Working Professional', desc: 'Employed Civil Service Aspirant', isCollege: true }
    ],
    subjects: [
      { id: 'General_Studies_I', title: 'General Studies Paper I', subtitle: 'Indian History, Heritage, Geography & World History', icon: '🏛️' },
      { id: 'General_Studies_II', title: 'General Studies Paper II', subtitle: 'Constitution, Governance, Social Justice & International Relations', icon: '⚖️' },
      { id: 'General_Studies_III', title: 'General Studies Paper III', subtitle: 'Economy, Environment, Security, Science & Disaster Management', icon: '📊' },
      { id: 'General_Studies_V_VI_UP_Special', title: 'General Studies V & VI (UP Special)', subtitle: 'Comprehensive History, Geography, Polity & Economy of Uttar Pradesh', icon: '🗺️' },
      { id: 'General_Hindi_Essay', title: 'General Hindi & Essay', subtitle: 'Conventions, Comprehension & Thematic Essay Papers', icon: '✍️' }
    ]
  },

  // 13. MPPSC (Madhya Pradesh Public Service Commission)
  {
    aliases: ['mppsc', 'mp psc', 'mppsc prelims', 'mppsc mains'],
    shortName: 'MPPSC',
    officialExamName: 'Madhya Pradesh Public Service Commission State Service Examination (MPPSC)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Graduate_Aspirant', label: 'Graduate Full-Time Aspirant', desc: 'Full-Time MPPSC Prep', isCollege: true },
      { id: 'Final_Year_Student', label: 'Final Year Undergrad', desc: 'College Pre-MPPSC Aspirant', isCollege: true }
    ],
    subjects: [
      { id: 'General_Studies_I', title: 'General Studies I (History & Geography)', subtitle: 'History of India & MP, World & Indian Geography', icon: '🏛️' },
      { id: 'General_Studies_II', title: 'General Studies II (Polity & Economics)', subtitle: 'Constitution, Governance, Economics & Sociology', icon: '⚖️' },
      { id: 'General_Studies_III', title: 'General Studies III (Science & Technology)', subtitle: 'General Science, Mathematics, Technology & Environment', icon: '🔬' },
      { id: 'General_Hindi_Drafting', title: 'General Hindi & Grammar', subtitle: 'Hindi Grammar, Translations & Administrative Drafting', icon: '📖' }
    ]
  },

  // 14. Bihar Board Class 12 (BSEB Inter)
  {
    aliases: ['bihar board 12th', 'bihar board 12', 'bseb 12th', 'bseb 12', 'bseb inter', 'bihar board inter', 'bihar board intermediate', 'bihar board'],
    shortName: 'Bihar Board 12th',
    officialExamName: 'Bihar School Examination Board Intermediate (BSEB Class 12)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Class_12_Inter', label: 'Class 12 (Intermediate)', desc: 'BSEB Board Appearing Candidate', isCollege: false },
      { id: 'Class_11_Inter', label: 'Class 11 (Intermediate 1st Year)', desc: '11th Grade Foundation', isCollege: false }
    ],
    subjects: [
      { id: 'Physics', title: 'Physics (भौतिकी)', subtitle: 'Electrostatics, Magnetism, Optics, Modern Physics', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry (रसायन शास्त्र)', subtitle: 'Physical, Inorganic, Organic Chemistry', icon: '🧪' },
      { id: 'Mathematics', title: 'Mathematics (गणित)', subtitle: 'Calculus, Vectors, 3D Geometry, Linear Programming', icon: '📐' },
      { id: 'Biology', title: 'Biology (जीव विज्ञान)', subtitle: 'Genetics, Ecology, Physiology, Reproduction', icon: '🧬' },
      { id: 'Hindi', title: 'Hindi (हिंदी 100 Marks)', subtitle: 'दिगंत भाग 2 - गद्य, पद्य एवं व्याकरण', icon: '📖' },
      { id: 'English', title: 'English (English 100 Marks)', subtitle: 'Rainbow Part 2 - Prose, Poetry, Grammar & Story of English', icon: '📚' }
    ]
  },

  // 15. Bihar Board Class 10 (BSEB Matric)
  {
    aliases: ['bihar board 10th', 'bihar board 10', 'bseb 10th', 'bseb 10', 'bseb matric', 'bihar board matric'],
    shortName: 'Bihar Board 10th',
    officialExamName: 'Bihar School Examination Board Matriculation (BSEB Class 10)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class_10_Matric', label: 'Class 10 (Matriculation)', desc: 'BSEB 10th Board Candidate', isCollege: false },
      { id: 'Class_9_PreMatric', label: 'Class 9 Foundation', desc: 'Pre-Matriculation Prep', isCollege: false }
    ],
    subjects: [
      { id: 'Mathematics', title: 'Mathematics (गणित)', subtitle: 'Real numbers, Trigonometry, Geometry, Mensuration', icon: '📐' },
      { id: 'Science', title: 'Science (विज्ञान)', subtitle: 'Physics, Chemistry & Biology', icon: '🔬' },
      { id: 'Social_Science', title: 'Social Science (सामाजिक विज्ञान)', subtitle: 'History, Geography, Political Science, Economics', icon: '🌍' },
      { id: 'Hindi', title: 'Hindi (हिंदी - गोधूलि)', subtitle: 'गोधूलि भाग 2, वर्णिका भाग 2 एवं व्याकरण', icon: '📖' },
      { id: 'Sanskrit', title: 'Sanskrit (संस्कृत - पीयूषम)', subtitle: 'पीयूषम भाग 2 एवं संस्कृत व्याकरण', icon: '📜' },
      { id: 'English', title: 'English (Panorama Part 2)', subtitle: 'Prose, Poetry, Vocabulary & Grammar', icon: '📚' }
    ]
  },

  // 16. UP Board Class 12 (UPMSP Inter)
  {
    aliases: ['up board 12th', 'up board 12', 'upmsp 12th', 'upmsp 12', 'up board inter', 'up board intermediate', 'up board'],
    shortName: 'UP Board 12th',
    officialExamName: 'Uttar Pradesh Madhyamik Shiksha Parishad Intermediate (UPMSP Class 12)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Class_12_Inter', label: 'Class 12 (Intermediate)', desc: 'UP Board Appearing Senior Secondary', isCollege: false },
      { id: 'Class_11_Inter', label: 'Class 11 (Intermediate 1st Year)', desc: '11th Grade Foundation', isCollege: false }
    ],
    subjects: [
      { id: 'General_Hindi', title: 'General Hindi (सामान्य हिन्दी)', subtitle: 'काव्य, गद्य, संस्कृत खण्ड एवं व्याकरण', icon: '📖' },
      { id: 'Physics', title: 'Physics (भौतिक विज्ञान)', subtitle: 'Electrostatics, Optics, Current Electricity & Modern Physics', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry (रसायन विज्ञान)', subtitle: 'Physical, Organic, Coordination & Inorganic Chemistry', icon: '🧪' },
      { id: 'Mathematics', title: 'Mathematics (गणित)', subtitle: 'Calculus, Vectors, Matrices, Determinants & Probability', icon: '📐' },
      { id: 'Biology', title: 'Biology (जीव विज्ञान)', subtitle: 'Botany, Zoology, Genetics & Ecology', icon: '🧬' },
      { id: 'English', title: 'English (General English)', subtitle: 'Flamingo, Vistas, Grammar & Composition', icon: '📚' }
    ]
  },

  // 17. UP Board Class 10 (UPMSP High School)
  {
    aliases: ['up board 10th', 'up board 10', 'upmsp 10th', 'upmsp 10', 'up board high school'],
    shortName: 'UP Board 10th',
    officialExamName: 'Uttar Pradesh Madhyamik Shiksha Parishad High School (UPMSP Class 10)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class_10_HighSchool', label: 'Class 10 (High School)', desc: 'UPMSP 10th Board Candidate', isCollege: false },
      { id: 'Class_9_HighSchool', label: 'Class 9 Foundation', desc: 'Pre-High School Prep', isCollege: false }
    ],
    subjects: [
      { id: 'Hindi', title: 'Hindi (हिन्दी)', subtitle: 'गद्य, काव्य, संस्कृत परिचयिका एवं व्याकरण', icon: '📖' },
      { id: 'Mathematics', title: 'Mathematics (गणित)', subtitle: 'Algebra, Geometry, Trigonometry, Coordinate & Mensuration', icon: '📐' },
      { id: 'Science', title: 'Science (विज्ञान)', subtitle: 'Chemical substances, World of living, Natural phenomena & Effects of current', icon: '🔬' },
      { id: 'Social_Science', title: 'Social Science (सामाजिक विज्ञान)', subtitle: 'India & the Contemporary World, Contemporary India, Democratic Politics', icon: '🌍' },
      { id: 'English', title: 'English', subtitle: 'First Flight, Footprints without Feet, Grammar & Writing', icon: '📚' }
    ]
  },

  // 18. CBSE Class 12
  {
    aliases: ['cbse 12', 'cbse 12th', 'cbse class 12', 'cbse board 12', 'class 12 cbse', 'cbse boards', 'cbse'],
    shortName: 'CBSE Class 12',
    officialExamName: 'CBSE Class 12 Senior School Certificate Examination',
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

  // 19. CBSE Class 10
  {
    aliases: ['cbse 10', 'cbse 10th', 'cbse class 10', 'class 10 cbse', 'cbse board 10'],
    shortName: 'CBSE Class 10',
    officialExamName: 'CBSE Class 10 Secondary School Examination',
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

  // 20. ICSE Class 10
  {
    aliases: ['icse', 'icse class 10', 'icse 10th', 'icse board', 'cisce 10th'],
    shortName: 'ICSE Class 10',
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
      { id: 'Biology', title: 'Biology', subtitle: 'Basic Biology, Plant & Human Physiology', icon: '🧬' },
      { id: 'History_Civics', title: 'History & Civics', subtitle: 'Union Legislature, Indian National Movement & World Wars', icon: '🏛️' },
      { id: 'Geography', title: 'Geography', subtitle: 'Topographical Maps, Climate, Soil, Water & Minerals', icon: '🗺️' }
    ]
  },

  // 21. ISC Class 12
  {
    aliases: ['isc', 'isc class 12', 'isc 12th', 'isc board', 'cisce 12th'],
    shortName: 'ISC Class 12',
    officialExamName: 'ISC Class 12 (Indian School Certificate)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Class 12', label: 'Class 12', desc: 'ISC Senior Secondary Board Year', isCollege: false },
      { id: 'Class 11', label: 'Class 11', desc: 'ISC Grade 11 Foundation', isCollege: false }
    ],
    subjects: [
      { id: 'English', title: 'English (Language & Literature)', subtitle: 'Macbeth, Prose, Poetry & Advanced Grammar', icon: '📚' },
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Calculus, Vectors, Probability & Algebra', icon: '📐' },
      { id: 'Physics', title: 'Physics', subtitle: 'Electrostatics, Magnetism, Optics & Modern Physics', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry', subtitle: 'Physical, Inorganic, Coordination & Organic Chemistry', icon: '🧪' },
      { id: 'Biology', title: 'Biology', subtitle: 'Reproduction, Genetics, Biotechnology & Ecology', icon: '🧬' }
    ]
  },

  // 22. NDA (National Defence Academy)
  {
    aliases: ['nda', 'national defence academy', 'nda exam', 'nda na'],
    shortName: 'NDA',
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

  // 23. CDS (Combined Defence Services)
  {
    aliases: ['cds', 'cds exam', 'combined defence services', 'ima', 'ota'],
    shortName: 'CDS',
    officialExamName: 'UPSC Combined Defence Services Examination (CDS)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Graduation_Final_Year', label: 'Final Year Graduate', desc: 'Appearing Undergrad Candidate', isCollege: true },
      { id: 'Graduate_Aspirant', label: 'Graduate Defence Aspirant', desc: 'IMA / OTA / INA / AFA Prep', isCollege: true }
    ],
    subjects: [
      { id: 'English', title: 'English Language', subtitle: 'Reading Comprehension, Spotting Errors & Vocabulary', icon: '📚' },
      { id: 'General_Knowledge', title: 'General Knowledge', subtitle: 'Current Affairs, Indian History, Geography & General Science', icon: '🌍' },
      { id: 'Elementary_Mathematics', title: 'Elementary Mathematics', subtitle: 'Arithmetic, Algebra, Trigonometry, Geometry & Mensuration', icon: '📐' }
    ]
  },

  // 24. CUET UG
  {
    aliases: ['cuet', 'cuet ug', 'cuet exam', 'common university entrance test'],
    shortName: 'CUET UG',
    officialExamName: 'Common University Entrance Test Undergraduate (CUET UG)',
    country: 'India',
    hasElectives: true,
    grades: [
      { id: 'Class_12_Candidate', label: 'Class 12 Appearing', desc: 'Undergraduate College Entrance Candidate', isCollege: false },
      { id: 'Dropper_Aspirant', label: 'Gap Year / Full-Time CUET Aspirant', desc: 'Central University Entrance Prep', isCollege: false }
    ],
    subjects: [
      { id: 'English_Language', title: 'English (Language Section 1A)', subtitle: 'Reading Comprehension, Literary Aptitude & Vocabulary', icon: '📚' },
      { id: 'General_Test', title: 'General Test (Section 3)', subtitle: 'General Knowledge, Current Affairs, Mental Ability & Numerical Logic', icon: '🧠' },
      { id: 'Physics', title: 'Physics (Domain Subject)', subtitle: 'NCERT Class 12 Physics Syllabus', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry (Domain Subject)', subtitle: 'NCERT Class 12 Chemistry Syllabus', icon: '🧪' },
      { id: 'Mathematics', title: 'Mathematics (Domain Subject)', subtitle: 'NCERT Class 12 Mathematics Syllabus', icon: '📐' },
      { id: 'Biology', title: 'Biology (Domain Subject)', subtitle: 'NCERT Class 12 Biology Syllabus', icon: '🧬' }
    ]
  },

  // 25. CLAT (Law)
  {
    aliases: ['clat', 'clat exam', 'common law admission test', 'clat ug', 'law entrance'],
    shortName: 'CLAT',
    officialExamName: 'Common Law Admission Test (CLAT UG)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Class_12_Law', label: 'Class 12 (Pre-Law)', desc: '12th Appearing NLU Aspirant', isCollege: false },
      { id: 'Dropper_Law', label: 'Dedicated Law Aspirant', desc: 'Full-Time CLAT NLU Preparation', isCollege: false }
    ],
    subjects: [
      { id: 'English_Language', title: 'English Language', subtitle: 'Comprehension passages, Vocabulary & Inference', icon: '📚' },
      { id: 'Current_Affairs_GK', title: 'Current Affairs & General Knowledge', subtitle: 'Contemporary events, International affairs & Arts/Culture', icon: '🏛️' },
      { id: 'Legal_Reasoning', title: 'Legal Reasoning', subtitle: 'Legal principles, Fact scenarios & Constitutional questions', icon: '⚖️' },
      { id: 'Logical_Reasoning', title: 'Logical Reasoning', subtitle: 'Arguments, Premises, Conclusions & Deductive analysis', icon: '🧠' },
      { id: 'Quantitative_Techniques', title: 'Quantitative Techniques', subtitle: 'Data interpretation, Ratios, Percentages & Basic arithmetic', icon: '📐' }
    ]
  },

  // 26. CAT (MBA)
  {
    aliases: ['cat', 'cat exam', 'iim cat', 'common admission test'],
    shortName: 'CAT',
    officialExamName: 'CAT (Common Admission Test for MBA)',
    country: 'India',
    hasElectives: false,
    grades: [
      { id: 'Final Year Undergrad', label: 'Final Year Undergrad', desc: 'College Pre-MBA Aspirant', isCollege: true },
      { id: 'Dedicated Gap Year', label: 'Dedicated Gap Year', desc: 'Full-Time MBA Prep', isCollege: true },
      { id: 'Working_Professional', label: 'Working Professional', desc: 'Corporate MBA Aspirant', isCollege: true }
    ],
    subjects: [
      { id: 'VARC', title: 'Verbal Ability & Reading Comprehension (VARC)', subtitle: 'RC Passages, Parajumbles, Summary & Sentence Completion', icon: '📚' },
      { id: 'DILR', title: 'Data Interpretation & Logical Reasoning (DILR)', subtitle: 'Caselets, Tables, Graphs, Puzzles & Seating Arrangements', icon: '📊' },
      { id: 'QA', title: 'Quantitative Ability (QA)', subtitle: 'Arithmetic, Algebra, Geometry & Modern Math', icon: '📐' }
    ]
  },

  // 27. GATE (Engineering)
  {
    aliases: ['gate', 'gate exam', 'graduate aptitude test in engineering'],
    shortName: 'GATE',
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
  },

  // 28. SAT (College Board Digital SAT)
  {
    aliases: ['sat', 'digital sat', 'psat', 'scholastic assessment test', 'sat exam'],
    shortName: 'SAT',
    officialExamName: 'SAT (Digital Scholastic Assessment Test)',
    country: 'United States',
    hasElectives: false,
    grades: [
      { id: '11th Grade (Junior)', label: '11th Grade (Junior)', desc: 'Prime SAT Testing Year', isCollege: false },
      { id: '12th Grade (Senior)', label: '12th Grade (Senior)', desc: 'Final Fall SAT Attempts', isCollege: false },
      { id: '10th Grade (Sophomore)', label: '10th Grade (Sophomore)', desc: 'Early PSAT / SAT Foundation', isCollege: false }
    ],
    subjects: [
      { id: 'Reading and Writing', title: 'Reading and Writing', subtitle: 'Craft and Structure, Information and Ideas, Expression of Ideas', icon: '📖' },
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Algebra, Advanced Math, Problem-Solving & Geometry', icon: '📐' }
    ]
  },

  // 29. ACT
  {
    aliases: ['act', 'act exam', 'american college testing'],
    shortName: 'ACT',
    officialExamName: 'ACT (American College Testing)',
    country: 'United States',
    hasElectives: false,
    grades: [
      { id: '11th Grade (Junior)', label: '11th Grade (Junior)', desc: 'Prime ACT Testing Year', isCollege: false },
      { id: '12th Grade (Senior)', label: '12th Grade (Senior)', desc: 'Final ACT Attempts', isCollege: false }
    ],
    subjects: [
      { id: 'English', title: 'English', subtitle: 'Usage, Mechanics & Rhetorical Skills', icon: '✍️' },
      { id: 'Mathematics', title: 'Mathematics', subtitle: 'Pre-Algebra, Algebra, Coordinate Geometry', icon: '📐' },
      { id: 'Reading', title: 'Reading', subtitle: 'Prose Fiction, Social Studies, Humanities', icon: '📖' },
      { id: 'Science', title: 'Science', subtitle: 'Data Representation, Research Summaries', icon: '🔬' }
    ]
  },

  // 30. AP Exams (Advanced Placement)
  {
    aliases: ['ap', 'ap exams', 'advanced placement', 'ap calculus', 'ap physics', 'ap chemistry', 'ap biology', 'ap comp sci'],
    shortName: 'AP Exams',
    officialExamName: 'Advanced Placement (AP) Examinations',
    country: 'United States',
    hasElectives: true,
    grades: [
      { id: '11th Grade (Junior)', label: '11th Grade', desc: 'Prime AP Course Year', isCollege: false },
      { id: '12th Grade (Senior)', label: '12th Grade', desc: 'Senior AP Courses & College Credit', isCollege: false },
      { id: '10th Grade (Sophomore)', label: '10th Grade', desc: 'Introductory AP Courses', isCollege: false }
    ],
    subjects: [
      { id: 'AP_Calculus_BC', title: 'AP Calculus BC', subtitle: 'Limits, Derivatives, Integrals, Series & Parametrics', icon: '📐' },
      { id: 'AP_Physics_C', title: 'AP Physics C: Mechanics', subtitle: 'Calculus-based Newtonian Mechanics & Kinematics', icon: '⚡' },
      { id: 'AP_Chemistry', title: 'AP Chemistry', subtitle: 'Atomic Structure, Chemical Bonding, Kinetics & Thermodynamics', icon: '🧪' },
      { id: 'AP_Biology', title: 'AP Biology', subtitle: 'Cellular Energetics, Genetics, Heredity & Ecology', icon: '🧬' },
      { id: 'AP_Computer_Science_A', title: 'AP Computer Science A', subtitle: 'Java Programming, Algorithms & Object-Oriented Design', icon: '💻' },
      { id: 'AP_English_Language', title: 'AP English Language and Composition', subtitle: 'Rhetorical Analysis, Evidence-based Argument & Synthesis', icon: '📚' }
    ]
  },

  // 31. GRE
  {
    aliases: ['gre', 'gre general', 'gre exam', 'graduate record examination'],
    shortName: 'GRE',
    officialExamName: 'GRE (Graduate Record Examination)',
    country: 'United States',
    hasElectives: false,
    grades: [
      { id: 'Undergraduate_Senior', label: 'College Senior / Final Year', desc: 'Preparing for Graduate / MS Admissions', isCollege: true },
      { id: 'Working_Professional', label: 'Working Professional Aspirant', desc: 'Grad School / MS / MBA Prep', isCollege: true }
    ],
    subjects: [
      { id: 'Verbal_Reasoning', title: 'Verbal Reasoning', subtitle: 'Text Completion, Sentence Equivalence & Reading Comprehension', icon: '📚' },
      { id: 'Quantitative_Reasoning', title: 'Quantitative Reasoning', subtitle: 'Arithmetic, Algebra, Geometry & Data Analysis', icon: '📐' },
      { id: 'Analytical_Writing', title: 'Analytical Writing (AWA)', subtitle: 'Analyze an Issue Task & Critical Persuasive Essay', icon: '✍️' }
    ]
  },

  // 32. GMAT
  {
    aliases: ['gmat', 'gmat focus', 'gmat exam'],
    shortName: 'GMAT',
    officialExamName: 'GMAT Focus Edition (Graduate Management Admission Test)',
    country: 'United States',
    hasElectives: false,
    grades: [
      { id: 'MBA_Applicant', label: 'MBA Applicant', desc: 'Business School Candidate', isCollege: true },
      { id: 'College_Senior', label: 'Undergraduate Senior', desc: 'Pre-MBA Candidate', isCollege: true }
    ],
    subjects: [
      { id: 'Quantitative_Reasoning', title: 'Quantitative Reasoning', subtitle: 'Problem Solving & Pure Mathematical Concepts', icon: '📐' },
      { id: 'Verbal_Reasoning', title: 'Verbal Reasoning', subtitle: 'Critical Reasoning & Reading Comprehension', icon: '📚' },
      { id: 'Data_Insights', title: 'Data Insights', subtitle: 'Multi-Source Reasoning, Table Analysis & Graphics', icon: '📊' }
    ]
  },

  // 33. IELTS
  {
    aliases: ['ielts', 'ielts academic', 'ielts exam'],
    shortName: 'IELTS',
    officialExamName: 'IELTS Academic (International English Language Testing System)',
    country: 'United Kingdom',
    hasElectives: false,
    grades: [
      { id: 'University_Applicant', label: 'University / Study Abroad Aspirant', desc: 'Academic Admission Requirement', isCollege: true },
      { id: 'Immigration_Applicant', label: 'Global Immigration / Work Candidate', desc: 'Language Proficiency Certification', isCollege: true }
    ],
    subjects: [
      { id: 'Listening', title: 'Listening', subtitle: '4 recorded audio monologues and conversations', icon: '🎧' },
      { id: 'Reading', title: 'Reading', subtitle: '3 long academic passages with descriptive & analytical texts', icon: '📖' },
      { id: 'Writing', title: 'Writing', subtitle: 'Task 1 Graph/Diagram Report & Task 2 Argumentative Essay', icon: '✍️' },
      { id: 'Speaking', title: 'Speaking', subtitle: 'Face-to-face oral interview, short speech & discussion', icon: '🗣️' }
    ]
  },

  // 34. TOEFL
  {
    aliases: ['toefl', 'toefl ibt', 'toefl exam'],
    shortName: 'TOEFL',
    officialExamName: 'TOEFL iBT (Test of English as a Foreign Language)',
    country: 'United States',
    hasElectives: false,
    grades: [
      { id: 'Study_Abroad_Student', label: 'Study Abroad / University Candidate', desc: 'Undergraduate or Graduate Admissions', isCollege: true }
    ],
    subjects: [
      { id: 'Reading', title: 'Reading Section', subtitle: '2 academic reading passages and comprehension questions', icon: '📖' },
      { id: 'Listening', title: 'Listening Section', subtitle: 'Brief lectures and campus classroom discussions', icon: '🎧' },
      { id: 'Speaking', title: 'Speaking Section', subtitle: 'Independent and integrated academic tasks', icon: '🗣️' },
      { id: 'Writing', title: 'Writing Section', subtitle: 'Integrated essay and Academic Discussion task', icon: '✍️' }
    ]
  },

  // 35. Cambridge IGCSE / GCSE
  {
    aliases: ['igcse', 'gcse', 'cambridge igcse', 'edexcel gcse'],
    shortName: 'IGCSE',
    officialExamName: 'Cambridge International General Certificate of Secondary Education (IGCSE)',
    country: 'United Kingdom',
    hasElectives: true,
    grades: [
      { id: 'Year_11', label: 'Year 11 / Grade 10', desc: 'Final GCSE / IGCSE Examination Year', isCollege: false },
      { id: 'Year_10', label: 'Year 10 / Grade 9', desc: 'Year 1 of GCSE Curriculum', isCollege: false }
    ],
    subjects: [
      { id: 'Mathematics', title: 'Mathematics (0580)', subtitle: 'Number, Algebra, Shape & Space, Probability & Statistics', icon: '📐' },
      { id: 'Physics', title: 'Physics (0625)', subtitle: 'Motion, Thermal Physics, Waves, Electricity & Space', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry (0620)', subtitle: 'States of Matter, Stoichiometry, Organic & Periodic Table', icon: '🧪' },
      { id: 'Biology', title: 'Biology (0610)', subtitle: 'Characteristics of Living Organisms, Human Nutrition & Genetics', icon: '🧬' },
      { id: 'English_First_Language', title: 'English as a First Language (0500)', subtitle: 'Reading Comprehension, Directed Writing & Composition', icon: '📚' }
    ]
  },

  // 36. Cambridge / Edexcel A Levels
  {
    aliases: ['a levels', 'a level', 'cambridge a level', 'gce a level', 'as level'],
    shortName: 'A Levels',
    officialExamName: 'GCE Advanced Level (A Levels)',
    country: 'United Kingdom',
    hasElectives: true,
    grades: [
      { id: 'Year_13_A2', label: 'Year 13 (A2 Level)', desc: 'Final Year Advanced Level Candidate', isCollege: false },
      { id: 'Year_12_AS', label: 'Year 12 (AS Level)', desc: 'Advanced Subsidiary Foundation Year', isCollege: false }
    ],
    subjects: [
      { id: 'Mathematics', title: 'Mathematics (9709)', subtitle: 'Pure Mathematics, Mechanics & Probability/Statistics', icon: '📐' },
      { id: 'Physics', title: 'Physics (9702)', subtitle: 'Mechanics, Fields, Oscillations, Thermal & Modern Physics', icon: '⚡' },
      { id: 'Chemistry', title: 'Chemistry (9701)', subtitle: 'Physical, Inorganic & Organic Synthesis Chemistry', icon: '🧪' },
      { id: 'Biology', title: 'Biology (9700)', subtitle: 'Cell Structure, Physiology, Genetics, Evolution & Ecology', icon: '🧬' },
      { id: 'Economics', title: 'Economics (9708)', subtitle: 'Microeconomic Principles, Macroeconomic Policies & Markets', icon: '📊' }
    ]
  }
];

/**
 * Instant, robust, offline-proof exam matcher for popular national and global exams.
 */
export function findPreVerifiedExam(inputExam: string, _userCountry?: string): PreVerifiedExam | null {
  if (!inputExam || typeof inputExam !== 'string') return null;
  const clean = inputExam.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  // 1. Exact match on clean string
  for (const entry of PRE_VERIFIED_EXAMS) {
    for (const alias of entry.aliases) {
      const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      if (clean === cleanAlias) {
        return entry;
      }
    }
  }

  // 2. Prefix / substring match for inputs of length >= 3
  if (clean.length >= 3) {
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
  }

  // 3. Token-level semantic matching
  if (words.includes('cgl')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'SSC CGL') || null;
  }
  if (words.includes('chsl')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'SSC CHSL') || null;
  }
  if (words.includes('mts')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'SSC MTS') || null;
  }
  if (words.includes('gd')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'SSC GD') || null;
  }
  if (words.includes('ssc')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'SSC CGL') || null;
  }
  if (words.includes('bpsc')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'BPSC') || null;
  }
  if (words.includes('uppsc') || words.includes('uppcs')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'UPPSC') || null;
  }
  if (words.includes('mppsc')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'MPPSC') || null;
  }
  if (clean.includes('bihar board') || clean.includes('bseb')) {
    if (words.includes('10') || words.includes('10th') || words.includes('matric')) {
      return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'Bihar Board 10th') || null;
    }
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'Bihar Board 12th') || null;
  }
  if (clean.includes('up board') || clean.includes('upmsp')) {
    if (words.includes('10') || words.includes('10th') || words.includes('highschool')) {
      return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'UP Board 10th') || null;
    }
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'UP Board 12th') || null;
  }
  if (words.includes('neet')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'NEET UG') || null;
  }
  if (words.includes('jee')) {
    if (words.includes('advanced') || words.includes('adv')) {
      return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'JEE Advanced') || null;
    }
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'JEE Main') || null;
  }
  if (words.includes('cbse')) {
    if (words.includes('10') || words.includes('10th') || words.includes('x')) {
      return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'CBSE Class 10') || null;
    }
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'CBSE Class 12') || null;
  }
  if (words.includes('icse')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'ICSE Class 10') || null;
  }
  if (words.includes('isc')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'ISC Class 12') || null;
  }
  if (words.includes('upsc') || words.includes('ias')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'UPSC CSE') || null;
  }
  if (words.includes('sat')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'SAT') || null;
  }
  if (words.includes('act')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'ACT') || null;
  }
  if (words.includes('cat')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'CAT') || null;
  }
  if (words.includes('gate')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'GATE') || null;
  }
  if (words.includes('nda')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'NDA') || null;
  }
  if (words.includes('cds')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'CDS') || null;
  }
  if (words.includes('cuet')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'CUET UG') || null;
  }
  if (words.includes('clat')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'CLAT') || null;
  }
  if (words.includes('bank') || words.includes('ibps') || words.includes('sbi')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'Banking Exams') || null;
  }
  if (words.includes('rrb') || words.includes('railway') || words.includes('ntpc')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'RRB NTPC') || null;
  }
  if (words.includes('ap') && (clean.includes('advanced placement') || clean.includes('ap '))) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'AP Exams') || null;
  }
  if (words.includes('gre')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'GRE') || null;
  }
  if (words.includes('gmat')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'GMAT') || null;
  }
  if (words.includes('ielts')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'IELTS') || null;
  }
  if (words.includes('toefl')) {
    return PRE_VERIFIED_EXAMS.find(e => e.shortName === 'TOEFL') || null;
  }

  return null;
}
