const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const regex = /app\.post\("\/api\/summarize", upload\.single\("pdf"\), async \(req, res\) => \{[\s\S]*?\}\);/g;

const newSummarize = `app.post("/api/summarize", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF provided" });
    }
    
    const action = req.body.action || 'summarize';
    const cacheKey = crypto.createHash("sha256").update(req.file.buffer).digest("hex") + "_" + action;
    if (summaryCache.has(cacheKey)) {
      return res.json({ text: summaryCache.get(cacheKey) });
    }

    const aiClient = getAI();
    
    const pdfPart = {
      inlineData: {
        mimeType: req.file.mimetype,
        data: req.file.buffer.toString("base64"),
      },
    };
    
    let promptText = "";
    if (action === 'audio') {
      promptText = "You are an enthusiastic, highly experienced, and friendly school teacher. Your goal is to explain educational concepts to a student in a way that feels like a real, engaging one-on-one conversation. Summarize and explain the provided document based on the following strict rules: 1. TONE & STYLE: Speak directly to the student using words like 'you', 'we', and 'let's look at this'. Be warm, encouraging, and full of energy. 2. SIMPLICITY: Break down complex concepts into simple, bite-sized pieces. If there is a difficult scientific word, explain it simply immediately. 3. ANALOGIES: Use simple, real-world examples. 4. AUDIO-FRIENDLY FORMATTING: This output will be read aloud by a Text-to-Speech (TTS) engine. DO NOT use any markdown formatting like bold (**), italics (*), hashtags (#), or bullet points (-). Write in plain, short paragraphs. Keep sentences short so the AI voice can take natural breaths and pauses. 5. STRUCTURE: Start with a catchy hook to grab attention. Explain the 3 or 4 main points clearly. End with a quick, memorable 1-sentence summary and an encouraging closing (e.g., 'Great job focusing, you\\'ve got this!'). Do not include any intro or outro text confirming you understand the instructions. Just start teaching the provided text.";
    } else if (action === 'flashcards') {
      promptText = "Extract the most important facts and concepts from the provided document and format them into 10 high-quality flashcards. Format exactly like this for each:\\n\\n**Q: [Question]**\\n*A: [Answer]*\\n\\nKeep them concise.";
    } else if (action === 'quiz') {
      promptText = "Create a 5-question multiple choice quiz based on the provided document. Include 4 options (A, B, C, D) for each question. At the very end, provide an Answer Key.";
    } else {
      promptText = "You are an expert tutor. Please extract and summarize the most important notes from this document in a well-structured, easy to read format using Markdown. Include clear headings and bullet points.";
    }

    const textPart = { text: promptText };
    
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: { parts: [pdfPart, textPart] },
    });
    
    const summaryText = response.text || "";
    summaryCache.set(cacheKey, summaryText);
    
    res.json({ text: summaryText });
  } catch (error) {
    console.error("Summarize error:", error);
    res.status(500).json({ error: error.message });
  }
});`;

content = content.replace(regex, newSummarize);

fs.writeFileSync('server.ts', content);
