const fs = require('fs');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace default models in safeGenerateContent
  content = content.replace(
    /let modelsToTry = isSpecialtyModel \? \[requestedModel\] : \[\s*requestedModel \|\| "[^"]+",\s*"[^"]+",\s*"[^"]+"\s*\]\.filter\(/g,
    `let modelsToTry = isSpecialtyModel ? [requestedModel] : [
    requestedModel || "gemini-3.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-3.6-flash"
  ].filter(`
  );

  // Replace default streaming models in /api/chat
  content = content.replace(
    /let modelsToTry = \[\s*"gemini-3\.6-flash",\s*"gemini-3\.5-flash-lite"\s*\];/g,
    `let modelsToTry = [
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-flash-lite-latest",
        "gemini-flash-latest",
        "gemini-3.6-flash"
      ];`
  );

  // Remove googleSearch tool from /api/chat
  content = content.replace(
    /\.\.\.\(shouldEnableSearch \? \{ tools: \[\{ googleSearch: \{\} \}\] \} : \{\}\),?/g,
    ''
  );

  // Clean currentParams creation in safeGenerateContent to prevent invalid arguments
  content = content.replace(
    /const currentParams = \{ \.\.\.clonedParams \};\s*if \(clonedParams\.config\) \{[\s\S]*?\}\s*currentParams\.model = model;/g,
    `const currentParams: any = {
      model,
      contents: clonedParams.contents
    };
    if (clonedParams.config) {
      currentParams.config = { ...clonedParams.config };
      if (currentParams.config.tools) {
        currentParams.config.tools = currentParams.config.tools.map((t: any) => ({ ...t }));
      }
      if (currentParams.config.systemInstruction) {
        currentParams.config.systemInstruction = { ...currentParams.config.systemInstruction };
        if (currentParams.config.systemInstruction.parts) {
          currentParams.config.systemInstruction.parts = currentParams.config.systemInstruction.parts.map((p: any) => ({ ...p }));
        }
      }
    }`
  );

  // Ensure fallback loop continues on any model error instead of aborting
  content = content.replace(
    /if \(anyQuotaExceeded\) \{\s*const rateLimitError: any = new Error\("GEMINI_QUOTA_EXHAUSTED"\);\s*rateLimitError\.isRateLimit = true;\s*throw rateLimitError;\s*\}\s*throw lastError \|\| new Error\("AI generation failed after multiple attempts"\);/g,
    `if (lastError) {
    throw lastError;
  }
  throw new Error("AI generation failed after multiple attempts");`
  );

  // Replace default model references across endpoints to gemini-3.5-flash-lite
  content = content.replace(/model:\s*"gemini-3\.6-flash"/g, 'model: "gemini-3.5-flash-lite"');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}`);
}

fixFile('server.ts');
fixFile('api/index.ts');
