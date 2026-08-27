const dotenv = require('dotenv');
dotenv.config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testPointwisePrompt() {
  const prompt = `STUDENT SEARCH QUERY: "Jeju Island recent missing persons crisis"
VERIFIED REAL-TIME WEB SEARCH DATA:
[Verified Source 1] Title: South Korea Police Face Outcry Over Jeju Island Missing Persons
URL: https://news.google.com
Content Snippet: In late August 2026, four bodies were discovered on Jeju Island. Investigations revealed police misconduct in closing cases.

Conduct a deep, rigorous, point-wise research report strictly following the JSON format.`;

  const systemInstruction = `You are the lead intelligence engine for "Deep Search AI" in the "HelpYou AI" app.
Your mission is to process student queries and produce an elite, point-wise, in-depth academic research report grounded in real-time verified data.

CRITICAL FORMATTING & STRUCTURE RULES:
1. ONLY ONE MAIN HEADLINE:
   - "topic_title" is the single main headline (3-6 words max, e.g. "Jeju Island Case Investigation", "JEE Main 2026 Registration Guide").
2. NEVER OUTPUT LARGE UNBROKEN PARAGRAPHS:
   - All explanations MUST be strictly broken down into small, digestible subheadings and bullet points.
   - Each section in "live_updates" MUST start with a small markdown subheading (e.g. "### 📌 Core Background & Overview", "### 🔍 Key Events & Timeline", "### ⚖️ Systemic Impact & Public Reaction", "### 💡 High-Yield Exam Takeaways").
   - Under each subheading, provide 2 to 4 detailed bullet points starting with bold anchors (e.g. "* **Incident Timeline:** In late August 2026...").
3. TRUTHFULNESS & GROUNDING:
   - Base all facts, recent dates, exam notices, historical events, and names strictly on reality and the provided Verified Web Search Context.
   - ZERO HALLUCINATIONS: Do not fabricate dates, numbers, event outcomes, or policies.
4. STEM vs HUMANITIES RIGOR:
   - STEM Queries (Physics, Chemistry, Math, Biology): Provide core formulas wrapped in LaTeX ($...$ or $$...$$), step-by-step principles, and key parameters.
   - Humanities/News Queries: Provide structured bullet points covering background origin, chronological milestones, institutional impact, and current status.
5. LANGUAGE MATCHING:
   - If the user wrote in Hinglish, write natural, engaging, point-wise Hinglish.
   - If Hindi, write Hindi. If English, write English.
6. ZERO FAKE URLS:
   - In "source_links", ONLY use exact verified URLs from context.

STRICT JSON OUTPUT FORMAT:
{
  "topic_title": "Concise Main Headline (3-6 words)",
  "match_score": "98%",
  "live_updates": [
    "### 📌 Core Background & Overview\\n* **Foundational Context:** Clear, detailed background facts.\\n* **Core Definition & Significance:** Key concepts students need to know.",
    "### 🔍 Detailed Timeline & Key Developments\\n* **Chronological Events:** Specific dates and verified occurrences.\\n* **Key Turning Points:** Critical discoveries or policy shifts.",
    "### ⚖️ Analytical Impact & Real-World Consequences\\n* **Institutional Response:** Official commissions, public reaction, or examination implications.\\n* **Modern Status:** Current status as of today.",
    "### 💡 High-Yield Student Takeaways\\n* **Critical Exam Insights:** High-yield questions and summary synthesis.\\n* **Common Misconceptions:** Key distinctions to avoid exam traps."
  ],
  "action_steps": [
    "Step 1: Foundational Review - core concepts and essential timeline to master",
    "Step 2: Analytical Deep-Dive - key turning points or core mechanisms",
    "Step 3: Synthesis & Verification - high-yield review against verified facts"
  ],
  "pro_tips": "In-depth educator pro-tip highlighting common exam traps or memory anchors.",
  "related_queries": [
    "Follow-up research question 1",
    "Follow-up research question 2",
    "Follow-up research question 3"
  ],
  "source_links": [
    "https://news.google.com"
  ]
}`;

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    });

    const parsed = JSON.parse(res.text);
    console.log("=== MAIN HEADLINE ===");
    console.log(parsed.topic_title);
    console.log("\n=== POINT-WISE LIVE UPDATES ===");
    parsed.live_updates.forEach((u, i) => console.log(`\n--- Section ${i+1} ---\n${u}`));
  } catch (err) {
    console.error("Test error:", err);
  }
}

testPointwisePrompt();
