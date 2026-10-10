import { Hono } from 'hono';
import app from './app';
// Keep Hono visible to Vercel's framework detection at the service entrypoint.
void Hono;
export { app };
export default app;
