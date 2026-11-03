const fs = require('fs');
const path = require('path');

function normalizeNewlines(str) {
  return str.replace(/\r\n/g, '\n');
}

function patchFile(filePath, transforms) {
  let original = fs.readFileSync(filePath, 'utf8');
  const isCrlf = original.includes('\r\n');
  let content = normalizeNewlines(original);

  for (const { name, search, replace } of transforms) {
    const normSearch = normalizeNewlines(search);
    const normReplace = normalizeNewlines(replace);

    if (content.includes(normSearch)) {
      content = content.replace(normSearch, normReplace);
      console.log(`[OK] Applied ${name} in ${filePath}`);
    } else {
      console.warn(`[WARN] Could not find target for ${name} in ${filePath}`);
    }
  }

  if (isCrlf) {
    content = content.replace(/\n/g, '\r\n');
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

// -------------------------------------------------------------
// 1. Patch FlashcardGenerator.tsx
// -------------------------------------------------------------
const flashcardPath = path.resolve('src/components/FlashcardGenerator.tsx');

const fcSearch1 = `import { getCachedCurriculumContent, saveCachedCurriculumContent, parseTopicHierarchy } from '../utils/communityCache';`;
const fcReplace1 = `import { getCachedCurriculumContent, saveCachedCurriculumContent, parseTopicHierarchy, isValidAcademicTopicInput } from '../utils/communityCache';`;

const fcSearch2 = `    const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
    const [customSubTopicInput, setCustomSubTopicInput] = useState<{ [chapterKey: string]: string }>({});
    const [showCustomInputForChapter, setShowCustomInputForChapter] = useState<string | null>(null);`;
const fcReplace2 = `    const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
    const [customSubTopicInput, setCustomSubTopicInput] = useState<{ [chapterKey: string]: string }>({});
    const [showCustomInputForChapter, setShowCustomInputForChapter] = useState<string | null>(null);
    const [customInputError, setCustomInputError] = useState<{ [chapterKey: string]: string }>({});`;

const fcSearch3 = `                                          {/* Custom Micro-Topic Input (User's Favorite Feature) */}
                                          <div className="pt-1">
                                            {showCustomInputForChapter === chapterKey ? (
                                              <div className="flex items-center gap-1.5">
                                                <input
                                                  type="text"
                                                  placeholder={\`e.g. Specific formula or concept...\`}
                                                  value={customSubTopicInput[chapterKey] || ''}
                                                  onChange={(e) => setCustomSubTopicInput(prev => ({ ...prev, [chapterKey]: e.target.value }))}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      const val = (customSubTopicInput[chapterKey] || '').trim();
                                                      if (val) {
                                                        triggerVibration(15);
                                                        handleTopicClick(cleanSubj, \`\${topicItem} - \${val}\`);
                                                      }
                                                    }
                                                  }}
                                                  className="flex-1 text-xs px-3 py-2 border border-pink-300 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-pink-500 text-zinc-800"
                                                  autoFocus
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const val = (customSubTopicInput[chapterKey] || '').trim();
                                                    if (val) {
                                                      triggerVibration(15);
                                                      handleTopicClick(cleanSubj, \`\${topicItem} - \${val}\`);
                                                    }
                                                  }}
                                                  className="px-3 py-2 bg-pink-600 text-white font-bold text-xs rounded-xl hover:bg-pink-700 transition-all shrink-0 cursor-pointer"
                                                >
                                                  Create
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setShowCustomInputForChapter(chapterKey)}
                                                className="w-full border border-dashed border-pink-200 hover:border-pink-400 bg-pink-50/20 hover:bg-pink-50/50 py-1.5 px-3 rounded-xl text-center text-xs font-bold text-pink-600 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                              >
                                                <span>✏️</span>
                                                <span>+ Type specific topic in this chapter...</span>
                                              </button>
                                            )}
                                          </div>`;

const fcReplace3 = `                                          {/* Custom Micro-Topic Input (User's Favorite Feature) */}
                                          <div className="pt-1">
                                            {showCustomInputForChapter === chapterKey ? (
                                              <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5">
                                                  <input
                                                    type="text"
                                                    placeholder={\`e.g. Specific formula or concept...\`}
                                                    value={customSubTopicInput[chapterKey] || ''}
                                                    onChange={(e) => {
                                                      setCustomSubTopicInput(prev => ({ ...prev, [chapterKey]: e.target.value }));
                                                      if (customInputError[chapterKey]) {
                                                        setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                      }
                                                    }}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        const val = (customSubTopicInput[chapterKey] || '').trim();
                                                        const check = isValidAcademicTopicInput(val, topicItem);
                                                        if (!check.isValid) {
                                                          triggerVibration([30, 50, 30]);
                                                          setCustomInputError(prev => ({ ...prev, [chapterKey]: check.error || 'Invalid topic' }));
                                                          return;
                                                        }
                                                        setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                        triggerVibration(15);
                                                        handleTopicClick(cleanSubj, \`\${topicItem} - \${val}\`);
                                                      }
                                                    }}
                                                    className={\`flex-1 text-xs px-3 py-2 border rounded-xl bg-white focus:outline-none focus:ring-1 text-zinc-800 \${
                                                      customInputError[chapterKey]
                                                        ? 'border-rose-400 focus:ring-rose-500'
                                                        : 'border-pink-300 focus:ring-pink-500'
                                                    }\`}
                                                    autoFocus
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const val = (customSubTopicInput[chapterKey] || '').trim();
                                                      const check = isValidAcademicTopicInput(val, topicItem);
                                                      if (!check.isValid) {
                                                        triggerVibration([30, 50, 30]);
                                                        setCustomInputError(prev => ({ ...prev, [chapterKey]: check.error || 'Invalid topic' }));
                                                        return;
                                                      }
                                                      setCustomInputError(prev => ({ ...prev, [chapterKey]: '' }));
                                                      triggerVibration(15);
                                                      handleTopicClick(cleanSubj, \`\${topicItem} - \${val}\`);
                                                    }}
                                                    className="px-3 py-2 bg-pink-600 text-white font-bold text-xs rounded-xl hover:bg-pink-700 transition-all shrink-0 cursor-pointer"
                                                  >
                                                    Create
                                                  </button>
                                                </div>
                                                {customInputError[chapterKey] && (
                                                  <p className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200/80 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 animate-fadeIn">
                                                    <span>⚠️</span>
                                                    <span>{customInputError[chapterKey]}</span>
                                                  </p>
                                                )}
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setShowCustomInputForChapter(chapterKey)}
                                                className="w-full border border-dashed border-pink-200 hover:border-pink-400 bg-pink-50/20 hover:bg-pink-50/50 py-1.5 px-3 rounded-xl text-center text-xs font-bold text-pink-600 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                              >
                                                <span>✏️</span>
                                                <span>+ Type specific topic in this chapter...</span>
                                              </button>
                                            )}
                                          </div>`;

const fcSearch4 = `    const topicToUse = (targetTopic || sourceText).trim();
    if (!topicToUse) return;

    const coins = getCoins();`;

const fcReplace4 = `    const topicToUse = (targetTopic || sourceText).trim();
    if (!topicToUse) return;

    // Academic Concept & Chatter Guardrail
    const hierarchy = parseTopicHierarchy(topicToUse);
    if (hierarchy.subTopic && hierarchy.subTopic !== 'All') {
      const check = isValidAcademicTopicInput(hierarchy.subTopic, hierarchy.chapter);
      if (!check.isValid) {
        setShowConfig(false);
        setError(check.error || 'Please enter a valid academic concept or topic name.');
        triggerVibration([30, 50, 30]);
        return;
      }
    }

    const coins = getCoins();`;

patchFile(flashcardPath, [
  { name: 'Flashcard import isValidAcademicTopicInput', search: fcSearch1, replace: fcReplace1 },
  { name: 'Flashcard customInputError state', search: fcSearch2, replace: fcReplace2 },
  { name: 'Flashcard custom input drawer validation', search: fcSearch3, replace: fcReplace3 },
  { name: 'Flashcard handleGenerateReal Guard', search: fcSearch4, replace: fcReplace4 }
]);

// -------------------------------------------------------------
// 2. Patch QuestionGenerator.tsx (ensure error response check)
// -------------------------------------------------------------
const qgPath = path.resolve('src/components/QuestionGenerator.tsx');
patchFile(qgPath, [
  {
    name: 'QuestionGen error json handling',
    search: `      if (!response.ok) {
        const text = await response.text();
        let errMsg = "Failed to generate questions";
        try {
          errMsg = JSON.parse(text).error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }`,
    replace: `      if (!response.ok) {
        const text = await response.text();
        let errMsg = "Failed to generate questions";
        try {
          const parsed = JSON.parse(text);
          errMsg = parsed.message || parsed.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }`
  }
]);

// -------------------------------------------------------------
// 3. Patch AINotes.tsx (ensure error response check)
// -------------------------------------------------------------
const notesPath = path.resolve('src/components/AINotes.tsx');
patchFile(notesPath, [
  {
    name: 'AINotes error json handling',
    search: `      if (!response.ok) {
        const text = await response.text();
        let errMsg = "Failed to generate notes. Please try again.";
        try { errMsg = JSON.parse(text).error || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }`,
    replace: `      if (!response.ok) {
        const text = await response.text();
        let errMsg = "Failed to generate notes. Please try again.";
        try { 
          const parsed = JSON.parse(text);
          errMsg = parsed.message || parsed.error || errMsg; 
        } catch (_) {}
        throw new Error(errMsg);
      }`
  }
]);

console.log('All frontend generators patched successfully!');
