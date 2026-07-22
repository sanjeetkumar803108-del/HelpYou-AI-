// Vercel Serverless Entry Point
// This file imports the Express app from server.ts and exports it
// so Vercel can handle requests as a Serverless Function.
import app from '../server';

export default app;
