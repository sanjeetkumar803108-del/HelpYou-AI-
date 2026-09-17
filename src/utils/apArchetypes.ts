/**
 * Dynamic archetype generator providing high-yield, authentic exam question variations
 * for College Board AP subjects, topics, and units.
 */
export function getGranularSubjectArchetypes(subject: string, unitOrTopic: string = '', count: number = 5): string[] {
  const s = (subject || '').toLowerCase();

  let archetypes: string[] = [];

  if (s.includes('calc') || s.includes('math') || s.includes('algebra') || s.includes('statistic')) {
    archetypes = [
      'Core Analytical / Equation Solving and Conceptual Proof',
      'Graphical Interpretation / Derivative or Slope Rate-of-Change Analysis',
      'Real-World Physical Scenario / Modeling Word Problem',
      'Tabular / Numerical Data Approximation and Limit Analysis',
      'Multi-Step Theorem Application (MVT, EVT, IVT, FTC) and Justification',
      'Error Analysis / Common Trap Distractor Evaluation',
      'Optimization / Area / Accumulation Under Curve Application'
    ];
  } else if (s.includes('physics') || s.includes('chem') || s.includes('bio') || s.includes('environment')) {
    archetypes = [
      'Experimental Design & Scientific Investigation Data Analysis',
      'Quantitative Cause-and-Effect Relationship Calculation',
      'Molecular / Microscopic Structural Mechanism Explanation',
      'Graphical & Scatter Plot Trend Interpretation',
      'System Perturbation (Le Chatelier / Ecosystem Feedback) Analysis',
      'Model Evaluation & Hypothesis Justification'
    ];
  } else if (s.includes('history') || s.includes('geography') || s.includes('gov') || s.includes('psych')) {
    archetypes = [
      'Primary/Secondary Source Stimulus Excerpt Interpretation',
      'Historical Continuity and Change Over Time (CCOT) Analysis',
      'Comparative Thematic Evaluation Across Eras or Regions',
      'Spatial / Demographic / Constitutional Precedent Application',
      'Causation & Multi-Variable Impact Synthesis'
    ];
  } else {
    archetypes = [
      'Core Conceptual Definition and Fundamental Principle Application',
      'Analytical Problem Solving with Structured Evidence Justification',
      'Contextual Scenario Application with High-Yield Distractors',
      'Cause-and-Effect Relationship Explanation',
      'Synthesis and Comparative Evaluation of Principles'
    ];
  }

  const result: string[] = [];
  const reqCount = Math.max(1, count);
  for (let i = 0; i < reqCount; i++) {
    result.push(archetypes[i % archetypes.length]);
  }
  return result;
}
