import { Hono } from 'hono';
import app from './app';
import { lineMessagingReadiness } from '@chordjai/line';
void Hono;
const lineReadiness=lineMessagingReadiness();
if(!lineReadiness.ready)console.warn(JSON.stringify({event:'line_configuration_unready',service:'notification',mode:lineReadiness.mode}));
export { app };
export default app;
