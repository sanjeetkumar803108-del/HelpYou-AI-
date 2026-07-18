const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

// Remove my added app.use(express.json());
content = content.replace('app.use(express.json());', '');

// Move the sanitize block below the existing app.use(express.json({ limit: "35mb" }));
// Wait, actually, the sanitize middleware needs to run AFTER the body is parsed.
// Right now, my middleware is placed right after cors(), so it runs BEFORE the original express.json(). This means req.body is undefined when my sanitizer runs!
// Let's remove my sanitize middleware from its current place and put it after the original express.json().
content = content.replace(`app.use((req, res, next) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }
  next();
});`, '');

content = content.replace('app.use(express.json({ limit: "35mb" }));', `app.use(express.json({ limit: "35mb" }));

app.use((req, res, next) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }
  next();
});
`);

fs.writeFileSync('server.ts', content, 'utf8');
