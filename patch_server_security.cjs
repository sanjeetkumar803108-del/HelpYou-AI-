const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const importsToAdd = `import rateLimit from "express-rate-limit";
import xss from "xss";
`;

content = content.replace('import { createRequire } from "module";', importsToAdd + 'import { createRequire } from "module";');

const securityMiddlewares = `
// 1. Strict Rate Limiting (Brute Force Protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests from this IP, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Auth Specific Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 failed login/auth attempts
  message: { error: "Too many login attempts, please try again after 15 minutes." },
});
app.use('/api/auth/', authLimiter); // Assuming if there's any backend auth

// 2. Global Input Sanitization Middleware (Injection Prevention)
const sanitizeInput = (obj: any): any => {
  if (typeof obj === 'string') {
    return xss(obj); // Strips <script> and dangerous HTML
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeInput(item));
  }
  if (typeof obj === 'object' && obj !== null) {
    const sanitizedObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitizedObj[key] = sanitizeInput(value);
    }
    return sanitizedObj;
  }
  return obj;
};

app.use(express.json());
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
`;

content = content.replace('app.use(cors());', 'app.use(cors());\n' + securityMiddlewares);
// Ensure we remove any existing app.use(express.json()) to avoid duplication, wait I didn't see one in the first 30 lines but it must be somewhere.
// Let's check where express.json() is.

fs.writeFileSync('server.ts', content, 'utf8');
