import {mountDashboard} from './dashboard';
import { z } from 'zod';
import { withUser,withSystem } from '@chordjai/db';
import { createService,getActor,requireRole,ok,jsonBody,uuid,HttpError } from '@chordjai/service-kit';
import { careProductMetrics } from './care-kpis.js';
import {ipFollowupMetrics} from './ip-followup-kpis.js';
// Keep numeric suffixes compatible with the typed frontend contract. The
// common row mapper converts underscore-letter pairs, but preserves `_30`.
function metricNumberKeys(data:Record<string,unknown>){
  for(const name of ['care','petid','petid_research','personalized_followups']){
    const block=data[name];
    if(block&&typeof block==='object')data[name]=Object.fromEntries(Object.entries(block).map(([key,value])=>[key.replace(/_(?=\d)/g,''),value]));
  }
  return data;
}
const app=createService('analytics');
mountDashboard(app);
app.post('/api/v1/analytics/events',async c=>{
  const actor=getActor(c),b=await jsonBody(c,z.object({name:z.enum(['app.opened','care.composer.opened','clinic.called','clinic.directions','journal.saved','survey.very_disappointed']),petId:z.uuid().optional(),properties:z.object({ref:z.string().max(100).optional(),readyMs:z.number().int().min(0).max(120000).optional(),authPath:z.enum(['stored_token','owner_session','line']).optional(),entryPoint:z.enum(['quick','records']).optional()}).strict().optional()}));
  await withUser(actor.id,db=>db.query('INSERT INTO analytics.events(user_id,pet_id,name,properties) VALUES($1,$2,$3,$4::jsonb)',[actor.id,b.petId??null,b.name,JSON.stringify(b.properties??{})]));return ok(c,{recorded:true},201);
});
app.get('/api/v1/analytics/kpis',async c=>{
  requireRole(c,['admin']);const data=await withSystem(async db=>{
    const r=await db.query(`SELECT (SELECT count(*) FROM identity.users)::int AS users,(SELECT count(*) FROM pet.pets)::int AS pets,(SELECT count(*) FROM health.records)::int AS health_records,(SELECT count(*) FROM share.views)::int AS summary_views,(SELECT count(*) FROM clinic.clinics WHERE verified_at IS NOT NULL)::int AS clinics,(SELECT count(*) FROM triage.sessions)::int AS triage_sessions,(SELECT count(*) FROM lostfound.cases WHERE status='active')::int AS active_lost_cases,(SELECT count(*) FROM journal.pages)::int AS journal_pages,(SELECT count(*) FROM assistant.conversations)::int AS conversations,(SELECT coalesce(sum(cost_usd),0) FROM ai_ops.requests WHERE created_at>=date_trunc('day',now()))::float AS ai_cost_today_usd,(SELECT count(*) FROM ops.jobs WHERE status='dead')::int AS dead_jobs`);return {...r.rows[0],...await careProductMetrics(db),...await ipFollowupMetrics(db),readiness:{clinicalEval:'pending',petidCalibration:'pending',retentionCohort:'requires_real_usage'}};
  });return ok(c,metricNumberKeys(data));
});
app.get('/api/v1/analytics/ai-requests',async c=>{requireRole(c,['admin']);return ok(c,await withSystem(async db=>(await db.query('SELECT id,feature,model,model_resolved,input_tokens,output_tokens,latency_ms,cost_usd,status,created_at FROM ai_ops.requests ORDER BY created_at DESC LIMIT 100')).rows));});
app.get('/api/v1/analytics/jobs',async c=>{requireRole(c,['admin']);return ok(c,await withSystem(async db=>(await db.query('SELECT id,topic,status,attempts,max_attempts,run_at,last_error,created_at FROM ops.jobs ORDER BY created_at DESC LIMIT 100')).rows));});
app.post('/api/v1/analytics/jobs/:id/replay',async c=>{
  const actor=requireRole(c,['admin']);const row=await withSystem(async db=>{
    const r=await db.query("UPDATE ops.jobs SET status='queued',attempts=0,run_at=now(),locked_until=NULL,lease_token=NULL,last_error=NULL WHERE id=$1 AND status='dead' RETURNING id",[uuid(c.req.param('id'))]);
    if(!r.rowCount)throw new HttpError(409,'JOB_NOT_DEAD','เรียกซ้ำได้เฉพาะงานที่ล้มเหลวครบจำนวนครั้ง');await db.query("INSERT INTO identity.audit_log(actor_id,action,resource_type,resource_id) VALUES($1,'job.replay','job',$2)",[actor.id,r.rows[0].id]);return r.rows[0];
  });return ok(c,row);
});
app.post('/api/v1/analytics/jobs/:id/discard',async c=>{
  const actor=requireRole(c,['admin']),id=uuid(c.req.param('id'));
  await withSystem(async db=>{
    const deleted=await db.query("DELETE FROM ops.jobs WHERE id=$1 AND status='dead' RETURNING id",[id]);
    if(!deleted.rowCount)throw new HttpError(409,'JOB_NOT_DEAD','ข้ามได้เฉพาะงานที่ล้มเหลวครบจำนวนครั้ง');
    await db.query("INSERT INTO identity.audit_log(actor_id,action,resource_type,resource_id) VALUES($1,'job.discard','job',$2)",[actor.id,id]);
  });return ok(c,{discarded:true});
});
export default app;
