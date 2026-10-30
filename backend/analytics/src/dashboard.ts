import {z} from 'zod';
import {withSystem,type PoolClient} from '@chordjai/db';
import {jsonBody,ok,HttpError,uuid,type ServiceContext} from '@chordjai/service-kit';
import type {Hono} from 'hono';
import type {ServiceEnv} from '@chordjai/service-kit';
import {dashboardConfig,dashboardSession,loginDashboard,logoutDashboard} from './dashboard-auth';
const root='/api/v1/analytics/admin';
const date=z.iso.date();
export function dashboardFilter(query:Record<string,string>){
 const today=new Date(Date.now()+7*3600_000).toISOString().slice(0,10);
 const from=query.from??new Date(Date.now()+7*3600_000-29*86400_000).toISOString().slice(0,10),to=query.to??today;
 const parsed=z.object({from:date,to:date,group:z.enum(['day','month','year']),userId:z.uuid().optional(),feature:z.string().regex(/^[a-z][a-z0-9_.]{0,79}$/).optional()}).safeParse({from,to,group:query.group??'day',userId:query.userId||undefined,feature:query.feature||undefined});
 if(!parsed.success)throw new HttpError(400,'DASHBOARD_FILTER_INVALID','วันที่หรือตัวกรองไม่ถูกต้อง');
 const start=Date.parse(from+'T00:00:00+07:00'),end=Date.parse(to+'T00:00:00+07:00')+86400_000;
 if(end<=start||end-start>3660*86400_000)throw new HttpError(400,'DASHBOARD_RANGE_INVALID','เลือกช่วงวันที่ไม่เกิน 10 ปี และวันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
 return {...parsed.data,start:new Date(start).toISOString(),end:new Date(end).toISOString()};
}
type Filter=ReturnType<typeof dashboardFilter>;
const costColumns=`count(*)::int requests,count(*) filter(where status='ok')::int succeeded,count(*) filter(where status='error')::int failed,
 sum(input_tokens)::float input_tokens,sum(output_tokens)::float output_tokens,sum(cached_input_tokens)::float cached_input_tokens,sum(cache_write_tokens)::float cache_write_tokens,sum(reasoning_tokens)::float reasoning_tokens,
 coalesce(sum(estimated_cost_usd) filter(where cost_basis='token_estimate'),0)::float estimated_usd,
 coalesce(sum(cost_usd) filter(where status='reserved' or cost_basis in('reserved','unknown','unpriced')),0)::float uncertain_usd,
 coalesce(sum(cost_usd) filter(where cost_basis='legacy_estimate' and status<>'reserved'),0)::float legacy_usd,
 count(*) filter(where status='reserved' or cost_basis in('reserved','unknown','unpriced'))::int uncertain_requests,
 count(*) filter(where cost_basis='legacy_estimate' and status<>'reserved')::int legacy_requests,
 count(*) filter(where status='budget_blocked')::int blocked_requests,
 count(*) filter(where usage_reported)::int usage_reported_requests`;
const where=`created_at >= $1::timestamptz and created_at < $2::timestamptz and ($3::uuid is null or user_id=$3) and ($4::text is null or feature=$4)`;
const args=(f:Filter)=>[f.start,f.end,f.userId??null,f.feature??null];
const activity=`select user_id,created_at from analytics.events where name='app.opened'
 union all select user_id,created_at from ai_ops.requests where status<>'budget_blocked'
 union all select created_by user_id,created_at from health.care_entries
 union all select owner_id user_id,created_at from journal.pages`;
async function ensureSchema(db:PoolClient){
 const ready=(await db.query("select to_regclass('ops.dashboard_sessions') is not null and exists(select 1 from pg_attribute where attrelid='ai_ops.requests'::regclass and attname='cost_basis' and not attisdropped) ready")).rows[0].ready;
 if(!ready)throw new HttpError(503,'DASHBOARD_UPGRADE_REQUIRED','กรุณารัน supabase/upgrade.sql รุ่น 25 ก่อนใช้งาน dashboard');
}
export async function dashboardSummary(db:PoolClient,f:Filter){
 const values=args(f);
 const totals=(await db.query(`select ${costColumns} from ai_ops.requests where ${where}`,values)).rows[0];
 const users=(await db.query(`select
 (select count(*)::int from identity.users where role='owner') registered_users,
 (select count(*)::int from identity.users where role='owner' and created_at>=$1 and created_at<$2 and ($3::uuid is null or id=$3)) new_users,
 (select count(distinct a.user_id)::int from (${activity}) a join identity.users u on u.id=a.user_id where u.role='owner' and a.created_at>=$1 and a.created_at<$2 and ($3::uuid is null or a.user_id=$3)) active_users,
 (select count(*)::int from analytics.events where name='app.opened' and created_at>=$1 and created_at<$2 and ($3::uuid is null or user_id=$3)) app_opens,
 (select count(*)::int from pet.pets where ($3::uuid is null or owner_id=$3)) pets,
 (select count(*)::int from biometric.enrollments where status='ready' and ($3::uuid is null or user_id=$3)) petid_ready`,values.slice(0,3))).rows[0];
 const series=(await db.query(`with buckets as(select generate_series(date_trunc($5::text,$1::timestamptz at time zone 'Asia/Bangkok'),date_trunc($5::text,($2::timestamptz-interval '1 microsecond') at time zone 'Asia/Bangkok'),case $5 when 'day' then interval '1 day' when 'month' then interval '1 month' else interval '1 year' end) bucket),
 calls as(select date_trunc($5::text,created_at at time zone 'Asia/Bangkok') bucket,${costColumns} from ai_ops.requests where ${where} group by 1),
 newcomers as(select date_trunc($5::text,created_at at time zone 'Asia/Bangkok') bucket,count(*)::int new_users from identity.users where role='owner' and created_at>=$1 and created_at<$2 and ($3::uuid is null or id=$3) group by 1)
 select to_char(b.bucket,'YYYY-MM-DD') bucket,coalesce(c.requests,0) requests,coalesce(c.estimated_usd,0) estimated_usd,coalesce(c.uncertain_usd,0) uncertain_usd,coalesce(c.legacy_usd,0) legacy_usd,coalesce(n.new_users,0) new_users from buckets b left join calls c using(bucket) left join newcomers n using(bucket) order by b.bucket`,[...values,f.group])).rows;
 const features=(await db.query(`select feature,${costColumns} from ai_ops.requests where ${where} group by feature order by estimated_usd desc,requests desc`,values)).rows;
 const exposure=(await db.query(`select coalesce(sum(cost_usd) filter(where created_at>=date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'),0)::float daily_usd,coalesce(sum(cost_usd),0)::float monthly_usd from ai_ops.requests where created_at>=date_trunc('month',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'`)).rows[0];
 return {totals:{...totals,...users},series,features,budget:{dailyLimitUsd:Number(process.env.AI_DAILY_BUDGET_USD??5),userDailyLimitUsd:Number(process.env.AI_USER_DAILY_BUDGET_USD??0),monthlyLimitUsd:Number(process.env.AI_MONTHLY_BUDGET_USD??0),...exposure},timezone:'Asia/Bangkok',currency:'USD',generatedAt:new Date().toISOString(),filters:{from:f.from,to:f.to,group:f.group,userId:f.userId??null,feature:f.feature??null}};
}
export async function dashboardUsers(db:PoolClient,f:Filter,search:string,page:number){
 const values=[...args(f),search,page*25];
 const result=await db.query(`with selected as(select u.id,u.display_name,u.status,u.created_at,
 (select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'species',p.species,'petidStatus',e.status) order by p.created_at) from pet.pets p left join biometric.enrollments e on e.pet_id=p.id where p.owner_id=u.id) pets,
 (select count(*)::int from health.care_entries where created_by=u.id and created_at>=$1 and created_at<$2) diary_entries,
 (select count(*)::int from journal.pages where owner_id=u.id and created_at>=$1 and created_at<$2) memory_pages,
 (select max(a.created_at) from (${activity}) a where a.user_id=u.id) last_active_at,
 (select count(*)::int from ai_ops.requests r where r.user_id=u.id and r.created_at>=$1 and r.created_at<$2 and ($4::text is null or r.feature=$4)) ai_requests,
 (select coalesce(sum(estimated_cost_usd),0)::float from ai_ops.requests r where r.user_id=u.id and r.created_at>=$1 and r.created_at<$2 and cost_basis='token_estimate' and ($4::text is null or r.feature=$4)) estimated_usd,
 (select coalesce(sum(cost_usd),0)::float from ai_ops.requests r where r.user_id=u.id and r.created_at>=$1 and r.created_at<$2 and (r.status='reserved' or r.cost_basis in('unknown','unpriced','legacy_estimate')) and ($4::text is null or r.feature=$4)) other_exposure_usd
 from identity.users u where u.role='owner' and ($3::uuid is null or u.id=$3) and ($5='' or u.display_name ilike '%'||$5||'%' or u.id::text=$5 or exists(select 1 from pet.pets p where p.owner_id=u.id and p.name ilike '%'||$5||'%')))
 select *,count(*) over()::int total_count from selected order by estimated_usd desc,created_at desc limit 25 offset $6`,values);
 return {items:result.rows,total:result.rows[0]?.total_count??(page?Number((await db.query("select count(*)::int total from identity.users u where u.role='owner' and ($1::uuid is null or u.id=$1) and ($2='' or u.display_name ilike '%'||$2||'%' or u.id::text=$2 or exists(select 1 from pet.pets p where p.owner_id=u.id and p.name ilike '%'||$2||'%'))",[f.userId??null,search])).rows[0].total):0),page,pageSize:25};
}
export function mountDashboard(app:Hono<ServiceEnv>){
 app.get(root+'/session',async c=>{await withSystem(ensureSchema);const session=await dashboardSession(c);return ok(c,session);});
 app.post(root+'/login',async c=>{await withSystem(ensureSchema);const body=await jsonBody(c,z.object({username:z.string().min(1).max(100),password:z.string().min(1).max(256)}));return ok(c,await loginDashboard(c,body.username,body.password));});
 app.post(root+'/logout',async c=>ok(c,await logoutDashboard(c)));
 app.get(root+'/overview',async c=>{await dashboardSession(c);const f=dashboardFilter(c.req.query());return ok(c,await withSystem(db=>dashboardSummary(db,f)));});
 app.get(root+'/users',async c=>{await dashboardSession(c);const f=dashboardFilter(c.req.query());const search=(c.req.query('search')??'').trim().slice(0,100),page=parsePage(c.req.query('page'));return ok(c,await withSystem(db=>dashboardUsers(db,f,search,page)));});
 app.get(root+'/users/:id',async c=>{
  const session=await dashboardSession(c),id=uuid(c.req.param('id')),f=dashboardFilter({...c.req.query(),userId:id});
  const result=await withSystem(async db=>{
   const list=await dashboardUsers(db,f,'',0);if(!list.items[0])throw new HttpError(404,'DASHBOARD_USER_NOT_FOUND','ไม่พบผู้ใช้นี้');
   await db.query("insert into identity.audit_log(action,resource_type,resource_id,metadata) values('dashboard.user.view','user',$1,$2::jsonb)",[id,JSON.stringify({operator:session.username})]);
   return {user:list.items[0],...await dashboardSummary(db,f)};
  });return ok(c,result);
 });
 app.get(root+'/requests',async c=>{
  await dashboardSession(c);const f=dashboardFilter(c.req.query()),page=parsePage(c.req.query('page'));
  const result=await withSystem(async db=>({items:(await db.query(`select id,user_id,feature,model,model_resolved,input_tokens,output_tokens,cached_input_tokens,cache_write_tokens,reasoning_tokens,total_tokens,latency_ms,status,error_code,estimated_cost_usd,cost_basis,price_snapshot,service_tier,usage_reported,created_at,completed_at,case when status='reserved' or cost_basis in('unknown','unpriced','legacy_estimate') then cost_usd end other_exposure_usd from ai_ops.requests where ${where} order by created_at desc,id desc limit 50 offset $5`,[...args(f),page*50])).rows,total:Number((await db.query(`select count(*) total from ai_ops.requests where ${where}`,args(f))).rows[0].total),page,pageSize:50}));
  return ok(c,result);
 });
}
function parsePage(raw:string|undefined){const n=Number(raw??0);if(!Number.isSafeInteger(n)||n<0||n>10000)throw new HttpError(400,'DASHBOARD_PAGE_INVALID','หน้าข้อมูลไม่ถูกต้อง');return n;}
