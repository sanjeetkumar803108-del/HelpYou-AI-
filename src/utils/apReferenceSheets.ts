/**
 * Official College Board AP® Exam Reference Sheets & Interactive Periodic Table
 * Provides high-yield formulas, constants, and tables for Calculus, Physics, Chemistry, Biology & CSP.
 */

export interface APReferenceItem {
  category: string;
  items: Array<{
    name: string;
    formula?: string;
    notes?: string;
  }>;
}

export interface PeriodicElement {
  number: number;
  symbol: string;
  name: string;
  mass: string;
  category: 'nonmetal' | 'noble-gas' | 'alkali-metal' | 'alkaline-earth' | 'transition-metal' | 'post-transition' | 'metalloid' | 'halogen' | 'lanthanide' | 'actinide';
  electronegativity?: string;
}

// Full Elements for AP Chemistry Periodic Table
export const AP_PERIODIC_TABLE: PeriodicElement[] = [
  { number: 1, symbol: 'H', name: 'Hydrogen', mass: '1.008', category: 'nonmetal', electronegativity: '2.20' },
  { number: 2, symbol: 'He', name: 'Helium', mass: '4.003', category: 'noble-gas' },
  { number: 3, symbol: 'Li', name: 'Lithium', mass: '6.941', category: 'alkali-metal', electronegativity: '0.98' },
  { number: 4, symbol: 'Be', name: 'Beryllium', mass: '9.012', category: 'alkaline-earth', electronegativity: '1.57' },
  { number: 5, symbol: 'B', name: 'Boron', mass: '10.81', category: 'metalloid', electronegativity: '2.04' },
  { number: 6, symbol: 'C', name: 'Carbon', mass: '12.011', category: 'nonmetal', electronegativity: '2.55' },
  { number: 7, symbol: 'N', name: 'Nitrogen', mass: '14.007', category: 'nonmetal', electronegativity: '3.04' },
  { number: 8, symbol: 'O', name: 'Oxygen', mass: '15.999', category: 'nonmetal', electronegativity: '3.44' },
  { number: 9, symbol: 'F', name: 'Fluorine', mass: '18.998', category: 'halogen', electronegativity: '3.98' },
  { number: 10, symbol: 'Ne', name: 'Neon', mass: '20.180', category: 'noble-gas' },
  { number: 11, symbol: 'Na', name: 'Sodium', mass: '22.990', category: 'alkali-metal', electronegativity: '0.93' },
  { number: 12, symbol: 'Mg', name: 'Magnesium', mass: '24.305', category: 'alkaline-earth', electronegativity: '1.31' },
  { number: 13, symbol: 'Al', name: 'Aluminum', mass: '26.982', category: 'post-transition', electronegativity: '1.61' },
  { number: 14, symbol: 'Si', name: 'Silicon', mass: '28.086', category: 'metalloid', electronegativity: '1.90' },
  { number: 15, symbol: 'P', name: 'Phosphorus', mass: '30.974', category: 'nonmetal', electronegativity: '2.19' },
  { number: 16, symbol: 'S', name: 'Sulfur', mass: '32.065', category: 'nonmetal', electronegativity: '2.58' },
  { number: 17, symbol: 'Cl', name: 'Chlorine', mass: '35.453', category: 'halogen', electronegativity: '3.16' },
  { number: 18, symbol: 'Ar', name: 'Argon', mass: '39.948', category: 'noble-gas' },
  { number: 19, symbol: 'K', name: 'Potassium', mass: '39.098', category: 'alkali-metal', electronegativity: '0.82' },
  { number: 20, symbol: 'Ca', name: 'Calcium', mass: '40.078', category: 'alkaline-earth', electronegativity: '1.00' },
  { number: 21, symbol: 'Sc', name: 'Scandium', mass: '44.956', category: 'transition-metal', electronegativity: '1.36' },
  { number: 22, symbol: 'Ti', name: 'Titanium', mass: '47.867', category: 'transition-metal', electronegativity: '1.54' },
  { number: 23, symbol: 'V', name: 'Vanadium', mass: '50.942', category: 'transition-metal', electronegativity: '1.63' },
  { number: 24, symbol: 'Cr', name: 'Chromium', mass: '51.996', category: 'transition-metal', electronegativity: '1.66' },
  { number: 25, symbol: 'Mn', name: 'Manganese', mass: '54.938', category: 'transition-metal', electronegativity: '1.55' },
  { number: 26, symbol: 'Fe', name: 'Iron', mass: '55.845', category: 'transition-metal', electronegativity: '1.83' },
  { number: 27, symbol: 'Co', name: 'Cobalt', mass: '58.933', category: 'transition-metal', electronegativity: '1.88' },
  { number: 28, symbol: 'Ni', name: 'Nickel', mass: '58.693', category: 'transition-metal', electronegativity: '1.91' },
  { number: 29, symbol: 'Cu', name: 'Copper', mass: '63.546', category: 'transition-metal', electronegativity: '1.90' },
  { number: 30, symbol: 'Zn', name: 'Zinc', mass: '65.38', category: 'transition-metal', electronegativity: '1.65' },
  { number: 31, symbol: 'Ga', name: 'Gallium', mass: '69.723', category: 'post-transition', electronegativity: '1.81' },
  { number: 32, symbol: 'Ge', name: 'Germanium', mass: '72.630', category: 'metalloid', electronegativity: '2.01' },
  { number: 33, symbol: 'As', name: 'Arsenic', mass: '74.922', category: 'metalloid', electronegativity: '2.18' },
  { number: 34, symbol: 'Se', name: 'Selenium', mass: '78.96', category: 'nonmetal', electronegativity: '2.55' },
  { number: 35, symbol: 'Br', name: 'Bromine', mass: '79.904', category: 'halogen', electronegativity: '2.96' },
  { number: 36, symbol: 'Kr', name: 'Krypton', mass: '83.798', category: 'noble-gas', electronegativity: '3.00' },
  { number: 47, symbol: 'Ag', name: 'Silver', mass: '107.87', category: 'transition-metal', electronegativity: '1.93' },
  { number: 53, symbol: 'I', name: 'Iodine', mass: '126.90', category: 'halogen', electronegativity: '2.66' },
  { number: 56, symbol: 'Ba', name: 'Barium', mass: '137.33', category: 'alkaline-earth', electronegativity: '0.89' },
  { number: 79, symbol: 'Au', name: 'Gold', mass: '196.97', category: 'transition-metal', electronegativity: '2.54' },
  { number: 80, symbol: 'Hg', name: 'Mercury', mass: '200.59', category: 'transition-metal', electronegativity: '2.00' },
  { number: 82, symbol: 'Pb', name: 'Lead', mass: '207.2', category: 'post-transition', electronegativity: '2.33' },
  { number: 92, symbol: 'U', name: 'Uranium', mass: '238.03', category: 'actinide', electronegativity: '1.38' }
];

export const AP_REFERENCE_DATA: Record<string, { title: string; subtitle: string; hasPeriodicTable?: boolean; sections: APReferenceItem[] }> = {
  'ap-calculus-ab': {
    title: 'AP® Calculus AB Reference Sheet',
    subtitle: 'Official College Board Limits, Derivatives & Integrals Reference',
    sections: [
      {
        category: 'Differential Calculus Rules',
        items: [
          { name: 'Power Rule', formula: 'd/dx [x^n] = n * x^(n - 1)' },
          { name: 'Product Rule', formula: 'd/dx [f * g] = f * g\' + f\' * g' },
          { name: 'Quotient Rule', formula: 'd/dx [f / g] = (g * f\' - f * g\') / g^2' },
          { name: 'Chain Rule', formula: 'd/dx [f(g(x))] = f\'(g(x)) * g\'(x)' },
          { name: 'Exponential Base e', formula: 'd/dx [e^(kx)] = k * e^(kx)' },
          { name: 'Natural Logarithm', formula: 'd/dx [ln|x|] = 1 / x,  (x != 0)' }
        ]
      },
      {
        category: 'Trigonometric Derivatives',
        items: [
          { name: 'Sine & Cosine', formula: 'd/dx [sin x] = cos x  |  d/dx [cos x] = -sin x' },
          { name: 'Tangent & Secant', formula: 'd/dx [tan x] = sec^2 x  |  d/dx [sec x] = sec x * tan x' },
          { name: 'Cotangent & Cosecant', formula: 'd/dx [cot x] = -csc^2 x  |  d/dx [csc x] = -csc x * cot x' },
          { name: 'Inverse Trig', formula: 'd/dx [arcsin x] = 1/sqrt(1 - x^2)  |  d/dx [arctan x] = 1/(1 + x^2)' }
        ]
      },
      {
        category: 'Integral Calculus & Accumulation',
        items: [
          { name: 'Fundamental Theorem Part 1', formula: 'd/dx [\\int_{a}^{x} f(t) dt] = f(x)' },
          { name: 'Fundamental Theorem Part 2', formula: '\\int_{a}^{b} f\'(x) dx = f(b) - f(a)' },
          { name: 'Average Value of Function', formula: 'f_{avg} = (1 / (b - a)) * \\int_{a}^{b} f(x) dx' },
          { name: 'Disk Method (Volume of Revolution)', formula: 'V = \\pi * \\int_{a}^{b} [R(x)]^2 dx' },
          { name: 'Washer Method', formula: 'V = \\pi * \\int_{a}^{b} ([R(x)]^2 - [r(x)]^2) dx' }
        ]
      }
    ]
  },

  'ap-calculus-bc': {
    title: 'AP® Calculus BC Reference Sheet',
    subtitle: 'Official College Board Calculus BC (AB Material + Series, Polar & Parametric)',
    sections: [
      {
        category: 'Parametric & Polar Calculus',
        items: [
          { name: 'Parametric Slope', formula: 'dy/dx = (dy/dt) / (dx/dt)' },
          { name: 'Parametric 2nd Derivative', formula: 'd^2y/dx^2 = (d/dt [dy/dx]) / (dx/dt)' },
          { name: 'Arc Length (Parametric)', formula: 'L = \\int_{a}^{b} sqrt((dx/dt)^2 + (dy/dt)^2) dt' },
          { name: 'Polar Area', formula: 'A = (1/2) * \\int_{\\alpha}^{\\beta} [r(\\theta)]^2 d\\theta' }
        ]
      },
      {
        category: 'Integration Techniques & Series',
        items: [
          { name: 'Integration by Parts', formula: '\\int u dv = u * v - \\int v du' },
          { name: 'Geometric Series Sum', formula: 'S = a / (1 - r),  when |r| < 1' },
          { name: 'Taylor Series Expansion', formula: 'f(x) = \\sum_{n=0}^{\\infty} [f^{(n)}(c) / n!] * (x - c)^n' },
          { name: 'Maclaurin e^x', formula: 'e^x = 1 + x + x^2/2! + x^3/3! + ...' },
          { name: 'Maclaurin sin x', formula: 'sin x = x - x^3/3! + x^5/5! - ...' },
          { name: 'Maclaurin cos x', formula: 'cos x = 1 - x^2/2! + x^4/4! - ...' }
        ]
      }
    ]
  },

  'ap-physics-1': {
    title: 'AP® Physics 1 Reference Sheet',
    subtitle: 'Official College Board Equations & Fundamental Physical Constants',
    sections: [
      {
        category: 'Fundamental Constants & Values',
        items: [
          { name: 'Acceleration due to Gravity', formula: 'g = 9.8 m/s^2  (or 10 m/s^2 on AP exam)' },
          { name: 'Universal Gravitational Constant', formula: 'G = 6.67 x 10^-11 N*m^2/kg^2' }
        ]
      },
      {
        category: 'Kinematics & 1D/2D Motion',
        items: [
          { name: 'Velocity-Time', formula: 'v_x = v_{x0} + a_x * t' },
          { name: 'Position-Time', formula: 'x = x_0 + v_{x0}*t + (1/2)*a_x*t^2' },
          { name: 'Velocity-Displacement', formula: 'v_x^2 = v_{x0}^2 + 2*a_x*(x - x_0)' }
        ]
      },
      {
        category: 'Dynamics, Work, Energy & Momentum',
        items: [
          { name: 'Newton\'s Second Law', formula: 'a = \\Sigma F / m  =>  \\Sigma F = m * a' },
          { name: 'Kinetic Energy', formula: 'K = (1/2) * m * v^2' },
          { name: 'Work Done by Force', formula: 'W = F_{||} * d = F * d * cos(\\theta)' },
          { name: 'Gravitational Potential Energy', formula: '\\Delta U_g = m * g * \\Delta y' },
          { name: 'Spring Potential Energy', formula: 'U_s = (1/2) * k * x^2' },
          { name: 'Linear Momentum & Impulse', formula: 'p = m * v  |  J = \\Delta p = F_{avg} * \\Delta t' }
        ]
      },
      {
        category: 'Rotational Motion & Simple Harmonic Motion',
        items: [
          { name: 'Torque', formula: '\\tau = r * F * sin(\\theta) = I * \\alpha' },
          { name: 'Rotational Kinetic Energy', formula: 'K_{rot} = (1/2) * I * \\omega^2' },
          { name: 'Angular Momentum', formula: 'L = I * \\omega' },
          { name: 'Period of Mass-Spring System', formula: 'T_s = 2\\pi * sqrt(m / k)' },
          { name: 'Period of Simple Pendulum', formula: 'T_p = 2\\pi * sqrt(L / g)' }
        ]
      }
    ]
  },

  'ap-chemistry': {
    title: 'AP® Chemistry Equations & Constants',
    subtitle: 'Includes Full Periodic Table & Official College Board Equations',
    hasPeriodicTable: true,
    sections: [
      {
        category: 'Physical Constants & Conversions',
        items: [
          { name: 'Ideal Gas Constant (R)', formula: 'R = 8.314 J/(mol*K) = 0.08206 (L*atm)/(mol*K)' },
          { name: 'Faraday\'s Constant (F)', formula: 'F = 96,485 C / (mol e^-)' },
          { name: 'Avogadro\'s Number', formula: 'N_A = 6.022 x 10^23 particles/mol' },
          { name: 'Planck\'s Constant', formula: 'h = 6.626 x 10^-34 J*s' },
          { name: 'Speed of Light', formula: 'c = 2.998 x 10^8 m/s' }
        ]
      },
      {
        category: 'Gases, Liquids & Solutions',
        items: [
          { name: 'Ideal Gas Law', formula: 'P * V = n * R * T' },
          { name: 'Dalton\'s Law of Partial Pressures', formula: 'P_{total} = P_A + P_B + P_C + ...  |  P_A = X_A * P_{total}' },
          { name: 'Molarity', formula: 'M = moles of solute / liters of solution' },
          { name: 'Beer-Lambert Law', formula: 'A = \\epsilon * b * c' }
        ]
      },
      {
        category: 'Thermodynamics & Electrochemistry',
        items: [
          { name: 'Enthalpy & Heat', formula: 'q = m * c * \\Delta T' },
          { name: 'Gibbs Free Energy', formula: '\\Delta G^\\circ = \\Delta H^\\circ - T * \\Delta S^\\circ' },
          { name: 'Equilibrium Free Energy', formula: '\\Delta G^\\circ = -R * T * ln(K)' },
          { name: 'Cell Potential & Free Energy', formula: '\\Delta G^\\circ = -n * F * E^\\circ_{cell}' },
          { name: 'Current & Charge', formula: 'I = q / t  (Amperes = Coulombs / second)' }
        ]
      },
      {
        category: 'Equilibrium & Acids/Bases',
        items: [
          { name: 'Autoionization of Water', formula: 'K_w = [H^+][OH^-] = 1.0 x 10^-14 at 25°C' },
          { name: 'pH & pOH', formula: 'pH = -log[H^+]  |  pOH = -log[OH^-]  |  pH + pOH = 14' },
          { name: 'Henderson-Hasselbalch Buffer', formula: 'pH = pK_a + log([A^-] / [HA])' }
        ]
      }
    ]
  },

  'ap-biology': {
    title: 'AP® Biology Equations & Formulas',
    subtitle: 'Official College Board Statistical & Mathematical Models',
    sections: [
      {
        category: 'Statistical Analysis & Chi-Square',
        items: [
          { name: 'Chi-Square Formula', formula: '\\chi^2 = \\Sigma [(O - E)^2 / E]' },
          { name: 'Degrees of Freedom', formula: 'df = k - 1  (where k = number of distinct categories)' },
          { name: 'Standard Error of the Mean', formula: 'SE_x = s / sqrt(n)' },
          { name: 'Standard Deviation', formula: 's = sqrt(\\Sigma(x_i - \\bar{x})^2 / (n - 1))' }
        ]
      },
      {
        category: 'Population Genetics & Ecology',
        items: [
          { name: 'Hardy-Weinberg Allele Frequencies', formula: 'p + q = 1  (where p = freq(A), q = freq(a))' },
          { name: 'Hardy-Weinberg Genotype Frequencies', formula: 'p^2 + 2pq + q^2 = 1  (p^2 = AA, 2pq = Aa, q^2 = aa)' },
          { name: 'Exponential Population Growth', formula: 'dN / dt = r_{max} * N' },
          { name: 'Logistic Population Growth', formula: 'dN / dt = r_{max} * N * ((K - N) / K)' }
        ]
      },
      {
        category: 'Water Potential & Cell Surface',
        items: [
          { name: 'Water Potential', formula: '\\Psi = \\Psi_p + \\Psi_s' },
          { name: 'Solute Potential', formula: '\\Psi_s = -i * C * R * T  (i = ionization constant, R = 0.0831, T in Kelvin)' },
          { name: 'Surface Area-to-Volume Ratio', formula: 'Sphere: SA = 4\\pi r^2, V = (4/3)\\pi r^3' }
        ]
      }
    ]
  },

  'ap-environmental-science': {
    title: 'AP® Environmental Science Formula Guide',
    subtitle: 'Official Calculations, Conversion Factors & Population Models',
    sections: [
      {
        category: 'Population & Energy Calculations',
        items: [
          { name: 'Rule of 70 (Doubling Time)', formula: 'Doubling Time (years) = 70 / r%  (where r = annual growth rate %)' },
          { name: 'Natural Population Growth Rate', formula: 'r = ((CBR - CDR) / 10) %' },
          { name: 'Net Primary Productivity', formula: 'NPP = GPP - R  (where R = cellular respiration)' },
          { name: '10% Trophic Energy Rule', formula: 'Energy transferred to next trophic level \\approx 10%' }
        ]
      },
      {
        category: 'Metric Conversions & Units',
        items: [
          { name: 'Mega (M) & Giga (G)', formula: '1 Megawatt (MW) = 1,000 kW = 1,000,000 W' },
          { name: 'Gigawatt (GW)', formula: '1 GW = 1,000 MW = 10^9 Watts' },
          { name: 'Metric Tonne to kg', formula: '1 Metric Ton = 1,000 kg \\approx 2,200 lbs' },
          { name: 'Hectares to Acres', formula: '1 Hectare (ha) = 10,000 m^2 \\approx 2.47 Acres' }
        ]
      }
    ]
  },

  'ap-computer-science-principles': {
    title: 'AP® Computer Science Principles Exam Reference',
    subtitle: 'Official College Board Robot Grid & Pseudocode Reference Sheet',
    sections: [
      {
        category: 'Variables, Assignments & Lists',
        items: [
          { name: 'Assignment Operator', formula: 'a <- expression  (evaluates expression and assigns to a)' },
          { name: 'Display Operator', formula: 'DISPLAY(expression)  (outputs value to screen)' },
          { name: 'List Indexing', formula: 'list[i]  (NOTE: College Board pseudocode is 1-indexed, starts at 1!)' },
          { name: 'List Operations', formula: 'INSERT(list, i, value) | APPEND(list, value) | REMOVE(list, i) | LENGTH(list)' }
        ]
      },
      {
        category: 'Robot Grid Navigation Commands',
        items: [
          { name: 'MOVE_FORWARD()', formula: 'Moves the robot one square forward in the direction it is currently facing' },
          { name: 'ROTATE_LEFT() / ROTATE_RIGHT()', formula: 'Rotates robot 90 degrees in place without moving' },
          { name: 'CAN_MOVE(direction)', formula: 'Evaluates to true if an open square is present in direction (forward, left, right, backward)' }
        ]
      },
      {
        category: 'Conditionals & Boolean Logic',
        items: [
          { name: 'NOT, AND, OR', formula: 'NOT condition | condition1 AND condition2 | condition1 OR condition2' },
          { name: 'MOD Operator', formula: 'a MOD b  (evaluates to remainder after integer division of a by b)' },
          { name: 'REPEAT UNTIL', formula: 'REPEAT UNTIL(condition) { code }  (loops until condition evaluates to true)' }
        ]
      }
    ]
  }
};

/**
 * Returns reference sheet data for a given AP subject ID, or default fallback.
 */
export function getApReferenceSheet(subjectId: string) {
  if (AP_REFERENCE_DATA[subjectId]) {
    return AP_REFERENCE_DATA[subjectId];
  }
  // Generic fallback if user opened a subject without a formal math reference sheet
  return {
    title: 'AP® Exam Strategy & Command Verbs Guide',
    subtitle: 'College Board Official Free Response & Scoring Criteria',
    sections: [
      {
        category: 'College Board Official Command Verbs',
        items: [
          { name: 'Identify', notes: 'Indicate or provide information about a specified topic without elaboration or explanation.' },
          { name: 'Describe', notes: 'Provide the relevant characteristics of a specified topic or historical/scientific process.' },
          { name: 'Explain How / Why', notes: 'Provide information about how or why a relationship, process, pattern, or outcome occurs, using evidence and causal links.' },
          { name: 'Justify', notes: 'Provide evidence, mathematical reasoning, or theoretical models to support or defend a choice or conclusion.' }
        ]
      }
    ]
  };
}
