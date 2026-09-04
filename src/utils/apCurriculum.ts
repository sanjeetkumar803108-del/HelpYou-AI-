export interface APSubject {
  id: string;
  name: string;
  shortCode: string;
  badge: string;
  category: 'STEM & Math' | 'Sciences' | 'Humanities & Social Sciences' | 'English & Tech';
  icon: string;
  accentColor: string; // Tailwind color class or hex
  gradient: string;
  description: string;
  gradeLevels?: ('9th' | '10th' | '11th' | '12th')[];
  units: {
    id: string;
    title: string;
    description: string;
  }[];
}

export const GRADE_9_RECOMMENDED_IDS = [
  'ap-human-geography',
  'ap-environmental-science',
  'ap-computer-science-principles',
  'ap-psychology',
  'ap-biology'
];

export const TOP_10_AP_SUBJECTS: APSubject[] = [
  {
    id: 'ap-human-geography',
    name: 'AP Human Geography (APHG)',
    shortCode: 'APHG',
    badge: '👑 #1 Grade 9 AP',
    category: 'Humanities & Social Sciences',
    icon: '🗺️',
    accentColor: '#0284C7',
    gradient: 'from-sky-600 via-teal-600 to-emerald-700',
    description: 'The Premier Grade 9 (Freshman) AP Course: Spatial Patterns, Population Pyramids, DTM, Cultural Hearth & Urban Models (Units 1–7)',
    gradeLevels: ['9th', '10th', '11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Thinking Geographically', description: 'Geospatial tech (GIS, GPS, remote sensing), spatial concepts, scales of analysis, and formal/functional/vernacular regions' },
      { id: 'u2', title: 'Unit 2: Population & Migration Patterns', description: 'Demographic Transition Model (DTM Stages 1-5), population pyramids, Malthusian theory, push/pull factors, and refugees' },
      { id: 'u3', title: 'Unit 3: Cultural Patterns & Processes', description: 'Diffusion mechanisms (contagious, hierarchical, stimulus), language families, universalizing vs ethnic religions, and cultural landscapes' },
      { id: 'u4', title: 'Unit 4: Political Patterns & Processes', description: 'Sovereignty, nation-states, stateless nations, boundaries/UNCLOS, gerrymandering, supranationalism (UN, EU), and devolution' },
      { id: 'u5', title: 'Unit 5: Agriculture & Rural Land-Use', description: 'Von Thünen spatial model, Green Revolution, subsistence vs commercial farming, agricultural hearths, and rural land survey systems' },
      { id: 'u6', title: 'Unit 6: Cities & Urban Land-Use', description: 'Burgess Concentric Zone, Hoyt Sector, Harris-Ullman Multiple Nuclei, Central Place Theory (Christaller), gentrification, and New Urbanism' },
      { id: 'u7', title: 'Unit 7: Industrial & Economic Development', description: 'Wallerstein World Systems (Core/Periphery), Rostow 5 Stages of Economic Growth, Weber Least Cost Theory, HDI, and UN SDGs' }
    ]
  },
  {
    id: 'ap-environmental-science',
    name: 'AP Environmental Science (APES)',
    shortCode: 'APES',
    badge: '🌱 Popular 9th Lab',
    category: 'Sciences',
    icon: '🌿',
    accentColor: '#16A34A',
    gradient: 'from-green-600 via-emerald-600 to-teal-800',
    description: 'Freshman-Friendly Interdisciplinary Lab Science: Ecosystem Cycles, Biodiversity, Earth Systems, Energy, Pollution & Sustainability (Units 1–9)',
    gradeLevels: ['9th', '10th', '11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: The Living World: Ecosystems', description: 'Biogeochemical cycles (carbon, nitrogen, phosphorus, water), trophic cascades, 10% energy rule, and primary productivity' },
      { id: 'u2', title: 'Unit 2: The Living World: Biodiversity', description: 'Ecosystem services (provisioning/regulating), island biogeography, ecological tolerance, natural disruptions, and succession' },
      { id: 'u3', title: 'Unit 3: Populations', description: 'Generalist vs specialist species, r-selected vs K-selected, survivorship curves, carrying capacity, and human demographic transition' },
      { id: 'u4', title: 'Unit 4: Earth Systems & Resources', description: 'Tectonic plate boundaries, soil horizons/texture triangle, atmospheric layers, global wind patterns, and El Niño/La Niña' },
      { id: 'u5', title: 'Unit 5: Land & Water Use', description: 'Tragedy of the Commons, Green Revolution, irrigation methods, Integrated Pest Management (IPM), CAFOs, and mining impacts' },
      { id: 'u6', title: 'Unit 6: Energy Resources & Consumption', description: 'Fossil fuels, nuclear fission, solar, wind, hydroelectric, biomass, and energy conservation calculations' },
      { id: 'u7', title: 'Unit 7: Atmospheric Pollution', description: 'Photochemical smog, thermal inversions, acid deposition, indoor air pollutants (radon, VOCs), and Clean Air Act' },
      { id: 'u8', title: 'Unit 8: Aquatic & Terrestrial Pollution', description: 'Point vs nonpoint sources, eutrophication, bioaccumulation/biomagnification, solid waste landfills, and LD50 toxicity testing' },
      { id: 'u9', title: 'Unit 9: Global Change', description: 'Stratospheric ozone depletion, greenhouse gases, ocean acidification, invasive species, and climate mitigation strategies' }
    ]
  },
  {
    id: 'ap-computer-science-principles',
    name: 'AP Computer Science Principles (CSP)',
    shortCode: 'CSP',
    badge: '💻 9th Tech Entry',
    category: 'English & Tech',
    icon: '🌐',
    accentColor: '#0EA5E9',
    gradient: 'from-cyan-600 via-blue-600 to-indigo-700',
    description: 'Foundational 9th Grade Computing: Computational Thinking, Big Data, Algorithms, Pseudocode Logic, Cybersecurity & the Global Internet (Units 1–5)',
    gradeLevels: ['9th', '10th', '11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Creative Development', description: 'Collaboration, program design, software development process, identifying errors, and debugging strategies' },
      { id: 'u2', title: 'Unit 2: Data Representation & Information', description: 'Binary numbers, hexadecimal, data compression (lossy vs lossless), abstraction, and Big Data analysis' },
      { id: 'u3', title: 'Unit 3: Algorithms & Programming', description: 'Variables, booleans, conditionals, loops, procedural abstraction, algorithm efficiency, and robot navigation' },
      { id: 'u4', title: 'Unit 4: Computing Systems & Networks', description: 'The Internet, IP addressing, TCP/IP packets, routing, fault tolerance, and parallel/distributed computing' },
      { id: 'u5', title: 'Unit 5: Impact of Computing', description: 'Cybersecurity, symmetric vs public key encryption, phishing, DDoS attacks, digital divide, and computing ethics' }
    ]
  },
  {
    id: 'ap-calculus-ab',
    name: 'AP Calculus AB',
    shortCode: 'CALC AB',
    badge: 'Foundational',
    category: 'STEM & Math',
    icon: '📐',
    accentColor: '#3B82F6',
    gradient: 'from-blue-600 via-indigo-600 to-blue-800',
    description: 'Limits, Derivatives, Applications of Differentiation, Definite Integrals & Differential Equations (Units 1–8)',
    gradeLevels: ['11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Limits & Continuity', description: 'Limit properties, squeeze theorem, and Intermediate Value Theorem (IVT)' },
      { id: 'u2', title: 'Unit 2: Differentiation: Definition & Fundamentals', description: 'Derivative definition, power, product, and quotient rules' },
      { id: 'u3', title: 'Unit 3: Chain Rule & Implicit Differentiation', description: 'Composite functions, implicit curves, and inverse trigonometric derivatives' },
      { id: 'u4', title: 'Unit 4: Contextual Applications of Differentiation', description: 'Rates of change, straight-line motion, related rates, and local linearity' },
      { id: 'u5', title: 'Unit 5: Analytical Applications of Differentiation', description: 'Mean Value Theorem (MVT), First/Second Derivative Tests, concavity, and optimization' },
      { id: 'u6', title: 'Unit 6: Integration & Accumulation of Change', description: 'Riemann sums, FTC Parts 1 & 2, and U-substitution' },
      { id: 'u7', title: 'Unit 7: Differential Equations & Slope Fields', description: 'Separation of variables, exponential growth models, and slope fields' },
      { id: 'u8', title: 'Unit 8: Applications of Integration', description: 'Average value, area between curves, and volumes of revolution (disk/washer)' }
    ]
  },
  {
    id: 'ap-calculus-bc',
    name: 'AP Calculus BC',
    shortCode: 'CALC BC',
    badge: 'Advanced (+2 Units)',
    category: 'STEM & Math',
    icon: '📈',
    accentColor: '#6366F1',
    gradient: 'from-indigo-600 via-purple-600 to-violet-800',
    description: 'All Calculus AB Core Curriculum PLUS 2 Advanced BC-Exclusive Units: Parametric/Polar/Vectors & Infinite Sequences and Series',
    gradeLevels: ['11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Limits & Continuity', description: 'Limit properties, squeeze theorem, and IVT' },
      { id: 'u2', title: 'Unit 2: Differentiation: Fundamentals', description: 'Power, product, quotient rules, and derivative definitions' },
      { id: 'u3', title: 'Unit 3: Composite, Implicit & Inverse Functions', description: 'Chain rule, implicit curves, and inverse trig derivatives' },
      { id: 'u4', title: 'Unit 4: Contextual Applications of Differentiation', description: 'Rates of change, related rates, and linear approximations' },
      { id: 'u5', title: 'Unit 5: Analytical Applications of Differentiation', description: 'MVT, First/Second derivative tests, concavity, and optimization' },
      { id: 'u6', title: 'Unit 6: Integration: Advanced Techniques', description: 'Integration by parts, partial fractions, improper integrals, and FTC' },
      { id: 'u7', title: 'Unit 7: Differential Equations & Logistic Growth', description: 'Euler’s method, logistic differential equations, and slope fields' },
      { id: 'u8', title: 'Unit 8: Applications of Integration & Arc Length', description: 'Area, volumes of revolution, and curve arc length' },
      { id: 'u9', title: 'Unit 9: Parametric, Polar & Vectors (BC Exclusive)', description: 'Parametric derivatives and arc length, vector velocity/acceleration, polar area and tangents' },
      { id: 'u10', title: 'Unit 10: Infinite Sequences & Series (BC Exclusive)', description: 'Convergence tests, alternating series, power series, and Taylor/Maclaurin series' }
    ]
  },
  {
    id: 'ap-biology',
    name: 'AP Biology',
    shortCode: 'BIO',
    badge: 'Popular',
    category: 'Sciences',
    icon: '🧬',
    accentColor: '#10B981',
    gradient: 'from-emerald-600 via-teal-600 to-emerald-800',
    description: 'Cellular Energetics, Genetics, Gene Regulation & Natural Selection',
    gradeLevels: ['9th', '10th', '11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Chemistry of Life', description: 'Structure of water, hydrogen bonding, and biomolecules' },
      { id: 'u2', title: 'Unit 2: Cell Structure & Function', description: 'Organelles, membrane permeability, and tonicity/osmosis' },
      { id: 'u3', title: 'Unit 3: Cellular Energetics', description: 'Enzyme kinetics, photosynthesis (light/dark reactions), and cellular respiration' },
      { id: 'u4', title: 'Unit 4: Cell Communication & Cell Cycle', description: 'Signal transduction pathways, feedback loops, mitosis, and checkpoints' },
      { id: 'u5', title: 'Unit 5: Heredity & Mendelian Genetics', description: 'Meiosis, independent assortment, non-Mendelian inheritance, and pedigrees' },
      { id: 'u6', title: 'Unit 6: Gene Expression & Regulation', description: 'DNA replication, transcription, translation, operons, and biotechnology' },
      { id: 'u7', title: 'Unit 7: Natural Selection & Evolution', description: 'Hardy-Weinberg equilibrium, phylogenetic trees, and speciation' },
      { id: 'u8', title: 'Unit 8: Ecology', description: 'Energy flow in trophic levels, population dynamics, and ecosystem resilience' }
    ]
  },
  {
    id: 'ap-chemistry',
    name: 'AP Chemistry',
    shortCode: 'CHEM',
    badge: 'Challenging',
    category: 'Sciences',
    icon: '⚗️',
    accentColor: '#8B5CF6',
    gradient: 'from-purple-600 via-violet-600 to-indigo-800',
    description: 'Atomic Models, Chemical Kinetics, Thermodynamics & Equilibrium',
    gradeLevels: ['10th', '11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Atomic Structure & Properties', description: 'Moles, mass spectrometry, electron configurations, and periodic trends' },
      { id: 'u2', title: 'Unit 2: Molecular & Ionic Bonding', description: 'Lattice energy, Lewis structures, resonance, and VSEPR geometry' },
      { id: 'u3', title: 'Unit 3: Intermolecular Forces & Properties', description: 'Dipole forces, ideal gas laws (PV=nRT), solutions, and spectroscopy' },
      { id: 'u4', title: 'Unit 4: Chemical Reactions & Stoichiometry', description: 'Net ionic equations, redox titrations, and precipitation' },
      { id: 'u5', title: 'Unit 5: Kinetics', description: 'Rate laws, collision theory, reaction mechanisms, and catalysts' },
      { id: 'u6', title: 'Unit 6: Thermodynamics', description: 'Enthalpy of reaction, Hess’s Law, calorimetry, and bond energies' },
      { id: 'u7', title: 'Unit 7: Equilibrium', description: 'Equilibrium constant (Keq, Kp), Le Chatelier’s principle, and solubility (Ksp)' },
      { id: 'u8', title: 'Unit 8: Acids & Bases', description: 'pH, pOH, strong vs weak, buffers, and Henderson-Hasselbalch' },
      { id: 'u9', title: 'Unit 9: Applications of Thermodynamics', description: 'Entropy (S), Gibbs Free Energy (ΔG), and galvanic/electrolytic cells' }
    ]
  },
  {
    id: 'ap-physics',
    name: 'AP Physics 1: Algebra-Based',
    shortCode: 'PHYS',
    badge: 'Conceptual',
    category: 'Sciences',
    icon: '⚡',
    accentColor: '#F59E0B',
    gradient: 'from-amber-500 via-orange-500 to-amber-700',
    description: 'Kinematics, Newton’s Laws, Work-Energy, Momentum & Rotational Motion',
    gradeLevels: ['9th', '10th', '11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Kinematics', description: '1D & 2D motion, projectile motion, and kinematic graphs' },
      { id: 'u2', title: 'Unit 2: Force & Translational Dynamics', description: 'Newton’s three laws, free-body diagrams, and friction' },
      { id: 'u3', title: 'Unit 3: Work, Energy & Power', description: 'Conservation of mechanical energy, work-energy theorem, and spring forces' },
      { id: 'u4', title: 'Unit 4: Linear Momentum', description: 'Impulse, elastic and inelastic collisions, and center of mass' },
      { id: 'u5', title: 'Unit 5: Torque & Rotational Dynamics', description: 'Rotational kinematics, moment of inertia, torque, and rolling motion' },
      { id: 'u6', title: 'Unit 6: Energy & Momentum of Rotating Systems', description: 'Conservation of angular momentum and rotational kinetic energy' },
      { id: 'u7', title: 'Unit 7: Oscillations (Simple Harmonic Motion)', description: 'Mass-spring systems, simple pendulums, period, and restoring forces' },
      { id: 'u8', title: 'Unit 8: Fluids', description: 'Density, pressure, Archimedes’ principle, and continuity equation' }
    ]
  },
  {
    id: 'ap-us-history',
    name: 'AP U.S. History (APUSH)',
    shortCode: 'APUSH',
    badge: 'Top Pick',
    category: 'Humanities & Social Sciences',
    icon: '🏛️',
    accentColor: '#EF4444',
    gradient: 'from-red-600 via-rose-600 to-red-800',
    description: 'Periods 1–9: From Pre-Columbian Societies to Modern American Politics',
    gradeLevels: ['10th', '11th', '12th'],
    units: [
      { id: 'p1', title: 'Period 1 (1491–1607)', description: 'Early contact, Native American societies, and Columbian Exchange' },
      { id: 'p2', title: 'Period 2 (1607–1754)', description: 'Colonial settlements, mercantilism, and regional economies' },
      { id: 'p3', title: 'Period 3 (1754–1800)', description: 'Seven Years War, American Revolution, Declaration, and US Constitution' },
      { id: 'p4', title: 'Period 4 (1800–1848)', description: 'Jacksonian Democracy, Market Revolution, and Second Great Awakening' },
      { id: 'p5', title: 'Period 5 (1844–1877)', description: 'Manifest Destiny, Sectional Crisis, Civil War, and Reconstruction' },
      { id: 'p6', title: 'Period 6 (1865–1898)', description: 'Gilded Age industrialization, labor movements, and urbanization' },
      { id: 'p7', title: 'Period 7 (1890–1945)', description: 'Progressive Era, Imperialism, World War I, Great Depression, New Deal & WWII' },
      { id: 'p8', title: 'Period 8 (1945–1980)', description: 'Cold War geopolitics, Civil Rights Movement, Vietnam, and suburban shift' },
      { id: 'p9', title: 'Period 9 (1980–Present)', description: 'Reagan Revolution, conservative resurgence, globalization, and digital era' }
    ]
  },
  {
    id: 'ap-english-lang',
    name: 'AP English Language & Comp',
    shortCode: 'AP LANG',
    badge: 'Essential',
    category: 'English & Tech',
    icon: '✍️',
    accentColor: '#06B6D4',
    gradient: 'from-cyan-600 via-teal-600 to-cyan-800',
    description: 'Rhetorical Analysis, Synthesis Essays, Argumentation & Stylistic Craft',
    gradeLevels: ['11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Rhetorical Situation & Claims', description: 'Audience, purpose, context, exigence, and thesis construction' },
      { id: 'u2', title: 'Unit 2: Evidence & Appeals (Ethos, Pathos, Logos)', description: 'Lines of reasoning, supporting claims, and rhetorical choices' },
      { id: 'u3', title: 'Unit 3: Synthesis of Multiple Sources', description: 'Synthesizing conflicting viewpoints, citations, and conversation building' },
      { id: 'u4', title: 'Unit 4: Argumentative Structure & Logic', description: 'Inductive/deductive logic, qualifying claims, and counter-arguments' },
      { id: 'u5', title: 'Unit 5: Style, Diction & Syntax', description: 'Tone, figurative language, periodic sentences, and stylistic voice' },
      { id: 'u6', title: 'Unit 6: Multiple Choice: Reading & Revision', description: 'Deconstructing nonfiction arguments and editing prose for clarity' }
    ]
  },
  {
    id: 'ap-psychology',
    name: 'AP Psychology',
    shortCode: 'PSYCH',
    badge: 'Popular',
    category: 'Humanities & Social Sciences',
    icon: '🧠',
    accentColor: '#EC4899',
    gradient: 'from-pink-500 via-rose-500 to-purple-600',
    description: 'Cognitive Processes, Neuroscience, Learning Theories & Clinical Disorders',
    gradeLevels: ['9th', '10th', '11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Biological Bases of Behavior', description: 'Neuron anatomy, neurotransmitters, brain lobes, and endocrine system' },
      { id: 'u2', title: 'Unit 2: Cognition & Memory', description: 'Encoding, storage, retrieval, problem-solving heuristics, and intelligence' },
      { id: 'u3', title: 'Unit 3: Development & Learning', description: 'Classical and operant conditioning, Piaget, Erikson, and lifespan changes' },
      { id: 'u4', title: 'Unit 4: Social Psychology & Personality', description: 'Conformity, attribution bias, group dynamics, and personality traits' },
      { id: 'u5', title: 'Unit 5: Mental & Physical Health', description: 'Psychological disorders (DSM-5), therapeutic modalities, and stress coping' }
    ]
  },
  {
    id: 'ap-computer-science',
    name: 'AP Computer Science A',
    shortCode: 'CSA',
    badge: 'Tech Lead',
    category: 'English & Tech',
    icon: '💻',
    accentColor: '#6366F1',
    gradient: 'from-indigo-600 via-blue-600 to-indigo-800',
    description: 'Java Programming: OOP, Inheritance, Data Structures & Algorithms',
    gradeLevels: ['10th', '11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: Primitive Types', description: 'Variables, casting, arithmetic expressions, and operator precedence' },
      { id: 'u2', title: 'Unit 2: Using Objects & String Methods', description: 'Instantiating classes, String manipulation, and Math class methods' },
      { id: 'u3', title: 'Unit 3: Boolean Expressions & if Statements', description: 'De Morgan’s Laws, nested conditionals, and logical operators' },
      { id: 'u4', title: 'Unit 4: Iteration (Loops)', description: 'While loops, for loops, nested loops, and loop analysis' },
      { id: 'u5', title: 'Unit 5: Writing Classes', description: 'Constructors, encapsulation, access modifiers, and static variables' },
      { id: 'u6', title: 'Unit 6: 1D Array', description: 'Array traversal, insertion, deletion, and linear search' },
      { id: 'u7', title: 'Unit 7: ArrayList', description: 'Dynamic arrays, wrapper classes, autoboxing, and selection/insertion sort' },
      { id: 'u8', title: 'Unit 8: 2D Array', description: 'Matrix traversal (row-major vs column-major) and grid algorithms' },
      { id: 'u9', title: 'Unit 9: Inheritance & Polymorphism', description: 'Superclasses, subclasses, super keyword, and method overriding' },
      { id: 'u10', title: 'Unit 10: Recursion', description: 'Recursive methods, base cases, call stack tracing, and binary search' }
    ]
  },
  {
    id: 'ap-economics',
    name: 'AP Micro & Macroeconomics',
    shortCode: 'ECON',
    badge: 'High Yield',
    category: 'Humanities & Social Sciences',
    icon: '📈',
    accentColor: '#14B8A6',
    gradient: 'from-teal-600 via-emerald-600 to-teal-800',
    description: 'Market Equilibrium, Consumer Theory, GDP, Inflation & Monetary Policy',
    gradeLevels: ['11th', '12th'],
    units: [
      { id: 'u1', title: 'Micro 1: Supply, Demand & Elasticity', description: 'Price elasticity, consumer/producer surplus, deadweight loss, and taxes' },
      { id: 'u2', title: 'Micro 2: Production Costs & Perfect Competition', description: 'Marginal cost/revenue curves, short-run vs long-run profit maximization' },
      { id: 'u3', title: 'Micro 3: Imperfect Competition & Game Theory', description: 'Monopolies, price discrimination, oligopolies, and payoff matrices' },
      { id: 'u4', title: 'Macro 1: Economic Indicators (GDP & Inflation)', description: 'Real vs nominal GDP, CPI calculation, unemployment types, and business cycles' },
      { id: 'u5', title: 'Macro 2: AD-AS Model & Fiscal Policy', description: 'Aggregate demand, short-run/long-run AS, spending multiplier, and taxes' },
      { id: 'u6', title: 'Macro 3: Financial Sector & Monetary Policy', description: 'Money market, bank balance sheets, reserve ratio, and Fed interest rate tools' }
    ]
  },
  {
    id: 'ap-world-history',
    name: 'AP World History: Modern',
    shortCode: 'WHAP',
    badge: 'Global',
    category: 'Humanities & Social Sciences',
    icon: '🌍',
    accentColor: '#D97706',
    gradient: 'from-yellow-600 via-amber-600 to-orange-700',
    description: '1200 CE to Present: Global Tapestry, Exchange Networks & Modern Conflicts',
    gradeLevels: ['10th', '11th', '12th'],
    units: [
      { id: 'u1', title: 'Unit 1: The Global Tapestry (1200–1450)', description: 'Song Dynasty, Dar al-Islam, South/Southeast Asia, and American states' },
      { id: 'u2', title: 'Unit 2: Networks of Exchange (1200–1450)', description: 'Silk Roads, Mongol Empire, Indian Ocean trade, and Trans-Saharan routes' },
      { id: 'u3', title: 'Unit 3: Land-Based Empires (1450–1750)', description: 'Ottoman, Safavid, Mughal, and Qing dynasties administrative consolidation' },
      { id: 'u4', title: 'Unit 4: Transoceanic Interconnections (1450–1750)', description: 'Maritime exploration, Columbian Exchange, and Atlantic slave trade' },
      { id: 'u5', title: 'Unit 5: Revolutions (1750–1900)', description: 'Enlightenment philosophy, American/French/Haitian revolutions, and nationalism' },
      { id: 'u6', title: 'Unit 6: Industrialization & Imperialism (1750–1900)', description: 'Factory system, capitalist ideologies, Scramble for Africa, and Meiji Japan' },
      { id: 'u7', title: 'Unit 7: Global Conflict (1900–Present)', description: 'World War I, Russian Revolution, Great Depression, Fascism, and World War II' },
      { id: 'u8', title: 'Unit 8: Cold War & Decolonization (1900–Present)', description: 'Superpower proxy wars, nuclear arms race, Indian independence, and African liberation' },
      { id: 'u9', title: 'Unit 9: Globalization (1900–Present)', description: 'Technological advances, global economic institutions, disease, and environmentalism' }
    ]
  }
];
