const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const regex = /\}\);\s*try \{\s*const \{ topic, type \} = req\.body;/;

content = content.replace(regex, `});\n\napp.post("/api/generate-content", async (req, res) => {\n  try {\n    const { topic, type } = req.body;`);

fs.writeFileSync('server.ts', content);
