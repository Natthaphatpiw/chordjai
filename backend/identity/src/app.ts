import { z } from 'zod';
import { withSystem, withUser } from '@chordjai/db';
import { signSession, type Actor } from '@chordjai/auth';
import { verifyLineIdToken,verifyLineFriendship } from '@chordjai/line';
import { createService, getActor, HttpError, jsonBody, ok, camel } from '@chordjai/service-kit';

export const app = createService('identity');
app.post('/api/v1/identity/line', async c => {
  const body = await jsonBody(c, z.object({ idToken: z.string().min(1).max(10000),accessToken:z.string().min(1).max(10000).optional() }));
  let profile: Awaited<ReturnType<typeof verifyLineIdToken>>;
  try { profile = await verifyLineIdToken(body.idToken); }
  catch(error) { if(error instanceof HttpError)throw error;throw new HttpError(401, 'LINE_LOGIN_FAILED', 'ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่'); }
  const friendshipCheckedAt=new Date();
  const friendship=body.accessToken?await verifyLineFriendship(body.accessToken,profile.lineUserId):null;
  const user = await withSystem(async tx => {
    const { rows } = await tx.query(`insert into identity.users(line_user_id,display_name,avatar_url) values($1,$2,$3)
      on conflict(line_user_id) do update set display_name=excluded.display_name,avatar_url=excluded.avatar_url,updated_at=now() returning id,display_name,avatar_url,role,status`, [profile.lineUserId, profile.displayName.slice(0,120), profile.pictureUrl]);
    const signedUser=rows[0]!;
    if(signedUser.status==='active'&&friendship!==null)await tx.query(`insert into notify.line_accounts(user_id,followed) values($1,$2)
      on conflict(user_id) do update set followed=excluded.followed,updated_at=now()
      where notify.line_accounts.updated_at<=$3`,[signedUser.id,friendship,friendshipCheckedAt]);
    return signedUser;
  });
  if (user.status !== 'active') throw new HttpError(403, 'ACCOUNT_INACTIVE', 'บัญชีนี้ยังไม่พร้อมใช้งาน');
  return ok(c, { token: await signSession({ id: user.id, role: user.role } as Actor), expiresIn: 3600, user: camel(user) });
});
app.get('/api/v1/identity/me', async c => {
  const actor = getActor(c);
  const user = await withUser(actor.id, async tx => (await tx.query(`select id,display_name,avatar_url,role,district,status,created_at from identity.users where id=$1`, [actor.id])).rows[0]);
  if (!user || user.status !== 'active') throw new HttpError(401, 'ACCOUNT_INACTIVE', 'กรุณาเข้าสู่ระบบอีกครั้ง');
  return ok(c, camel(user));
});
app.patch('/api/v1/identity/me', async c => {
  const actor = getActor(c);
  const body = await jsonBody(c, z.object({ displayName: z.string().trim().min(1).max(120), district: z.string().max(120).nullable().default(null) }));
  const result = await withUser(actor.id, tx => tx.query(`update identity.users set display_name=$2,district=$3,updated_at=now() where id=$1 returning id,display_name,avatar_url,role,district`, [actor.id,body.displayName,body.district]));
  return ok(c, camel(result.rows[0]));
});
const consentSchema = z.object({ purpose: z.enum(['service','ai_improvement','location_alerts','marketing','ai_memory']), granted: z.boolean(), version: z.string().min(1).max(80).default('2026-10-10') });
app.get('/api/v1/identity/consents', async c => {
  const actor = getActor(c);
  return ok(c, camel(await withUser(actor.id, async tx => (await tx.query(`select purpose,granted,version,updated_at from identity.consents where user_id=$1`, [actor.id])).rows)));
});
app.post('/api/v1/identity/consents', async c => {
  const actor = getActor(c), body = await jsonBody(c, consentSchema);
  await withUser(actor.id, async tx => {
    await tx.query(`insert into identity.consents(user_id,purpose,granted,version) values($1,$2,$3,$4)
      on conflict(user_id,purpose) do update set granted=excluded.granted,version=excluded.version,updated_at=now()`, [actor.id,body.purpose,body.granted,body.version]);
    if (body.purpose === 'ai_memory' && !body.granted) await tx.query(`update assistant.preferences set memory_enabled=false,updated_at=now() where user_id=$1`, [actor.id]);
  });
  return ok(c, body);
});
app.get('/api/v1/identity/export', async c => {
  const actor = getActor(c);
  const exported = await withUser(actor.id, async tx => {
    // Fixed queries, scoped to the requester; access grants do not expose another
    // owner's data in a personal privacy export.
    const profile = (await tx.query(`select id,display_name,avatar_url,district,created_at from identity.users where id=$1`,[actor.id])).rows[0];
    const pets = (await tx.query(`select * from pet.pets where owner_id=$1`,[actor.id])).rows;
    const consents = (await tx.query(`select purpose,granted,version,created_at from identity.consent_history where user_id=$1`,[actor.id])).rows;
    const health = (await tx.query(`select * from health.records where created_by=$1 or pet_id in (select id from pet.pets where owner_id=$1)`,[actor.id])).rows;
    const journal = (await tx.query(`select *,story_date::text as story_date from journal.pages where owner_id=$1`,[actor.id])).rows;
    const memoryBooks = (await tx.query('select * from journal.books where owner_id=$1',[actor.id])).rows;
    const memories = (await tx.query(`select * from assistant.memories where user_id=$1`,[actor.id])).rows;
    const conversations = (await tx.query(`select * from assistant.conversations where user_id=$1`,[actor.id])).rows;
    const messages = (await tx.query(`select m.* from assistant.messages m join assistant.conversations cv on cv.id=m.conversation_id where cv.user_id=$1`,[actor.id])).rows;
    const triage = (await tx.query(`select * from triage.sessions where user_id=$1`,[actor.id])).rows;
    const preferences = (await tx.query('select * from assistant.preferences where user_id=$1',[actor.id])).rows;
    const media = (await tx.query('select id,pet_id,mime,size,purpose,status,created_at from media.objects where user_id=$1',[actor.id])).rows;
    const inbox = (await tx.query('select * from notify.inbox where user_id=$1',[actor.id])).rows;
    const reminders = (await tx.query('select * from notify.reminders where user_id=$1',[actor.id])).rows;
    const appointments = (await tx.query('select * from clinic.appointments where user_id=$1',[actor.id])).rows;
    const lostCases = (await tx.query('select * from lostfound.cases where owner_id=$1',[actor.id])).rows;
    const petid = (await tx.query('select id,pet_id,description,signature,search_mode,status,created_at from biometric.enrollments where user_id=$1',[actor.id])).rows;
    const petidPhotos = (await tx.query('select ep.* from biometric.enrollment_photos ep join biometric.enrollments e on e.id=ep.enrollment_id where e.user_id=$1',[actor.id])).rows;
    const shares = (await tx.query('select id,pet_id,expires_at,revoked_at,created_at from share.links where owner_id=$1',[actor.id])).rows;
    const careEntries=(await tx.query('select e.* from health.care_entries e where e.created_by=$1 or e.pet_id in(select id from pet.pets where owner_id=$1)',[actor.id])).rows;
    const careEpisodes=(await tx.query('select e.* from health.care_episodes e where e.created_by=$1 or e.pet_id in(select id from pet.pets where owner_id=$1)',[actor.id])).rows;
    const careReflections=(await tx.query('select * from health.care_reflections where author_id=$1',[actor.id])).rows;
    const careCosts=(await tx.query('select c.* from health.care_costs c join health.care_entries e on e.id=c.entry_id where e.created_by=$1 or e.pet_id in(select id from pet.pets where owner_id=$1)',[actor.id])).rows;
    const careMedia=(await tx.query('select m.* from health.care_media m join health.care_entries e on e.id=m.entry_id where e.created_by=$1 or e.pet_id in(select id from pet.pets where owner_id=$1)',[actor.id])).rows;
    const petidCaptureSessions=(await tx.query('select * from biometric.capture_sessions where owner_id=$1',[actor.id])).rows;
    const petidCaptureSamples=(await tx.query('select p.* from biometric.capture_samples p join biometric.capture_sessions s on s.id=p.session_id where s.owner_id=$1',[actor.id])).rows;
    const petidTrainingConsents=(await tx.query('select * from biometric.training_consents where owner_id=$1',[actor.id])).rows;
    const petidTrainingConsentHistory=(await tx.query('select * from biometric.training_consent_events where owner_id=$1',[actor.id])).rows;
    const petidImageChecks=(await tx.query('select * from biometric.capture_checks where owner_id=$1',[actor.id])).rows;
    const petidImageQuality=(await tx.query('select q.* from biometric.capture_check_samples q join biometric.capture_checks c on c.id=q.check_id where c.owner_id=$1',[actor.id])).rows;
    const petidIndependentReviews=(await tx.query('select r.id,r.session_id,r.check_id,r.decision,r.evidence_kind,r.consent_version,r.revision,r.created_at from biometric.capture_reviews r join biometric.capture_sessions s on s.id=r.session_id where s.owner_id=$1',[actor.id])).rows;
    const petidDatasetParticipation=(await tx.query('select export_id,sample_id,session_id,check_id,review_id,consent_version,export_created_at from biometric.dataset_export_samples where owner_id=$1',[actor.id])).rows;
    const followupPreferences=(await tx.query('select * from notify.followup_preferences where user_id=$1',[actor.id])).rows;
    const followupConsentHistory=(await tx.query('select * from notify.followup_consent_events where user_id=$1',[actor.id])).rows;
    const followupHistory=(await tx.query('select id,status,message,reason_code,selected_pet_id,accepted_at,opened_at,created_at from notify.followup_deliveries where user_id=$1',[actor.id])).rows;
    const followupReplies=(await tx.query('select id,delivery_id,pet_id,content,source,correlation,created_at from notify.followup_replies where user_id=$1',[actor.id])).rows;
    return { exportedAt: new Date().toISOString(), profile, pets, consents, health, journal, memoryBooks, memories, preferences, conversations, messages, triage, media, inbox, reminders, appointments, lostCases, petid, petidPhotos, shares,careEntries,careEpisodes,careReflections,careCosts,careMedia,petidCaptureSessions,petidCaptureSamples,petidTrainingConsents,petidTrainingConsentHistory,petidImageChecks,petidImageQuality,petidIndependentReviews,petidDatasetParticipation,followupPreferences,followupConsentHistory,followupHistory,followupReplies };
  });
  c.header('Content-Disposition', 'attachment; filename="chordjai-personal-data.json"');
  return ok(c, camel(exported));
});
app.delete('/api/v1/identity/me', async c => {
  const actor = getActor(c), body = await jsonBody(c, z.object({ idToken: z.string().min(1), confirm: z.literal('DELETE') }));
  let profile: Awaited<ReturnType<typeof verifyLineIdToken>>;
  try { profile = await verifyLineIdToken(body.idToken); } catch(error) { if(error instanceof HttpError)throw error;throw new HttpError(401,'REAUTH_REQUIRED','กรุณายืนยันตัวตน LINE อีกครั้ง'); }
  await withSystem(async tx => {
    const { rows } = await tx.query('select line_user_id from identity.users where id=$1',[actor.id]);
    if (rows[0]?.line_user_id !== profile.lineUserId) throw new HttpError(401,'REAUTH_REQUIRED','LINE ต้องเป็นบัญชีเดียวกัน');
    await tx.query('delete from identity.users where id=$1',[actor.id]);
  });
  return ok(c, { deleted: true });
});
export default app;
