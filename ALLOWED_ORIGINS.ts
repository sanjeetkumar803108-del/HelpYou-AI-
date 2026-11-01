// Security: Hardened CORS with strict domain whitelist
export const ALLOWED_ORIGINS = new Set([
    'https://help-you-ai-brcj.vercel.app',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
]);

