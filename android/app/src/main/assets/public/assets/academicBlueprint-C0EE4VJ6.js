import{k as i,l as s}from"./index-BEDzv2B-.js";function c(a){const r=a||i("last_logged_in_user")||"",e=(r?i(`user_exam_blueprint_${r}`):null)||i("user_exam_blueprint")||i("academic_exam_blueprint");if(!e)return null;try{const t=JSON.parse(e);if(t&&typeof t=="object")return t}catch{}return null}function d(a,r){if(!a||typeof a!="object")return;const e=r||i("last_logged_in_user")||"",t=JSON.stringify(a);s("user_exam_blueprint",t),s("academic_exam_blueprint",t),e&&s(`user_exam_blueprint_${e}`,t);try{window.dispatchEvent(new CustomEvent("academic_profile_updated"))}catch{}}function l(a,r){const e=c(r);if(!e||typeof e!="object")return null;if(e[a])return e[a];const t=a.toLowerCase().trim(),n=Object.keys(e).find(u=>{const o=u.toLowerCase().trim();return o===t||t.includes(o)||o.includes(t)});return n?e[n]:null}function p(a,r){const e=l(a,r),t=i("academic_exam")||i("target_exam")||"",n=i("academic_grade")||"";return!e&&!t?"":`
[EXAM ACCREDITATION & CALIBRATION]
Target Exam: ${t||"Standardized Exam"}
Class / Preparation Level: ${n||"Current Academic Year"}
Subject Focus: ${a}
${e?`Official Marking Scheme: ${e.markingScheme} (Subject Marks: ${e.totalMarks}, Questions: ${e.attemptRequired}/${e.totalQuestions})
Question Formats & Style: ${Array.isArray(e.questionTypes)?e.questionTypes.join(", "):"Standardized Formats"}
Core Syllabus Chapters: ${Array.isArray(e.coreUnits)?e.coreUnits.join(", "):"Official Syllabus"}
Real Exam Tone & Rigor: ${e.examTone||"Aligned with official assessment standards"}
Authoritative Source: ${e.officialSource||"Official Testing Authority"}`:""}
Instruction: You MUST strictly align questions, explanations, difficulty level, and terminology to this exact examination blueprint.
CRITICAL ERROR TRAP DIRECTIVE: NEVER output hypothetical "what-if" traps (e.g., do NOT say "if this was cosine"). Only point out the exact errors students make on this exact problem, specifically the false product rule (u·v)' = u'·v', dropped chain-rule multipliers, and sign/algebraic distribution errors. Use clean, natural language without pompous academic jargon.
`}export{c as a,p as f,l as g,d as s};
