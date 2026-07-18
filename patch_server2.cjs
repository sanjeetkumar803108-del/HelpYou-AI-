const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(
  `    const action = req.body.action || 'summarize';`,
  `    const action = req.body.action || 'summarize';
    if (action === 'debug') return res.json({ body: req.body });`
);

fs.writeFileSync('server.ts', content);
