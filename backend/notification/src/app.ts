import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {withUser,withSystem} from '@chordjai/db';
import {enqueue} from '@chordjai/queue';
import {verifyWebhookSignature,replyLine,pushLine,appLink,LineApiError} from '@chordjai/line';
import {createService,getActor,HttpError,jsonBody,ok,camel,uuid,type ServiceContext} from '@chordjai/service-kit';
import {buildCalendar} from './calendar.js';
import {registerFollowupRoutes,processFollowups,followupCommand,processFollowupCommand,captureFollowupReply} from './followup.js';
export const app=createService('notification');
registerFollowupRoutes(app);
const lineEventSchema=z.object({webhookEventId:z.string().min(1).max(100),type:z.string().max(80),replyToken:z.string().max(200).optional(),source:z.object({type:z.string(),userId:z.string().max(100).optional()}),message:z.object({type:z.string(),text:z.string().max(5000).optional()}).passthrough().optional()}).passthrough();
type LineEvent=z.infer<typeof lineEventSchema>;
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
function requireCron(c:ServiceContext){
  const secret=process.env.CRON_SECRET,auth=c.req.header('Authorization');
  if(!secret||secret.length<32||!auth)throw new HttpError(401,'UNAUTHORIZED','Worker authentication required');
  const received=Buffer.from(auth),expected=Buffer.from(`Bearer ${secret}`);
  if(received.length!==expected.length||!timingSafeEqual(received,expected))throw new HttpError(401,'UNAUTHORIZED','Worker authentication required');
}
app.post('/api/v1/notification/webhooks/line',async c=>{
  const bytes=new Uint8Array(await c.req.raw.arrayBuffer());
  if(!verifyWebhookSignature(bytes,c.req.header('x-line-signature')))throw new HttpError(401,'INVALID_LINE_SIGNATURE','LINE signature is invalid');
  let payload:unknown;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'INVALID_JSON','Invalid webhook body');}
  const body=z.object({events:z.array(lineEventSchema).max(100),destination:z.string().optional()}).parse(payload);
  for(const event of body.events){
    await withSystem(async tx=>{
      const inserted=await tx.query<{id:string}>('insert into notify.webhook_events(event_id,event_type,payload) values($1,$2,$3::jsonb) on conflict(event_id) do nothing returning id',[event.webhookEventId,event.type,JSON.stringify(event)]);
      if(inserted.rowCount)await enqueue('line.event',{eventId:event.webhookEventId},`line:${event.webhookEventId}`,tx);
    });
  }
  // LINE verification sends an empty events array and must also return 200.
  return ok(c,{accepted:true});
});
export async function processLineEvent(eventId:string){
  const stored=await withSystem(async tx=>(await tx.query<{payload:unknown;processed_at:Date|null}>('select payload,processed_at from notify.webhook_events where event_id=$1',[eventId])).rows[0]);
  if(!stored||stored.processed_at)return;
  const event=lineEventSchema.parse(stored.payload),lineUserId=event.source.userId;
  const user=lineUserId?await withSystem(async tx=>(await tx.query<{id:string}>('select id from identity.users where line_user_id=$1 and status=\'active\'',[lineUserId])).rows[0]):null;
  if(user&&(event.type==='follow'||event.type==='unfollow'))await withSystem(tx=>tx.query(`insert into notify.line_accounts(user_id,followed) values($1,$2) on conflict(user_id) do update set followed=excluded.followed,updated_at=now()`,[user.id,event.type==='follow']));
  const command=event.type==='message'&&event.message?.type==='text'?followupCommand(event.message.text??''):null;
  let specialReply:string|null=null;
  if(user&&event.source.type==='user'&&command){
    const result=await processFollowupCommand(user.id,command);
    specialReply=result.language==='en'?(result.changed?(command==='pause'?'Personalized check-ins are paused. Reply RESUME when you are ready.':'Personalized check-ins resumed. You can change sources or turn them off in settings.'):'Open settings to choose and consent to personalized check-ins first.'):(result.changed?(command==='pause'?'พักข้อความติดตามส่วนตัวแล้วครับ พิมพ์ ติดตามต่อ เมื่อพร้อม':'กลับมาติดตามน้องแล้วครับ เลือกข้อมูลหรือปิดได้ในตั้งค่า'):'เปิดตั้งค่าเพื่อเลือกข้อมูลและยินยอมรับข้อความติดตามก่อนครับ');
  }else if(user&&event.type==='message'&&event.source.type==='user'&&event.message?.type==='text'){
    const captured=await captureFollowupReply(user.id,event.webhookEventId,event.message.text??'');
    if(captured){const prefs=await withUser(user.id,async tx=>(await tx.query('select language from notify.followup_preferences where user_id=$1',[user.id])).rows[0]);specialReply=prefs?.language==='en'?'Your reply is saved privately in check-in history. You can review it and record a care update in the app.':'เก็บคำตอบไว้เป็นส่วนตัวในประวัติติดตามแล้วครับ เปิดแอปเพื่อทบทวนและจดอัปเดตการดูแลได้';}
  }
  if(event.replyToken&&(event.type==='message'||event.type==='follow')&&event.source.type==='user'){
    // Quick navigation replies contain no health facts or private user data.
    // Expired reply tokens are not replaced with paid, duplicate push messages.
    const text=event.message?.text??'',path=/วัคซีน|สมุด|บันทึก/.test(text)?'/app?tab=health':/หาย|พบ/.test(text)?'/app?tab=care':/อาการ|ป่วย/.test(text)?'/app?tab=triage':/คุย|ai/i.test(text)?'/app?tab=chat':'/app';
    try{await replyLine(event.replyToken,[{type:'text',text:specialReply?`${specialReply}\n${appLink('/app?tab=settings')}`:`ดูแลน้องไปด้วยกันกับ ChordJai\nเปิดแอป: ${appLink(path)}\nหากน้องหายใจลำบาก ชัก หมดสติ หรือปัสสาวะไม่ออก ให้ไปโรงพยาบาลสัตว์ทันที`}]);}
    catch(error){if(!(error instanceof LineApiError)||error.status!==400)throw error;/* invalid/expired reply token; do not replace with paid push */}
  }
  await withSystem(tx=>tx.query('update notify.webhook_events set processed_at=now(),payload=\'{}\'::jsonb where event_id=$1',[eventId]));
}
app.post('/internal/process-line',async c=>{
  requireCron(c);const body=await jsonBody(c,z.object({eventId:z.string().min(1).max(100)}));await processLineEvent(body.eventId);return ok(c,{processed:true});
});
app.get('/api/v1/notification/inbox',async c=>{
  const actor=getActor(c);return ok(c,camel(await withUser(actor.id,async tx=>(await tx.query('select * from notify.inbox where user_id=$1 order by created_at desc limit 100',[actor.id])).rows)));
});
app.patch('/api/v1/notification/inbox/:id/read',async c=>{
  const actor=getActor(c),result=await withUser(actor.id,tx=>tx.query('update notify.inbox set read_at=coalesce(read_at,now()) where id=$1 and user_id=$2 returning *',[uuid(c.req.param('id')),actor.id]));
  if(!result.rowCount)throw new HttpError(404,'MESSAGE_NOT_FOUND','ไม่พบข้อความ');return ok(c,camel(result.rows[0]));
});
app.get('/api/v1/notification/reminders',async c=>{
  const actor=getActor(c);return ok(c,camel(await withUser(actor.id,async tx=>(await tx.query('select * from notify.reminders where user_id=$1 and ($2::uuid is null or pet_id=$2) order by due_at limit 100',[actor.id,c.req.query('petId')?uuid(c.req.query('petId')):null])).rows)));
});
app.post('/api/v1/notification/reminders',async c=>{
  const actor=getActor(c),body=await jsonBody(c,z.object({petId:z.string().uuid(),title:z.string().trim().min(1).max(200),dueAt:z.string().datetime()}));
  const result=await withUser(actor.id,tx=>tx.query('insert into notify.reminders(pet_id,user_id,title,due_at) values($1,$2,$3,$4) returning *',[body.petId,actor.id,body.title,body.dueAt]));return ok(c,camel(result.rows[0]),201);
});
app.post('/api/v1/notification/reminders/:id/complete',async c=>{
  const actor=getActor(c),result=await withUser(actor.id,tx=>tx.query('update notify.reminders set completed_at=coalesce(completed_at,now()) where id=$1 and user_id=$2 returning *',[uuid(c.req.param('id')),actor.id]));
  if(!result.rowCount)throw new HttpError(404,'REMINDER_NOT_FOUND','ไม่พบการเตือน');return ok(c,camel(result.rows[0]));
});
app.post('/api/v1/notification/reminders/:id/snooze',async c=>{
  const actor=getActor(c),body=await jsonBody(c,z.object({dueAt:z.string().datetime()}));
  if(new Date(body.dueAt)<=new Date())throw new HttpError(400,'INVALID_DUE_DATE','เลือกเวลาในอนาคต');
  const result=await withUser(actor.id,tx=>tx.query('update notify.reminders set due_at=$3,sent_at=null,completed_at=null where id=$1 and user_id=$2 returning *',[uuid(c.req.param('id')),actor.id,body.dueAt]));
  if(!result.rowCount)throw new HttpError(404,'REMINDER_NOT_FOUND','ไม่พบการเตือน');return ok(c,camel(result.rows[0]));
});
export function bangkokNotificationTime(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const read=(name:string)=>parts.find(part=>part.type===name)!.value;
  const hour=Number(read('hour'));
  return {day:`${read('year')}-${read('month')}-${read('day')}`,quiet:hour>=21||hour<8};
}
export async function processReminders(){
  const reminders=await withSystem(async tx=>(await tx.query<{id:string;user_id:string;title:string;due_at:Date;line_user_id:string;followed:boolean}>(`select r.*,u.line_user_id,coalesce(la.followed,false) followed from notify.reminders r join identity.users u on u.id=r.user_id and u.status='active' left join notify.line_accounts la on la.user_id=u.id where r.sent_at is null and r.completed_at is null and r.due_at<=now()+interval '24 hours' order by r.due_at limit 100`)).rows);
  let sent=0;const local=bangkokNotificationTime();
  const grouped=new Map<string,typeof reminders>();
  for(const reminder of reminders){
    const dedupe=`reminder:${reminder.id}:${reminder.due_at.toISOString()}`;
    await withSystem(tx=>tx.query('insert into notify.inbox(user_id,title,body,dedupe_key) values($1,$2,$3,$4) on conflict(dedupe_key) do nothing',[reminder.user_id,'ถึงเวลาดูแลน้อง',reminder.title,dedupe]));
    grouped.set(reminder.user_id,[...(grouped.get(reminder.user_id)??[]),reminder]);
  }
  for(const [userId,items] of grouped){
    const first=items[0]!;
    const canPush=first.followed;
    if(canPush){
      if(local.quiet)continue;
      const digestKey=`reminder-digest:${userId}:${local.day}`;
      const delivery=await withSystem(async tx=>(await tx.query<{id:string;status:string}>(`insert into notify.deliveries(user_id,dedupe_key,channel) values($1,$2,'line') on conflict(dedupe_key) do update set dedupe_key=excluded.dedupe_key returning id,status`,[userId,digestKey])).rows[0]!);
      // New reminders after today's digest wait for the next allowed day; the
      // in-app inbox has already received each item, including during quiet time.
      if(delivery.status==='sent')continue;
      const lines=items.slice(0,5).map(item=>`• ${item.title}`);
      if(items.length>5)lines.push(`และอีก ${items.length-5} รายการ`);
      const pushed=await withSystem(async tx=>{
        await tx.query("select pg_advisory_xact_lock(hashtext('followup-user:'||$1))",[userId]);
        const followupToday=await tx.query(`select id from notify.followup_deliveries where user_id=$1 and first_push_at>=$2::date::timestamp at time zone 'Asia/Bangkok' limit 1`,[userId,local.day]);
        if(followupToday.rowCount)return false;
        const current=(await tx.query(`select u.line_user_id from identity.users u join notify.line_accounts la on la.user_id=u.id where u.id=$1 and u.status='active' and la.followed for share of u,la`,[userId])).rows[0];
        if(!current)return false;
        const already=(await tx.query('select status from notify.deliveries where id=$1 for update',[delivery.id])).rows[0];
        if(already?.status==='sent')return false;
        await pushLine(current.line_user_id,[{type:'text',text:`สรุปการดูแลน้องวันนี้\n${lines.join('\n')}\nเปิดรายละเอียด: ${appLink('/app?tab=health')}`}],delivery.id);
        await tx.query('update notify.deliveries set status=\'sent\',sent_at=now() where id=$1',[delivery.id]);return true;
      });
      if(!pushed)continue;
    }
    await withSystem(async tx=>{for(const reminder of items)await tx.query('update notify.reminders set sent_at=now() where id=$1 and due_at=$2',[reminder.id,reminder.due_at]);});sent+=items.length;
  }
  return sent;
}
app.post('/internal/reminders',async c=>{requireCron(c);return ok(c,{sent:await processReminders()});});
app.post('/internal/followups',async c=>{
  requireCron(c);
  const outcomes=await Promise.allSettled([processFollowups(),processFollowups()]);
  const completed=outcomes.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
  return ok(c,{processed:completed.reduce((sum,result)=>sum+result.processed,0),accepted:completed.reduce((sum,result)=>sum+result.accepted,0),failed:outcomes.filter(result=>result.status==='rejected').length,reasons:completed.map(result=>result.reason)});
});
app.get('/api/v1/notification/calendar',async c=>{
  const actor=getActor(c),rows=await withUser(actor.id,async tx=>(await tx.query('select id,title,due_at from notify.reminders where user_id=$1 and completed_at is null and ($2::uuid is null or pet_id=$2) order by due_at limit 300',[actor.id,c.req.query('petId')?uuid(c.req.query('petId')):null])).rows);
  c.header('Content-Type','text/calendar; charset=utf-8');c.header('Content-Disposition','attachment; filename="chordjai.ics"');return c.body(buildCalendar(rows));
});
app.post('/api/v1/notification/calendar-feeds',async c=>{
  const actor=getActor(c),token=randomBytes(32).toString('base64url');
  const feed=await withUser(actor.id,async tx=>(await tx.query('insert into notify.calendar_feeds(user_id,token_hash) values($1,$2) returning id',[actor.id,hash(token)])).rows[0]!);
  return ok(c,{id:feed.id,url:appLink(`/api/v1/notification/calendar-feeds/${token}.ics`),notice:'ลิงก์นี้ใช้เข้าถึงวันนัดของคุณ เก็บไว้เป็นส่วนตัวและเพิกถอนได้'},201);
});
app.get('/api/v1/notification/calendar-feeds/:token',async c=>{
  const token=c.req.param('token').replace(/\.ics$/,'');if(!/^[\w-]{43}$/.test(token))throw new HttpError(404,'FEED_NOT_FOUND','ไม่พบปฏิทิน');
  const rows=await withSystem(async tx=>{
    const feed=(await tx.query<{user_id:string}>('select user_id from notify.calendar_feeds where token_hash=$1 and revoked_at is null',[hash(token)])).rows[0];
    if(!feed)throw new HttpError(404,'FEED_NOT_FOUND','ไม่พบปฏิทิน');return(await tx.query('select id,title,due_at from notify.reminders where user_id=$1 and completed_at is null order by due_at limit 300',[feed.user_id])).rows;
  });c.header('Content-Type','text/calendar; charset=utf-8');return c.body(buildCalendar(rows));
});
app.delete('/api/v1/notification/calendar-feeds/:id',async c=>{
  const actor=getActor(c);await withUser(actor.id,tx=>tx.query('update notify.calendar_feeds set revoked_at=now() where id=$1 and user_id=$2',[uuid(c.req.param('id')),actor.id]));return ok(c,{revoked:true});
});
export default app;
