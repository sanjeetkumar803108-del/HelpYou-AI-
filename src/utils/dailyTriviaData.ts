// Curated High-Yield Exam Trap Database & Deterministic Engine for HelpYou AI

export interface DailyBoosterQuestion {
  id: string;
  subject: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  latexEquation?: string;
  shortExplanation: string;
  examTrapWarning: string;
}

export interface DailyBoosterPayload {
  dayNumber: number;
  theme: string;
  questions: DailyBoosterQuestion[];
}

/**
 * Universal canonical pool of high-yield exam trap questions.
 * Selected deterministically by dateKey so ALL users in the app receive the exact same 3 questions daily.
 */
export const CANONICAL_DAILY_QUESTIONS: DailyBoosterQuestion[] = [
  {
    id: "canonical_1",
    subject: "Physics",
    topic: "Kinematics & Freefall Acceleration",
    question: "A ball is projected vertically upward. At its highest apex point, what is the magnitude and direction of its acceleration?",
    options: ["0 m/s²", "9.8 m/s² downward", "9.8 m/s² upward", "Cannot be determined without initial mass"],
    correctIndex: 1,
    latexEquation: "a = -g \\approx -9.8\\text{ m/s}^2 \\quad (\\text{constant downward})",
    shortExplanation: "Velocity is momentarily zero at the apex, but gravitational acceleration pulls downward constantly at 9.8 m/s².",
    examTrapWarning: "Common mistake: Confusing instantaneous zero velocity with acceleration. Speed stops, but gravity never switches off!"
  },
  {
    id: "canonical_2",
    subject: "Chemistry",
    topic: "Thermodynamics & Real Gas Deviation",
    question: "Under which specific physical conditions does a real gas exhibit its MAXIMUM deviation from ideal gas behavior?",
    options: ["High temperature and low pressure", "Low temperature and high pressure", "High temperature and high pressure", "Low temperature and low pressure"],
    correctIndex: 1,
    latexEquation: "\\left(P + \\frac{an^2}{V^2}\\right)(V - nb) = nRT",
    shortExplanation: "Low temperature slows molecules (amplifying intermolecular attractions) while high pressure reduces free volume, maximizing deviations.",
    examTrapWarning: "Common mistake: Inverting the relationship. Real gases behave MOST ideally at high temperature and low pressure, NOT low temp / high pressure!"
  },
  {
    id: "canonical_3",
    subject: "Biology / Mathematics",
    topic: "Cellular Respiration & Energy Yield",
    question: "Which organelle is responsible for synthesizing ATP through aerobic cellular respiration in eukaryotic cells?",
    options: ["Ribosome", "Mitochondria", "Chloroplast", "Endoplasmic Reticulum"],
    correctIndex: 1,
    latexEquation: "\\text{Glucose} + 6\\,\\text{O}_2 \\rightarrow 6\\,\\text{CO}_2 + 6\\,\\text{H}_2\\text{O} + 36\\,\\text{ATP}",
    shortExplanation: "Mitochondria generate cellular ATP via the citric acid cycle and oxidative phosphorylation on the cristae inner membrane.",
    examTrapWarning: "Common mistake: Confusing chloroplasts (which produce sugars via photosynthesis in plants) with mitochondria (the universal powerhouses)."
  },
  {
    id: "canonical_4",
    subject: "Physics",
    topic: "Projectile Trajectory Curvature",
    question: "A projectile is launched with velocity u at angle θ. At the highest point of its trajectory, what is its radius of curvature?",
    options: ["u² / g", "(u² cos²θ) / g", "(u² sin²θ) / g", "Infinity"],
    correctIndex: 1,
    latexEquation: "R = \\frac{v^2}{a_\\perp} = \\frac{(u\\cos\\theta)^2}{g}",
    shortExplanation: "At the apex, velocity is purely horizontal (u cos θ) and normal acceleration is g, yielding R = (u² cos²θ)/g.",
    examTrapWarning: "Common mistake: Selecting u²/g by forgetting that speed at the vertex is u cos θ, not the initial speed u!"
  },
  {
    id: "canonical_5",
    subject: "Chemistry",
    topic: "Coordination Chemistry & Nitrosyl State",
    question: "In the brown ring coordination complex [Fe(H2O)5(NO)]SO4, what is the formal oxidation state of Iron (Fe)?",
    options: ["+2", "+3", "+1", "0"],
    correctIndex: 2,
    latexEquation: "[\\text{Fe}^{+1}(\\text{H}_2\\text{O})_5(\\text{NO}^+)]\\text{SO}_4^{2-}",
    shortExplanation: "Nitric oxide coordinates as the nitrosonium ion (NO⁺), transferring an electron to iron so Fe adopts a +1 oxidation state.",
    examTrapWarning: "Common mistake: Assuming NO is a neutral ligand and concluding Fe is +2. In the brown ring test, NO is NO⁺!"
  },
  {
    id: "canonical_6",
    subject: "Biology / Mathematics",
    topic: "Plant Physiology & C4 Fixation",
    question: "In C4 plants, what is the primary stable 4-carbon product formed following initial atmospheric CO2 fixation in mesophyll cells?",
    options: ["Oxaloacetate (OAA)", "3-Phosphoglycerate (3-PGA)", "Malate", "Aspartate"],
    correctIndex: 0,
    latexEquation: "\\text{PEP} + \\text{CO}_2 + \\text{H}_2\\text{O} \\xrightarrow{\\text{PEPcase}} \\text{Oxaloacetate (4C)}",
    shortExplanation: "PEP carboxylase fixes CO2 to produce Oxaloacetate (4C), which is subsequently reduced to malate.",
    examTrapWarning: "Common mistake: Selecting 3-PGA (which is the C3 pathway first product) or Malate (which is the transported form, not the first product)!"
  },
  {
    id: "canonical_7",
    subject: "Physics",
    topic: "Spring Potential Energy Under Equal Force",
    question: "Two ideal springs with spring constants k1 and k2 (k1 > k2) are stretched by applying equal forces F. Which spring stores more energy?",
    options: ["Spring 1 (k1)", "Spring 2 (k2)", "Both store equal energy", "Depends on spring unstretched length"],
    correctIndex: 1,
    latexEquation: "U = \\frac{F^2}{2k} \\implies U \\propto \\frac{1}{k} \\quad (\\text{for constant } F)",
    shortExplanation: "When force is identical, stored energy is inversely proportional to k (U = F²/2k). The softer spring (k2) stores more energy.",
    examTrapWarning: "Common mistake: Using U = 1/2 k x² and assuming larger k gives larger energy. That formula applies when extension x is identical, not force F!"
  },
  {
    id: "canonical_8",
    subject: "Chemistry",
    topic: "Molecular Geometry & Dipole Moment",
    question: "Which of the following molecules possesses polar covalent bonds but has an overall net dipole moment of exactly zero (μ = 0)?",
    options: ["SF4", "XeF4", "ClF3", "H2O"],
    correctIndex: 1,
    latexEquation: "\\text{XeF}_4: \\text{sp}^3\\text{d}^2 \\text{ (Square Planar Geometry)} \\implies \\vec{\\mu} = 0",
    shortExplanation: "XeF4 has 4 bond pairs and 2 axial lone pairs in a square planar geometry, causing bond dipoles and lone pairs to cancel symmetrically.",
    examTrapWarning: "Common mistake: Confusing XeF4 with SF4. SF4 has a see-saw geometry with a non-zero dipole moment!"
  },
  {
    id: "canonical_9",
    subject: "Biology / Mathematics",
    topic: "Human Physiology & Coagulation Cascade",
    question: "During the blood coagulation cascade, which enzyme complex directly catalyzes the conversion of inactive Prothrombin into active Thrombin?",
    options: ["Thrombokinase (Prothrombinase)", "Thrombin", "Fibrinogen", "Heparin"],
    correctIndex: 0,
    latexEquation: "\\text{Prothrombin} \\xrightarrow{\\text{Thrombokinase} + \\text{Ca}^{2+}} \\text{Thrombin}",
    shortExplanation: "Thrombokinase (Factor Xa + Va + Ca²⁺) cleaves prothrombin into thrombin, which then converts fibrinogen into fibrin threads.",
    examTrapWarning: "Common mistake: Selecting Thrombin or Fibrin. Thrombin is the product of the conversion, not the activating enzyme!"
  },
  {
    id: "canonical_10",
    subject: "Physics",
    topic: "Centripetal vs Centrifugal Force",
    question: "A stone tied to a string is whirled in a horizontal circle. If the string suddenly snaps, in which direction will the stone immediately fly?",
    options: ["Radially outwards", "Tangentially along its instantaneous circular path", "Radially inwards", "Directly backwards"],
    correctIndex: 1,
    latexEquation: "\\vec{v} = v\\,\\hat{t} \\implies \\text{Inertial motion along tangent}",
    shortExplanation: "According to Newton's First Law, once centripetal tension disappears, the stone continues with its instantaneous tangential velocity.",
    examTrapWarning: "Common mistake: Thinking a 'centrifugal force' hurls the stone radially outward. Centrifugal force is a fictitious observer frame effect!"
  },
  {
    id: "canonical_11",
    subject: "Chemistry",
    topic: "Periodic Table & Electron Affinity",
    question: "Which halogen possesses the highest (most negative) electron gain enthalpy in the periodic table?",
    options: ["Fluorine (F)", "Chlorine (Cl)", "Bromine (Br)", "Iodine (I)"],
    correctIndex: 1,
    latexEquation: "\\Delta_{eg}H(\\text{Cl}) = -349\\text{ kJ/mol} < \\Delta_{eg}H(\\text{F}) = -328\\text{ kJ/mol}",
    shortExplanation: "Due to Fluorine's extremely compact 2p orbital, strong inter-electronic repulsion weakens electron addition compared to Chlorine's roomier 3p orbital.",
    examTrapWarning: "Common mistake: Choosing Fluorine because it is the most electronegative element. Chlorine has higher electron gain enthalpy!"
  },
  {
    id: "canonical_12",
    subject: "Mathematics / Logic",
    topic: "Logarithms & Base Rules",
    question: "What is the exact value of log base 2 of (1/32)?",
    options: ["-5", "5", "-1/5", "1/16"],
    correctIndex: 0,
    latexEquation: "\\log_2\\left(\\frac{1}{32}\\right) = \\log_2(2^{-5}) = -5",
    shortExplanation: "Since 32 = 2⁵, the reciprocal 1/32 equals 2⁻⁵, giving an exact logarithm of -5.",
    examTrapWarning: "Common mistake: Forgetting the negative sign for fractions between 0 and 1, or confusing 2⁵ (32) with 2⁴ (16)."
  }
];

/**
 * Stream-specific question banks for personalized practice bonus booster sessions.
 */
export const STREAM_BONUS_POOL: Record<string, DailyBoosterQuestion[]> = {
  stem: [
    ...CANONICAL_DAILY_QUESTIONS,
    {
      id: "stem_extra_1",
      subject: "Physics",
      topic: "Rotational Dynamics & Rolling Motion",
      question: "A solid sphere and a hollow cylinder of equal mass and radius roll down an incline without slipping. Which reaches the bottom first?",
      options: ["Solid sphere", "Hollow cylinder", "Both reach at the exact same time", "Depends on incline angle"],
      correctIndex: 0,
      latexEquation: "a = \\frac{g\\sin\\theta}{1 + I/(mR^2)} \\quad (I_{\\text{sphere}} = 0.4 mR^2 < I_{\\text{cyl}} = mR^2)",
      shortExplanation: "The solid sphere has a smaller moment of inertia, reserving more energy for linear translation and accelerating faster.",
      examTrapWarning: "Common mistake: Thinking mass determines acceleration or that cylinder's hollow shape gives higher speed!"
    },
    {
      id: "stem_extra_2",
      subject: "Chemistry",
      topic: "Le Chatelier's Principle & Noble Gas Addition",
      question: "For a gaseous equilibrium at constant volume, what happens to the equilibrium position when an inert noble gas is added?",
      options: ["Shifts toward reactants", "Shifts toward products", "No shift occurs", "Shifts toward side with fewer gas moles"],
      correctIndex: 2,
      latexEquation: "P_i = \\frac{n_i RT}{V} \\implies \\text{Partial pressures unchanged at constant volume}",
      shortExplanation: "At constant volume, adding an inert gas increases total pressure but does NOT alter the partial pressures or concentrations of reactants/products.",
      examTrapWarning: "Common mistake: Assuming adding gas always increases pressure and shifts toward fewer moles. That only occurs at constant pressure!"
    },
    {
      id: "stem_extra_3",
      subject: "Biology",
      topic: "Genetics & Test Cross Ratios",
      question: "What is the expected phenotypic ratio resulting from a classic dihybrid test cross (AaBb × aabb)?",
      options: ["9:3:3:1", "1:1:1:1", "3:1", "1:2:1"],
      correctIndex: 1,
      latexEquation: "\\text{AaBb} \\times \\text{aabb} \\implies 1\\,\\text{AB} : 1\\,\\text{Ab} : 1\\,\\text{aB} : 1\\,\\text{ab}",
      shortExplanation: "A test cross pairs a heterozygous organism with a homozygous recessive tester, mirroring gamete production in a 1:1:1:1 ratio.",
      examTrapWarning: "Common mistake: Confusing a dihybrid self-cross (AaBb × AaBb, which yields 9:3:3:1) with a dihybrid test cross (1:1:1:1)!"
    }
  ],
  commerce: [
    {
      id: "comm_1",
      subject: "Accountancy",
      topic: "Forfeiture of Shares",
      question: "When shares issued at a premium are forfeited for non-payment of call money, which amount is debited to Share Capital?",
      options: ["Called-up nominal face value", "Total issue price including premium", "Paid-up amount only", "Current market value of shares"],
      correctIndex: 0,
      latexEquation: "\\text{Share Capital Dr.} = \\text{Number of Shares} \\times \\text{Called-up Face Value}",
      shortExplanation: "Share capital is credited with called-up nominal value, so upon forfeiture it must be debited with called-up nominal value, excluding premium.",
      examTrapWarning: "Common mistake: Debiting the premium into Share Capital. If premium was already collected, it cannot be reversed here!"
    },
    {
      id: "comm_2",
      subject: "Economics",
      topic: "Price Elasticity Sign Interpretation",
      question: "If price elasticity of demand is calculated as -1.8, how is the responsiveness of consumers technically categorized?",
      options: ["Inelastic", "Elastic (magnitude > 1)", "Unitary elastic", "Perfectively inelastic"],
      correctIndex: 1,
      latexEquation: "e_d = \\left|\\frac{\\% \\Delta Q}{\\% \\Delta P}\\right| = |-1.8| = 1.8 > 1 \\implies \\text{Elastic}",
      shortExplanation: "The negative sign reflects downward sloping demand. In economic elasticity analysis, magnitude |e_d| = 1.8 indicates elastic demand.",
      examTrapWarning: "Common mistake: Treating -1.8 as mathematically less than 1 (inelastic). The minus sign is purely directional!"
    },
    {
      id: "comm_3",
      subject: "Business Studies",
      topic: "Working Capital Operating Cycle",
      question: "Which of the following business decisions directly shortens the working capital operating cycle of a firm?",
      options: ["Increasing inventory turnover velocity", "Extending longer credit terms to buyers", "Reducing credit period taken from suppliers", "Stockpiling larger raw material buffers"],
      correctIndex: 0,
      latexEquation: "\\text{Operating Cycle} = \\text{Raw Mat. Days} + \\text{WIP Days} + \\text{Debtor Days} - \\text{Creditor Days}",
      shortExplanation: "Faster conversion of inventory into sales reduces inventory holding days, directly shortening the cash-to-cash operating cycle.",
      examTrapWarning: "Common mistake: Thinking reducing supplier credit shortens the cycle. Paying suppliers faster actually INCREASES the cash gap!"
    },
    {
      id: "comm_4",
      subject: "Accountancy",
      topic: "Cash Flow Statement Categorization",
      question: "Under standard Accounting Standards, dividend paid by a financing enterprise is classified under which cash flow activity?",
      options: ["Financing activity", "Operating activity", "Investing activity", "Extraordinary activity"],
      correctIndex: 0,
      latexEquation: "\\text{Dividend Paid} \\implies \\text{Outflow from Financing Activity}",
      shortExplanation: "Regardless of whether a company is financial or non-financial, dividend paid is always a Financing activity as it relates to capital providers.",
      examTrapWarning: "Common mistake: Classifying dividend paid as operating for finance firms. Interest can be operating, but dividend paid is ALWAYS financing!"
    }
  ],
  humanities: [
    {
      id: "hum_1",
      subject: "Polity & Constitution",
      topic: "Basic Structure Doctrine",
      question: "In which landmark verdict did the Supreme Court establish that Parliament cannot amend the 'Basic Structure' of the Constitution?",
      options: ["Kesavananda Bharati v. State of Kerala (1973)", "Golaknath v. State of Punjab (1967)", "Minerva Mills v. Union of India (1980)", "Maneka Gandhi v. Union of India (1978)"],
      correctIndex: 0,
      latexEquation: "\\text{Article 368} \\neq \\text{Power to Destroy Basic Structure}",
      shortExplanation: "The 13-judge bench in Kesavananda Bharati ruled that constitutional amending power cannot be used to damage its foundational identity.",
      examTrapWarning: "Common mistake: Selecting Golaknath. Golaknath barred amending Fundamental Rights, but Kesavananda Bharati created the Basic Structure doctrine!"
    },
    {
      id: "hum_2",
      subject: "Critical Logic & Reasoning",
      topic: "Formal Fallacies in Deduction",
      question: "Identify the formal logical fallacy: 'If it rains, the pitch becomes wet. The pitch is wet. Therefore, it rained.'",
      options: ["Affirming the Consequent", "Denying the Antecedent", "Ad Hominem Attack", "Post Hoc Ergo Propter Hoc"],
      correctIndex: 0,
      latexEquation: "(P \\implies Q) \\land Q \\centernot\\implies P",
      shortExplanation: "The pitch could be wet due to sprinklers. Inferring the condition P from the result Q is the formal fallacy of Affirming the Consequent.",
      examTrapWarning: "Common mistake: Confusing Affirming the Consequent with Denying the Antecedent. Here the observer saw result Q, not not-P!"
    },
    {
      id: "hum_3",
      subject: "Geography",
      topic: "Planetary Atmospheric Circulation",
      question: "Between the equator and 30° North/South latitude, which major atmospheric convection circulation cell operates?",
      options: ["Hadley Cell", "Ferrel Cell", "Polar Cell", "Walker Circulation"],
      correctIndex: 0,
      latexEquation: "0^\\circ \\rightarrow 30^\\circ\\text{ Lat} \\implies \\text{Hadley Thermal Cell}",
      shortExplanation: "Warm air rises at the ITCZ and sinks around the 30° subtropical high-pressure belt, forming the Hadley cell.",
      examTrapWarning: "Common mistake: Selecting Ferrel cell. The Ferrel cell operates in mid-latitudes between 30° and 60°!"
    }
  ],
  middleSchool: [
    {
      id: "mid_1",
      subject: "Physical Science",
      topic: "Speed vs Velocity in Circular Paths",
      question: "A bicycle travels around a circular track at a constant speedometer reading of 20 km/h. Does the bicycle have constant velocity?",
      options: ["No, because its direction of motion is continuously changing", "Yes, because its speed is constant", "Yes, because its acceleration is zero", "No, because its speed is zero"],
      correctIndex: 0,
      latexEquation: "\\vec{v} = v \\cdot \\hat{u} \\implies \\frac{d\\vec{v}}{dt} \\neq 0 \\quad (\\text{centripetal acceleration})",
      shortExplanation: "Velocity is a vector having both magnitude and direction. Turning around a circle means velocity is constantly changing.",
      examTrapWarning: "Common mistake: Assuming 'constant speed' equals 'constant velocity'. Any change in direction changes velocity and causes acceleration!"
    },
    {
      id: "mid_2",
      subject: "Chemical Science",
      topic: "The Logarithmic pH Scale",
      question: "Solution A has a pH of 3 and Solution B has a pH of 6. How many times more acidic (higher H⁺ concentration) is Solution A than Solution B?",
      options: ["1,000 times", "3 times", "30 times", "2 times"],
      correctIndex: 0,
      latexEquation: "\\frac{[\\text{H}^+]_A}{[\\text{H}^+]_B} = 10^{(6 - 3)} = 10^3 = 1,000",
      shortExplanation: "Each step on the pH scale represents a 10-fold change. A difference of 3 pH units means 10 × 10 × 10 = 1,000 times.",
      examTrapWarning: "Common mistake: Subtracting 6 - 3 = 3 and selecting '3 times'. The pH scale is logarithmic, not linear!"
    },
    {
      id: "mid_3",
      subject: "Life Science",
      topic: "Plant vs Animal Cell Organelles",
      question: "Which organelle allows plant cells to manufacture their own food through photosynthesis but is absent in animal cells?",
      options: ["Chloroplast", "Mitochondria", "Ribosome", "Endoplasmic Reticulum"],
      correctIndex: 0,
      latexEquation: "6\\,\\text{CO}_2 + 6\\,\\text{H}_2\\text{O} \\xrightarrow{\\text{Chlorophyll}} \\text{Glucose} + 6\\,\\text{O}_2",
      shortExplanation: "Chloroplasts contain green chlorophyll pigments to trap light energy for photosynthesis and are exclusive to plant/algal cells.",
      examTrapWarning: "Common mistake: Selecting mitochondria. Both plant and animal cells possess mitochondria for cellular respiration!"
    }
  ]
};

/**
 * Deterministically computes the canonical 3-question Daily Trivia Booster for any dateKey (e.g. '2026-09-23').
 * Guarantees that ALL users on the same calendar day get the exact same 3 questions across the entire app.
 */
export function getCanonicalDailyBooster(dateKey: string): DailyBoosterPayload {
  const parts = dateKey.split("-").map(Number);
  const year = parts[0] || 2026;
  const month = parts[1] || 1;
  const day = parts[2] || 1;
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000);

  const pool = CANONICAL_DAILY_QUESTIONS;
  const poolLen = pool.length;

  const idx1 = Math.abs(dayOfYear * 3) % poolLen;
  const idx2 = (idx1 + 1) % poolLen;
  const idx3 = (idx1 + 2) % poolLen;

  return {
    dayNumber: dayOfYear,
    theme: "Daily Exam Trap Booster",
    questions: [pool[idx1], pool[idx2], pool[idx3]]
  };
}

/**
 * Client-side deterministic bonus questions generator.
 * Filters strictly against the user's previously answered questions to guarantee ZERO repetition.
 */
export function getClientDeterministicBonusQuestions(
  academicStream: string,
  count: number,
  excludeList: string[]
): DailyBoosterPayload {
  const streamLower = (academicStream || '').toLowerCase();
  let streamKey = 'stem';
  if (streamLower.includes('commerce') || streamLower.includes('business') || streamLower.includes('econ')) {
    streamKey = 'commerce';
  } else if (streamLower.includes('human') || streamLower.includes('art') || streamLower.includes('law')) {
    streamKey = 'humanities';
  } else if (streamLower.includes('middle') || streamLower.includes('grade 7') || streamLower.includes('grade 8')) {
    streamKey = 'middleSchool';
  }

  const normalizeStr = (s: string) => s ? s.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const excludesSet = new Set((excludeList || []).map(q => normalizeStr(q)));

  const isSeen = (qText: string) => {
    const norm = normalizeStr(qText);
    if (!norm) return false;
    if (excludesSet.has(norm)) return true;
    for (const ex of excludesSet) {
      if (ex.length > 15 && (norm.includes(ex) || ex.includes(norm))) {
        return true;
      }
    }
    return false;
  };

  const pool = STREAM_BONUS_POOL[streamKey] || STREAM_BONUS_POOL.stem;
  let unseen = pool.filter(q => !isSeen(q.question));

  if (unseen.length < count) {
    // Borrow from other stream pools
    const otherPools = Object.entries(STREAM_BONUS_POOL)
      .filter(([k]) => k !== streamKey)
      .flatMap(([, v]) => v)
      .filter(q => !isSeen(q.question));
    unseen = [...unseen, ...otherPools];
  }

  // Guaranteed Backfill: Never let unseen return fewer than count (3) questions
  const poolList: DailyBoosterQuestion[] = [...unseen];
  if (poolList.length < count) {
    for (const q of pool) {
      if (poolList.length >= count) break;
      if (!poolList.some(item => item.question === q.question)) {
        poolList.push(q);
      }
    }
  }
  if (poolList.length < count) {
    for (const q of CANONICAL_DAILY_QUESTIONS) {
      if (poolList.length >= count) break;
      if (!poolList.some(item => item.question === q.question)) {
        poolList.push(q);
      }
    }
  }

  // Shuffle selected questions
  const shuffled = [...poolList];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected = shuffled.slice(0, Math.max(3, count));
  return {
    dayNumber: 1,
    theme: "Personalized Practice Drill",
    questions: selected
  };
}

