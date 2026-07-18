const fs = require('fs');

let content = fs.readFileSync('src/utils/profile.ts', 'utf8');

const regex = /const isVisualLearner = safeGetItem\('pref_visual_learner'\) === 'true';/;
const replacement = `const isVisualLearner = safeGetItem('pref_visual_learner') === 'true';\n  const isDeepFocus = safeGetItem('pref_deep_focus') === 'true';`;
content = content.replace(regex, replacement);

const regex2 = /return ctx;/;
const replacement2 = `if (isDeepFocus) {\n    ctx += \`\\nUSER SETTING: Deep Focus Mode is ON. Keep responses extremely concise, distraction-free, and highly focused on the core academic concept. Avoid conversational filler.\`;\n  }\n  return ctx;`;
content = content.replace(regex2, replacement2);

fs.writeFileSync('src/utils/profile.ts', content, 'utf8');
