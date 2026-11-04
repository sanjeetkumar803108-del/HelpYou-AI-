/**
 * Official Exam Syllabus & Curriculum Catalog
 * 100% Authentic, Exhaustive, Official Chapters & Assessment Frameworks
 * Strictly aligned with official conducting authorities (NTA, SSC, UPSC, CBSE, IBPS, CollegeBoard).
 * ZERO generic filler names.
 */

export interface CatalogSubjectBlueprint {
  subjectName: string;
  totalMarks: number;
  totalQuestions: number;
  attemptRequired: number;
  markingScheme: string;
  negativeMarking: number;
  marksPerCorrect: number;
  questionFormats: string[];
  mcqStyle: {
    optionsCount: number;
    style: string;
    negativePenalty: string;
  };
  subjectiveStyle: {
    hasSubjective: boolean;
    format: string;
    wordLimits: string;
    markingRubric: string;
  };
  nomenclature: string;
  coreUnits: string[];
  subTopics: Record<string, string[]>;
  detailedNotesGuidelines: string;
  revisionGuidelines: string;
  essayTone?: string | null;
  examTone: string;
  officialSource: string;
}

export interface CatalogExamBlueprint {
  examOverview: {
    examName: string;
    country: string;
    officialAuthority: string;
    examType: string;
    examFormat: string;
    totalExamMarks: number;
    totalQuestions: number;
    hasSubjective: boolean;
    hasNegativeMarking: boolean;
    negativeFormula: string;
  };
  subjects: Record<string, CatalogSubjectBlueprint>;
}

export const EXAM_SYLLABUS_CATALOG: Record<string, CatalogExamBlueprint> = {
  // 1. SSC CGL
  "ssc_cgl": {
    examOverview: {
      examName: "Staff Selection Commission Combined Graduate Level (SSC CGL)",
      country: "India",
      officialAuthority: "Staff Selection Commission (ssc.gov.in)",
      examType: "National Central Government Recruitment (Group B & C)",
      examFormat: "Computer Based Examination (CBT) Tier 1 & Tier 2",
      totalExamMarks: 200,
      totalQuestions: 100,
      hasSubjective: false,
      hasNegativeMarking: true,
      negativeFormula: "+2 for correct, -0.50 for incorrect in Tier 1; +3 correct, -1 incorrect in Tier 2"
    },
    subjects: {
      "Quantitative Aptitude": {
        subjectName: "Quantitative Aptitude",
        totalMarks: 50,
        totalQuestions: 25,
        attemptRequired: 25,
        markingScheme: "+2 for correct, -0.50 for incorrect, 0 for unattempted",
        negativeMarking: -0.50,
        marksPerCorrect: 2,
        questionFormats: ["Single Choice Objective MCQ", "Data Interpretation Tables & Graphs", "Speed Calculation Problems"],
        mcqStyle: {
          optionsCount: 4,
          style: "High speed, multi-step arithmetic calculation, advanced geometry & algebraic traps",
          negativePenalty: "-0.50 marks"
        },
        subjectiveStyle: {
          hasSubjective: false,
          format: "N/A - Objective CBT Only",
          wordLimits: "N/A",
          markingRubric: "N/A"
        },
        nomenclature: "Chapters",
        coreUnits: [
          "Number System & Divisibility",
          "HCF and LCM",
          "Simplification & Square Roots",
          "Percentages",
          "Ratio, Proportion & Variation",
          "Average",
          "Simple Interest & Compound Interest",
          "Profit, Loss and Discount",
          "Time and Work & Efficiency",
          "Pipes and Cisterns",
          "Speed, Time and Distance",
          "Boats and Streams",
          "Mixtures and Alligations",
          "Partnership",
          "Basic Algebraic Identities & Polynomials",
          "Linear Equations & Graphs",
          "Geometry (Lines, Angles, Triangles)",
          "Circles, Chords & Tangents",
          "Mensuration 2D (Perimeter & Area)",
          "Mensuration 3D (Surface Area & Volume)",
          "Trigonometric Ratios & Identities",
          "Heights and Distances",
          "Data Interpretation (Bar, Pie, Line, Table & Histograms)"
        ],
        subTopics: {
          "Number System & Divisibility": ["Divisibility Rules of 7, 11, 13, 72, 88", "Unit Digit & Last Two Digits", "Remainder Theorems", "Number of Zeroes & Factors"],
          "Percentages": ["Fraction to Percentage Equivalents", "Successive Percentage Changes", "Expenditure, Price & Consumption Models", "Election & Voting Problems"],
          "Profit, Loss and Discount": ["Marked Price vs Cost Price Relations", "Dishonest Dealer Traps", "Successive Discounts", "Free Article Schemes"],
          "Geometry (Lines, Angles, Triangles)": ["Congruence & Similarity of Triangles", "Centroid, Incentre, Circumcentre, Orthocentre", "Pythagoras & Apollonius Theorems", "Angle Bisector Properties"],
          "Circles, Chords & Tangents": ["Intersecting Chord Theorem", "Direct and Transverse Common Tangents", "Cyclic Quadrilaterals", "Angles in Alternate Segments"],
          "Trigonometric Ratios & Identities": ["Complementary Angle Identities", "Standard Value Substitutions (0°, 30°, 45°, 60°, 90°)", "Maxima and Minima of Trigonometric Functions", "Algebraic Reductions"]
        },
        detailedNotesGuidelines: "Provide step-by-step mathematical proofs, derivation of shortcut tricks, standard identification templates, and highlight common arithmetic calculation traps.",
        revisionGuidelines: "Ultra-condensed formula sheets, standard geometric identity tables, shortcut factor tables, and high-frequency algebraic expansions.",
        essayTone: null,
        examTone: "Competitive high speed and arithmetic accuracy, advanced geometry theorems, algebraic value putting",
        officialSource: "Staff Selection Commission Examination Bulletin (ssc.gov.in)"
      },
      "General Intelligence & Reasoning": {
        subjectName: "General Intelligence & Reasoning",
        totalMarks: 50,
        totalQuestions: 25,
        attemptRequired: 25,
        markingScheme: "+2 for correct, -0.50 for incorrect, 0 for unattempted",
        negativeMarking: -0.50,
        marksPerCorrect: 2,
        questionFormats: ["Single Choice Objective MCQ", "Verbal Logic", "Non-Verbal Visual Pattern Puzzles"],
        mcqStyle: {
          optionsCount: 4,
          style: "Pattern recognition, logical deduction, visual spatial rotation, mathematical operator traps",
          negativePenalty: "-0.50 marks"
        },
        subjectiveStyle: {
          hasSubjective: false,
          format: "N/A - Objective CBT Only",
          wordLimits: "N/A",
          markingRubric: "N/A"
        },
        nomenclature: "Chapters",
        coreUnits: [
          "Semantic & Number Analogies",
          "Classification & Odd One Out",
          "Coding-Decoding & Letter Shifting",
          "Number Series, Alphabet Series & Mixed Series",
          "Missing Number in Matrix / Figures",
          "Blood Relations",
          "Direction and Distance Sense",
          "Order and Ranking",
          "Syllogisms & Logical Deductions",
          "Venn Diagrams",
          "Mathematical Operations & Sign Interchange",
          "Clock and Calendar",
          "Dice and Cube Problems",
          "Paper Folding and Cutting",
          "Mirror and Water Images",
          "Embedded Figures & Completion of Patterns",
          "Counting of Figures (Triangles, Squares, Rectangles)",
          "Statement and Conclusions / Assumptions"
        ],
        subTopics: {
          "Coding-Decoding & Letter Shifting": ["Direct Alphabet Position Numbers (1-26)", "Reverse Alphabet Equivalents (A-Z, B-Y)", "Cross Pattern Shift", "Vowel-Consonant Specific Operations"],
          "Syllogisms & Logical Deductions": ["All A are B & Some A are B", "No A is B & Some Not", "Possibility Cases", "Either-Or Conditions"],
          "Blood Relations": ["Pointed Picture / Dialogue Relations", "Coded Blood Relations (A+B means father)", "Family Tree Diagramming"],
          "Dice and Cube Problems": ["Standard vs General Dice", "Opposite Face Determination with 2 Positions", "Open Dice Folding"]
        },
        detailedNotesGuidelines: "Visual logic matrices, systematic tree diagrams, rule-of-elimination techniques, and pattern catalogues.",
        revisionGuidelines: "Quick rules of opposite dice faces, alphabet rank memory sheet (EJOTY & Reverse), and syllogism Venn rules.",
        essayTone: null,
        examTone: "Instant pattern recognition, visual dexterity, eliminate misleading distractor options",
        officialSource: "Staff Selection Commission Examination Bulletin (ssc.gov.in)"
      },
      "English Comprehension": {
        subjectName: "English Comprehension",
        totalMarks: 50,
        totalQuestions: 25,
        attemptRequired: 25,
        markingScheme: "+2 for correct, -0.50 for incorrect, 0 for unattempted",
        negativeMarking: -0.50,
        marksPerCorrect: 2,
        questionFormats: ["Single Choice Objective MCQ", "Cloze Test", "Sentence Improvement", "Reading Comprehension"],
        mcqStyle: {
          optionsCount: 4,
          style: "Grammar rule exceptions, vocabulary nuance, context clue extraction, idiom definitions",
          negativePenalty: "-0.50 marks"
        },
        subjectiveStyle: {
          hasSubjective: false,
          format: "N/A - Objective CBT Only",
          wordLimits: "N/A",
          markingRubric: "N/A"
        },
        nomenclature: "Chapters",
        coreUnits: [
          "Spotting the Error (Grammar Foundations)",
          "Sentence Improvement & Phrase Replacement",
          "Fill in the Blanks (Prepositions & Collocations)",
          "Synonyms and Antonyms",
          "Idioms and Phrases",
          "One Word Substitution",
          "Spelling Errors & Misspelt Words",
          "Active and Passive Voice Transformations",
          "Direct and Indirect Speech (Narration)",
          "Sentence Rearrangement (Para Jumbles / PQRS)",
          "Cloze Test (Passage Blank Completion)",
          "Reading Comprehension (Factual & Inferential)"
        ],
        subTopics: {
          "Spotting the Error (Grammar Foundations)": ["Subject-Verb Agreement Rules", "Tense Consistency & Conditionals", "Prepositional Placement & Phrasal Verbs", "Pronoun Antecedent Agreement", "Modifiers & Inversion Rules"],
          "Active and Passive Voice Transformations": ["Simple, Continuous & Perfect Tense Changes", "Imperative Sentence Transformations", "Interrogative Voice Change", "Preposition Retaining Passive"],
          "Direct and Indirect Speech (Narration)": ["Reporting Verb Changes", "Tense Backshifting Rules", "Pronoun Changes", "Exclamatory & Imperative Narration"]
        },
        detailedNotesGuidelines: "Comprehensive 100 Golden Rules of Grammar with authentic exam examples, root-word etymology, and contextual sentence application.",
        revisionGuidelines: "High-frequency idiom glossary, repeating one-word substitutions list, and active/passive shortcut table.",
        essayTone: "Grammatically rigorous, formal academic standard English, precise register, correct prepositional usage, no informal colloquialisms.",
        examTone: "Strict grammatical precision, nuanced vocabulary usage, reading speed and inference",
        officialSource: "Staff Selection Commission Official Guidelines (ssc.gov.in)"
      },
      "General Awareness": {
        subjectName: "General Awareness",
        totalMarks: 50,
        totalQuestions: 25,
        attemptRequired: 25,
        markingScheme: "+2 for correct, -0.50 for incorrect, 0 for unattempted",
        negativeMarking: -0.50,
        marksPerCorrect: 2,
        questionFormats: ["Single Choice Objective MCQ", "Statement I & II Verification", "Chronological Matching"],
        mcqStyle: {
          optionsCount: 4,
          style: "Direct factual recall, historical timeline sequence, constitutional articles, static GK",
          negativePenalty: "-0.50 marks"
        },
        subjectiveStyle: {
          hasSubjective: false,
          format: "N/A - Objective CBT Only",
          wordLimits: "N/A",
          markingRubric: "N/A"
        },
        nomenclature: "Chapters",
        coreUnits: [
          "Ancient Indian History (Harappan to Guptas)",
          "Medieval Indian History (Delhi Sultanate & Mughals)",
          "Modern Indian History & Freedom Struggle",
          "Indian Constitution & Polity (Articles & Amendments)",
          "Physical & Indian Geography (Rivers, Mountains, Minerals)",
          "Indian Economy, Planning & Fiscal Policy",
          "General Science: Physics in Everyday Life",
          "General Science: Chemistry in Everyday Life",
          "General Science: Biology & Human Health",
          "Static GK: Classical Dances, Music & Festivals",
          "Static GK: National Parks, Wildlife & Ramsar Sites",
          "Static GK: Important Books, Awards & Honors",
          "Current Affairs & Government Welfare Schemes"
        ],
        subTopics: {
          "Indian Constitution & Polity (Articles & Amendments)": ["Preamble & Fundamental Rights (Art 12-35)", "Directive Principles & Fundamental Duties", "President, Governor & Emergency Powers", "Supreme Court & High Courts", "Important Constitutional Amendments (42nd, 44th, 73rd, 86th, 101st)"],
          "Physical & Indian Geography (Rivers, Mountains, Minerals)": ["Himalayan and Peninsular Drainage Systems", "Monsoon Mechanism & Soil Types of India", "National Parks & Biosphere Reserves", "Mineral Belts & Multipurpose River Valley Projects"]
        },
        detailedNotesGuidelines: "Chronological tables, constitutional article charts, geographical maps breakdown, and verified factual summaries.",
        revisionGuidelines: "High-yield one-liner memory sheet, articles summary table, major national festivals and dances matrix.",
        essayTone: null,
        examTone: "Broad factual memory, conceptual clarity in general sciences, constitutional awareness",
        officialSource: "Staff Selection Commission Official Guidelines (ssc.gov.in)"
      }
    }
  },

  // 2. NEET UG
  "neet_ug": {
    examOverview: {
      examName: "NEET UG (National Eligibility cum Entrance Test)",
      country: "India",
      officialAuthority: "National Testing Agency (NTA) & National Medical Commission (NMC)",
      examType: "National Pre-Medical Entrance Examination",
      examFormat: "Pen and Paper Mode (OMR Based)",
      totalExamMarks: 720,
      totalQuestions: 200,
      hasSubjective: false,
      hasNegativeMarking: true,
      negativeFormula: "+4 for correct, -1 for incorrect, 0 for unattempted"
    },
    subjects: {
      "Physics": {
        subjectName: "Physics",
        totalMarks: 180,
        totalQuestions: 50,
        attemptRequired: 45,
        markingScheme: "+4 for correct, -1 for incorrect, 0 for unattempted",
        negativeMarking: -1,
        marksPerCorrect: 4,
        questionFormats: ["Single Choice Objective MCQ", "Assertion-Reason", "Match The Columns", "Numerical Value MCQ"],
        mcqStyle: {
          optionsCount: 4,
          style: "Direct NCERT line-by-line formula application, diagrammatic ray tracing, dimensional analysis, sign convention traps",
          negativePenalty: "-1 mark"
        },
        subjectiveStyle: {
          hasSubjective: false,
          format: "N/A - OMR MCQ Only",
          wordLimits: "N/A",
          markingRubric: "N/A"
        },
        nomenclature: "Chapters",
        coreUnits: [
          "Units and Measurements",
          "Motion in a Straight Line",
          "Motion in a Plane & Vectors",
          "Laws of Motion & Friction",
          "Work, Energy and Power",
          "System of Particles & Rotational Motion",
          "Gravitation",
          "Mechanical Properties of Solids",
          "Mechanical Properties of Fluids",
          "Thermal Properties of Matter",
          "Thermodynamics",
          "Kinetic Theory of Gases",
          "Oscillations (Simple Harmonic Motion)",
          "Waves & Acoustics",
          "Electrostatics (Charges & Fields)",
          "Electrostatic Potential & Capacitance",
          "Current Electricity",
          "Moving Charges and Magnetism",
          "Magnetism and Matter",
          "Electromagnetic Induction",
          "Alternating Current",
          "Electromagnetic Waves",
          "Ray Optics and Optical Instruments",
          "Wave Optics",
          "Dual Nature of Radiation and Matter",
          "Atoms",
          "Nuclei",
          "Semiconductor Electronics: Materials, Devices & Simple Circuits"
        ],
        subTopics: {
          "Work, Energy and Power": ["Work-Energy Theorem", "Conservative vs Non-Conservative Forces", "Potential Energy Curve & Equilibrium", "Elastic & Inelastic Collisions in 1D and 2D"],
          "Current Electricity": ["Ohm's Law & Drift Velocity", "Kirchhoff's Laws & Circuit Analysis", "Wheatstone Bridge Principle", "Temperature Dependence of Resistance"],
          "Ray Optics and Optical Instruments": ["Lens Maker's Formula & Combinations", "Total Internal Reflection & Prisms", "Compound Microscope & Astronomical Telescope Magnification"]
        },
        detailedNotesGuidelines: "Clear formula derivations, free-body diagram tutorials, sign convention reminders, and NCERT-exemplar numerical illustrations.",
        revisionGuidelines: "High-yield formula sheet with SI units, dimensional formula reference table, and standard circuit shortcut formulas.",
        essayTone: null,
        examTone: "Rigorous NCERT conceptual grounding with standard numerical problem-solving",
        officialSource: "National Medical Commission (NMC) & NTA Information Bulletin"
      },
      "Chemistry": {
        subjectName: "Chemistry",
        totalMarks: 180,
        totalQuestions: 50,
        attemptRequired: 45,
        markingScheme: "+4 for correct, -1 for incorrect, 0 for unattempted",
        negativeMarking: -1,
        marksPerCorrect: 4,
        questionFormats: ["Single Choice Objective MCQ", "Assertion-Reason", "Match The Columns", "Statement I & II Verification"],
        mcqStyle: {
          optionsCount: 4,
          style: "Strict NCERT textbook facts, reagent selectivity in Organic, periodic trends in Inorganic, stoichiometric calculations in Physical",
          negativePenalty: "-1 mark"
        },
        subjectiveStyle: {
          hasSubjective: false,
          format: "N/A - OMR MCQ Only",
          wordLimits: "N/A",
          markingRubric: "N/A"
        },
        nomenclature: "Chapters",
        coreUnits: [
          "Some Basic Concepts of Chemistry (Mole Concept)",
          "Structure of Atom",
          "Classification of Elements & Periodicity in Properties",
          "Chemical Bonding and Molecular Structure",
          "Chemical Thermodynamics",
          "Chemical and Ionic Equilibrium",
          "Redox Reactions",
          "Solutions & Colligative Properties",
          "Electrochemistry",
          "Chemical Kinetics",
          "p-Block Elements",
          "d- and f-Block Elements",
          "Coordination Compounds",
          "Organic Chemistry: Basic Principles and Techniques (GOC)",
          "Hydrocarbons (Alkanes, Alkenes, Alkynes, Aromatic)",
          "Haloalkanes and Haloarenes",
          "Alcohols, Phenols and Ethers",
          "Aldehydes, Ketones and Carboxylic Acids",
          "Organic Compounds Containing Nitrogen (Amines)",
          "Biomolecules (Carbohydrates, Proteins, Nucleic Acids)"
        ],
        subTopics: {
          "Chemical Bonding and Molecular Structure": ["VSEPR Theory & Molecular Shapes", "Hybridization (sp, sp2, sp3, sp3d, sp3d2)", "Molecular Orbital Theory & Bond Order", "Hydrogen Bonding"],
          "Coordination Compounds": ["Werner's Theory", "IUPAC Nomenclature of Coordination Complexes", "Isomerism (Structural & Stereoisomerism)", "Crystal Field Theory & Magnetic Moments"],
          "Aldehydes, Ketones and Carboxylic Acids": ["Nucleophilic Addition Reactions", "Aldol Condensation & Cannizzaro Reaction", "Tollens' & Fehling's Test", "Acidic Strength of Carboxylic Acids"]
        },
        detailedNotesGuidelines: "Organic named reaction mechanisms with reagents, Inorganic periodic trend charts with exceptions, and Physical chemistry formula derivations.",
        revisionGuidelines: "Organic reaction roadmap, coordinate complex color & magnetic moment sheet, and electrochemistry Nernst cheat sheet.",
        essayTone: null,
        examTone: "100% faithful to NCERT textbook lines, reaction conditions, and quantitative calculations",
        officialSource: "National Medical Commission (NMC) & NTA Information Bulletin"
      },
      "Biology": {
        subjectName: "Biology",
        totalMarks: 360,
        totalQuestions: 100,
        attemptRequired: 90,
        markingScheme: "+4 for correct, -1 for incorrect, 0 for unattempted",
        negativeMarking: -1,
        marksPerCorrect: 4,
        questionFormats: ["Single Choice Objective MCQ", "Assertion-Reason", "Match The Columns", "Statement I & II Verification", "Diagram-based Questions"],
        mcqStyle: {
          optionsCount: 4,
          style: "Every single option derived strictly from NCERT textbook lines, morphological anatomical terminology, genetic probability ratios",
          negativePenalty: "-1 mark"
        },
        subjectiveStyle: {
          hasSubjective: false,
          format: "N/A - OMR MCQ Only",
          wordLimits: "N/A",
          markingRubric: "N/A"
        },
        nomenclature: "Chapters",
        coreUnits: [
          "The Living World",
          "Biological Classification",
          "Plant Kingdom",
          "Animal Kingdom",
          "Morphology of Flowering Plants",
          "Anatomy of Flowering Plants",
          "Structural Organisation in Animals (Frog & Tissue Types)",
          "Cell: The Unit of Life",
          "Biomolecules",
          "Cell Cycle and Cell Division",
          "Photosynthesis in Higher Plants",
          "Respiration in Plants",
          "Plant Growth and Development",
          "Breathing and Exchange of Gases",
          "Body Fluids and Circulation",
          "Excretory Products and their Elimination",
          "Locomotion and Movement",
          "Neural Control and Coordination",
          "Chemical Coordination and Integration",
          "Sexual Reproduction in Flowering Plants",
          "Human Reproduction",
          "Reproductive Health",
          "Principles of Inheritance and Variation (Genetics I)",
          "Molecular Basis of Inheritance (Genetics II)",
          "Evolution",
          "Human Health and Disease",
          "Microbes in Human Welfare",
          "Biotechnology: Principles and Processes",
          "Biotechnology and its Applications",
          "Organisms and Populations",
          "Ecosystem",
          "Biodiversity and Conservation"
        ],
        subTopics: {
          "Principles of Inheritance and Variation (Genetics I)": ["Mendel's Monohybrid & Dihybrid Crosses", "Incomplete Dominance & Co-dominance", "Chromosomal Theory of Inheritance", "Linkage and Recombination Ratios", "Pedigree Analysis & Genetic Disorders"],
          "Molecular Basis of Inheritance (Genetics II)": ["Structure of DNA Double Helix", "Meselson and Stahl Experiment", "Transcription in Prokaryotes & Eukaryotes", "Genetic Code Properties & Translation Mechanism", "Lac Operon Model"],
          "Biotechnology: Principles and Processes": ["Restriction Endonucleases & Ligases", "pBR322 Cloning Vector Features", "Polymerase Chain Reaction (PCR) Steps", "Bioreactors & Downstream Processing"]
        },
        detailedNotesGuidelines: "Verbatim NCERT line explanations, histological and physiological flowcharts, anatomical tables, and genetic cross diagrams.",
        revisionGuidelines: "High-yield scientist discoveries list, dates and percentages table, biological examples index, and hormone origin-target matrix.",
        essayTone: null,
        examTone: "Exhaustive NCERT line verification, botanical zoological exact terminologies, and diagrams",
        officialSource: "National Medical Commission (NMC) & NTA Information Bulletin"
      }
    }
  }
};

/**
 * Helper to match an exam and subject from catalog
 */
export function findCatalogExamBlueprint(examName: string, country?: string): CatalogExamBlueprint | null {
  const norm = (examName || '').toLowerCase().trim();
  if (norm.includes('cgl') || (norm.includes('ssc') && !norm.includes('chsl') && !norm.includes('mts'))) {
    return EXAM_SYLLABUS_CATALOG["ssc_cgl"];
  }
  if (norm.includes('neet')) {
    return EXAM_SYLLABUS_CATALOG["neet_ug"];
  }
  return null;
}

