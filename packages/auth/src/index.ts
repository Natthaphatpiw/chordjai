import { SignJWT, jwtVerify } from 'jose';

export type Actor = { id: string; role: 'owner' | 'admin' | 'vet'; sessionId?:string };
const issuer = () => process.env.APP_JWT_ISSUER ?? 'https://www.chordjai.life';
function signingKey() {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('APP_JWT_SECRET must contain at least 32 characters');
  return new TextEncoder().encode(secret);
}
export async function signSession(user: Actor): Promise<string> {
  return new SignJWT({ role: user.role,...(user.sessionId?{sid:user.sessionId}:{}) }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id).setIssuer(issuer()).setAudience('chordjai-services')
    .setIssuedAt().setExpirationTime('1h').sign(signingKey());
}
export async function verifySession(token: string): Promise<Actor> {
  const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], issuer: issuer(), audience: 'chordjai-services' });
  if (!payload.sub || !/^[0-9a-f-]{36}$/i.test(payload.sub) || !['owner', 'admin', 'vet'].includes(String(payload.role))) {
    throw new Error('Invalid session claims');
  }
  if(payload.sid!==undefined&&(typeof payload.sid!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sid)))throw new Error('Invalid session ID');
  return { id: payload.sub, role: payload.role as Actor['role'],...(payload.sid?{sessionId:payload.sid as string}:{}) };
}
export async function signPetidDraft(ownerId: string, petId: string, mediaIds: string[], signature: unknown): Promise<string> {
  return new SignJWT({ petId, mediaIds, signature }).setProtectedHeader({alg:'HS256',typ:'JWT'})
    .setSubject(ownerId).setIssuer(issuer()).setAudience('chordjai-petid-draft').setIssuedAt().setExpirationTime('15m').sign(signingKey());
}
export async function verifyPetidDraft(token: string, ownerId: string, petId: string, mediaIds: string[]): Promise<unknown | null> {
  try {
    const {payload} = await jwtVerify(token,signingKey(),{algorithms:['HS256'],issuer:issuer(),audience:'chordjai-petid-draft'});
    const signedIds=payload.mediaIds;
    if(payload.sub!==ownerId||payload.petId!==petId||!Array.isArray(signedIds)||signedIds.length!==mediaIds.length||!mediaIds.every((id,index)=>signedIds[index]===id))return null;
    return payload.signature ?? null;
  }catch{return null;}
}
