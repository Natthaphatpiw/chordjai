import {describe,it,expect,vi,afterEach} from 'vitest';
import {SignJWT} from 'jose';
import {signSession,verifySession} from './index.js';
describe('application session',()=>{
  const secret='testing-only-app-secret-at-least-32-characters';
  const user={id:'11111111-1111-4111-8111-111111111111',role:'owner' as const};
  afterEach(()=>vi.unstubAllEnvs());
  it('verifies only an issued audience-bound session',async()=>{
    vi.stubEnv('APP_JWT_SECRET',secret);
    const token=await signSession(user);
    await expect(verifySession(token)).resolves.toEqual(user);
    const wrong=await new SignJWT({role:'owner'}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setIssuer('https://www.chordjai.life').setAudience('different-service').setExpirationTime('1h').sign(new TextEncoder().encode(secret));
    await expect(verifySession(wrong)).rejects.toThrow();
    await expect(verifySession(token.slice(0,-3)+'abc')).rejects.toThrow();
  });
  it('rejects weak configuration instead of signing insecure tokens',async()=>{
    vi.stubEnv('APP_JWT_SECRET','short');
    await expect(signSession(user)).rejects.toThrow('at least 32');
  });
});
