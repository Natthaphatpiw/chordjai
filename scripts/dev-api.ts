import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import identity from '../backend/identity/src/app';
import pet from '../backend/pet/src/app';
import health from '../backend/health/src/app';
import journal from '../backend/journal/src/app';
import assistant from '../backend/assistant/src/app';
import triage from '../backend/triage/src/app';
import biometric from '../backend/biometric/src/app';
import lostfound from '../backend/lostfound/src/app';
import clinic from '../backend/clinic/src/app';
import share from '../backend/share/src/app';
import notification from '../backend/notification/src/app';
import media from '../backend/media/src/app';
import analytics from '../backend/analytics/src/app';
import scheduler from '../backend/scheduler/src/app';
// Local routing adapter only. Production builds each microservice independently.
const app=new Hono();
const routes:[RegExp,typeof identity][]=[
  [/^\/api\/v1\/identity(?:\/|$)/,identity],[/^\/api\/v1\/(?:pets|invitations)(?:\/|$)/,pet],
  [/^\/api\/v1\/health(?:\/|$)/,health],[/^\/api\/v1\/journal(?:\/|$)/,journal],
  [/^\/api\/v1\/assistant(?:\/|$)/,assistant],[/^\/api\/v1\/triage(?:\/|$)/,triage],
  [/^\/api\/v1\/(?:biometric|petid)(?:\/|$)/,biometric],[/^\/api\/v1\/lostfound(?:\/|$)/,lostfound],
  [/^\/api\/v1\/(?:clinic|clinics)(?:\/|$)/,clinic],[/^\/api\/v1\/share(?:\/|$)/,share],
  [/^\/api\/v1\/notification(?:\/|$)|^\/internal\/(?:process-line|reminders)$/,notification],
  [/^\/api\/v1\/media(?:\/|$)/,media],[/^\/api\/v1\/analytics(?:\/|$)/,analytics],
  [/^\/internal\/cron\//,scheduler]
];
app.get('/healthz',c=>c.json({data:{service:'local-router',status:'ok'}}));
app.all('*',c=>{const target=routes.find(([pattern])=>pattern.test(c.req.path))?.[1];return target?target.fetch(c.req.raw):c.json({error:{code:'NOT_FOUND',message:'ไม่พบ endpoint'}},404);});
serve({fetch:app.fetch,port:Number(process.env.API_PORT??8787)},()=>console.log('ChordJai API http://localhost:8787'));
