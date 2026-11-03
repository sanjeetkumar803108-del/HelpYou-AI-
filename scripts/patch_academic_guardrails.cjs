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

// 1. Patch QuizGenerator.tsx
const quizGenPath = path.resolve('src/components/QuizGenerator.tsx');

const qgTarget1 = `  const handleGenerateReal = async (selectedTopic: string, selectedCount: number) => {
    const activeTopic = selectedTopic.trim();
    if (!activeTopic) return;

    // Check if user has at least 2 coins before starting, but do not deduct yet!`;

const qgReplace1 = `  const handleGenerateReal = async (selectedTopic: string, selectedCount: number) => {
    const activeTopic = selectedTopic.trim();
    if (!activeTopic) return;

    // Academic Concept & Chatter Guardrail
    const hierarchy = parseTopicHierarchy(activeTopic);
    if (hierarchy.subTopic && hierarchy.subTopic !== 'All') {
      const check = isValidAcademicTopicInput(hierarchy.subTopic, hierarchy.chapter);
      if (!check.isValid) {
        setShowConfig(false);
        setError(check.error || 'Please enter a valid academic concept or topic name.');
        triggerVibration([30, 50, 30]);
        return;
      }
    }

    // Check if user has at least 2 coins before starting, but do not deduct yet!`;

const qgTarget2 = `      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json();
          throw new Error(data.text || 'Gemini API quota exceeded. Please try again in 60 seconds.');
        }
        throw new Error('Failed to generate quiz');
      }`;

const qgReplace2 = `      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 400 && (errData.error === 'INVALID_TOPIC' || errData.code === 'INVALID_TOPIC')) {
          throw new Error(errData.message || 'The entered topic is not a recognized academic concept for this chapter. Please enter a valid topic or pick from the recommended units.');
        }
        if (response.status === 429) {
          throw new Error(errData.text || 'Gemini API quota exceeded. Please try again in 60 seconds.');
        }
        throw new Error(errData.error || errData.message || 'Failed to generate quiz');
      }`;

const qgTarget3 = `                {/* Topic Metadata Description */}
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-3 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Active Topic</span>
                  <p className="text-xs font-extrabold text-zinc-700 line-clamp-1">
                    {topicToGenerate || 'General Subject Practice'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(15);
                      setShowConfig(false);
                      setPendingFile(null);
                      setPendingGeneratorType(null);
                    }}
                    className="flex-1 py-3.5 rounded-2xl border border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 font-black text-sm active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(20);
                      handleExecuteReal(configCount);
                    }}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-indigo-600/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border border-indigo-500/20"
                  >
                    <span>🪄</span> Start Generating
                  </button>
                </div>`;

const qgReplace3 = `                {/* Topic Metadata Description & Inline Validation */}
                {(() => {
                  const hierarchy = parseTopicHierarchy(topicToGenerate || '');
                  const validation = (hierarchy.subTopic && hierarchy.subTopic !== 'All')
                    ? isValidAcademicTopicInput(hierarchy.subTopic, hierarchy.chapter)
                    : { isValid: true };

                  return (
                    <>
                      <div className={\`rounded-2xl p-3 flex flex-col gap-1 border transition-all \${
                        !validation.isValid ? 'bg-rose-50/80 border-rose-200' : 'bg-zinc-50 border-zinc-100'
                      }\`}>
                        <span className={\`text-[10px] font-bold uppercase tracking-widest \${
                          !validation.isValid ? 'text-rose-600' : 'text-zinc-400'
                        }\`}>
                          Active Topic
                        </span>
                        <p className={\`text-xs font-extrabold line-clamp-1 \${
                          !validation.isValid ? 'text-rose-800' : 'text-zinc-700'
                        }\`}>
                          {topicToGenerate || 'General Subject Practice'}
                        </p>
                        {!validation.isValid && (
                          <p className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                            <span>⚠️</span>
                            <span>{validation.error}</span>
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            triggerVibration(15);
                            setShowConfig(false);
                            setPendingFile(null);
                            setPendingGeneratorType(null);
                          }}
                          className="flex-1 py-3.5 rounded-2xl border border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 font-black text-sm active:scale-[0.98] transition-all cursor-pointer"
                        >
                          Go Back
                        </button>
                        <button
                          type="button"
                          disabled={!validation.isValid}
                          onClick={() => {
                            if (!validation.isValid) {
                              triggerVibration([30, 50, 30]);
                              return;
                            }
                            triggerVibration(20);
                            handleExecuteReal(configCount);
                          }}
                          className={\`flex-[2] py-3.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 border \${
                            validation.isValid
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/10 active:scale-[0.98] cursor-pointer border-indigo-500/20'
                              : 'bg-zinc-200 text-zinc-400 cursor-not-allowed border-zinc-300'
                          }\`}
                        >
                          <span>🪄</span> Start Generating
                        </button>
                      </div>
                    </>
                  );
                })()}`;

patchFile(quizGenPath, [
  { name: 'QuizGen handleGenerateReal Guard', search: qgTarget1, replace: qgReplace1 },
  { name: 'QuizGen INVALID_TOPIC 400 Handle', search: qgTarget2, replace: qgReplace2 },
  { name: 'QuizGen showConfig Topic Validation', search: qgTarget3, replace: qgReplace3 }
]);
