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

const serverPath = path.resolve('server.ts');

// 1. Add chatter validator before getExamBlueprintDirective
const serverSearch1 = `function getExamBlueprintDirective(exam?: string, blueprint?: any, subject?: string): string {`;
const serverReplace1 = `const NON_ACADEMIC_CHATTER_PATTERNS = [
  /^(thik|theek|sahi|accha|acha|mast|badhiya)\s*(hai|h|he)?(\s*bhai|\s*bro|\s*yaar|\s*sir)?$/i,
  /\\b(thik\\s*hai|theek\\s*hai|sahi\\s*hai|accha\\s*hai)\\b/i,
  /^(hello|hi|hey|bye|good\\s*morning|good\\s*night|good\\s*evening)(\\s*bhai|\\s*bro|\\s*yaar|\\s*sir)?$/i,
  /^(ok|okay|k|okk|okey|yup|nope|yes|no)(\\s*bhai|\\s*bro|\\s*yaar)?$/i,
  /^(test|testing|demo|check|trial|sample)(\\s*\\d+)?$/i,
  /^(asdf|qwerty|zxcv|abc|xyz|123|000|aaa|bbb|ccc)/i,
  /^(kuch\\s*bhi|faltu|bakwas|bakwaas|nonsense|random|timepass|nothing|none)$/i,
  /\\b(kuch\\s*bhi|timepass|bakwaas|faltu)\\b/i,
  /^(kya\\s*hal|kaise\\s*ho|what('?s)?\\s*up|how\\s*are\\s*you|kya\\s*chal\\s*raha)$/i,
  /^(lol|lmao|rofl|haha|hehe|xd|omg)$/i,
  /^(bhai|bro|yaar|sir|madam|dost)$/i,
  /^(mujhe\\s*nahi\\s*pata|pata\\s*nahi|nahi\\s*pata|kuch\\s*nahi|dont\\s*know|i\\s*dont\\s*know|idk|naah|nope)$/i,
  /^(padhai\\s*nahi\\s*karni|bore\\s*ho\\s*raha|bore|boring)$/i,
  /^(chalo|bye|goodbye|tata|see\\s*you)$/i,
  /^(what\\s*to\\s*do|what\\s*is\\s*this|who\\s*are\\s*you|kya\\s*hai\\s*ye)$/i,
  /^([a-z])\\1{3,}$/i
];

function isOffTopicOrChatter(rawTopic: string): { isInvalid: boolean; reason?: string } {
  if (!rawTopic || typeof rawTopic !== 'string') {
    return { isInvalid: true, reason: 'Topic is missing.' };
  }
  const clean = rawTopic.trim();
  const parts = clean.split(/\\s*[-–—:]\\s*/).map(p => p.trim()).filter(Boolean);
  const target = parts.length >= 3 ? parts.slice(2).join(' - ') : (parts.length === 2 ? parts[1] : clean);

  if (target.length < 3) {
    return { isInvalid: true, reason: 'Topic name is too short. Please enter a valid academic concept.' };
  }
  if (/^[\\d\\s\\-_.,!?:;@#$%^&*()+=/\\\\|<>~\`"'{}\\[\\]]+$/.test(target)) {
    return { isInvalid: true, reason: 'Topic contains only numbers or symbols. Please enter a real curriculum concept.' };
  }
  for (const pat of NON_ACADEMIC_CHATTER_PATTERNS) {
    if (pat.test(target)) {
      return { isInvalid: true, reason: \`"\${target}" is casual conversational chatter/slang, not a valid academic topic. Please enter a relevant topic from this chapter.\` };
    }
  }
  return { isInvalid: false };
}

function getExamBlueprintDirective(exam?: string, blueprint?: any, subject?: string): string {`;

// 2. Patch /api/generate-quiz
const quizSearch = `app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { topic, gradeLevel, stream, country, count } = req.body;
    if (!topic) {
      return res.status(400).json({ error: "Missing topic" });
    }`;

const quizReplace = `app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { topic, gradeLevel, stream, country, count } = req.body;
    if (!topic) {
      return res.status(400).json({ error: "Missing topic" });
    }

    const topicGuard = isOffTopicOrChatter(topic);
    if (topicGuard.isInvalid) {
      return res.status(400).json({ error: "INVALID_TOPIC", message: topicGuard.reason });
    }`;

// 3. Patch /api/generate-questions
const qSearch = `app.post("/api/generate-questions", async (req, res) => {
  try {
    const topic = req.body.topic || req.body.prompt || req.body.text || "";`;

const qReplace = `app.post("/api/generate-questions", async (req, res) => {
  try {
    const topic = req.body.topic || req.body.prompt || req.body.text || "";
    if (topic && topic.trim()) {
      const topicGuard = isOffTopicOrChatter(topic);
      if (topicGuard.isInvalid) {
        return res.status(400).json({ error: "INVALID_TOPIC", message: topicGuard.reason });
      }
    }`;

// 4. Patch /api/generate-ai-notes
const notesSearch = `app.post("/api/generate-ai-notes", async (req, res) => {
  try {
    const subject = (req.body.subject || "General Science").trim();
    const chapter = (req.body.chapter || req.body.topic || "Core Principles").trim();`;

const notesReplace = `app.post("/api/generate-ai-notes", async (req, res) => {
  try {
    const subject = (req.body.subject || "General Science").trim();
    const chapter = (req.body.chapter || req.body.topic || "Core Principles").trim();
    const topicGuard = isOffTopicOrChatter(chapter);
    if (topicGuard.isInvalid) {
      return res.status(400).json({ error: "INVALID_TOPIC", message: topicGuard.reason });
    }`;

// 5. Patch /api/generate-flashcards
const fcSearch = `app.post("/api/generate-flashcards", async (req, res) => {
  try {
    const text = req.body.text || req.body.topic || req.body.content || "";
    const topic = req.body.topic || text || "";
    const gradeLevel = req.body.gradeLevel || req.body.userGrade;
    const stream = req.body.stream || req.body.academic_stream;
    const country = req.body.country || req.body.academic_country;
    const count = req.body.count;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text or topic" });
    }`;

const fcReplace = `app.post("/api/generate-flashcards", async (req, res) => {
  try {
    const text = req.body.text || req.body.topic || req.body.content || "";
    const topic = req.body.topic || text || "";
    const gradeLevel = req.body.gradeLevel || req.body.userGrade;
    const stream = req.body.stream || req.body.academic_stream;
    const country = req.body.country || req.body.academic_country;
    const count = req.body.count;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text or topic" });
    }

    const topicGuard = isOffTopicOrChatter(text);
    if (topicGuard.isInvalid) {
      return res.status(400).json({ error: "INVALID_TOPIC", message: topicGuard.reason });
    }`;

patchFile(serverPath, [
  { name: 'Server helper isOffTopicOrChatter', search: serverSearch1, replace: serverReplace1 },
  { name: 'Server /api/generate-quiz guard', search: quizSearch, replace: quizReplace },
  { name: 'Server /api/generate-questions guard', search: qSearch, replace: qReplace },
  { name: 'Server /api/generate-ai-notes guard', search: notesSearch, replace: notesReplace },
  { name: 'Server /api/generate-flashcards guard', search: fcSearch, replace: fcReplace }
]);

console.log('server.ts successfully patched!');
