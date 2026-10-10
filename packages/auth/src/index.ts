import { SignJWT, jwtVerify } from 'jose';

export type Actor = { id: string; role: 'owner' | 'admin' | 'vet' };
const issuer = () => process.env.APP_JWT_ISSUER ?? 'https://www.chordjai.life';
function signingKey() {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('APP_JWT_SECRET must contain at least 32 characters');
  return new TextEncoder().encode(secret);
}
export async function signSession(user: Actor): Promise<string> {
  return new SignJWT({ role: user.role }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id).setIssuer(issuer()).setAudience('chordjai-services')
    .setIssuedAt().setExpirationTime('1h').sign(signingKey());
}
export async function verifySession(token: string): Promise<Actor> {
  const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], issuer: issuer(), audience: 'chordjai-services' });
  if (!payload.sub || !/^[0-9a-f-]{36}$/i.test(payload.sub) || !['owner', 'admin', 'vet'].includes(String(payload.role))) {
    throw new Error('Invalid session claims');
  }
  return { id: payload.sub, role: payload.role as Actor['role'] };
}
