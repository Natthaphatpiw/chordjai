import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const sdk=vi.hoisted(()=>({init:vi.fn(),isInClient:vi.fn(),isLoggedIn:vi.fn(),login:vi.fn(),getIDToken:vi.fn(),getAccessToken:vi.fn()}));
vi.mock('@line/liff',()=>({default:sdk}));
function memoryStorage():Storage{const data=new Map<string,string>();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,String(value));},removeItem:key=>{data.delete(key);},clear:()=>data.clear(),key:index=>[...data.keys()][index]??null,get length(){return data.size;}};}
let session:Storage,local:Storage,fetchMock:ReturnType<typeof vi.fn>;
const restored=()=>new Response(JSON.stringify({data:{token:'restored-token',persistent:true,bootstrap:{pets:[{id:'fixture-pet'}],consents:[]}}}),{status:200});
beforeEach(()=>{vi.resetModules();session=memoryStorage();local=memoryStorage();for(const mock of Object.values(sdk))mock.mockReset();vi.stubGlobal('window',{location:{href:'https://www.chordjai.life/app'},sessionStorage:session,localStorage:local});vi.stubGlobal('sessionStorage',session);vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0'});vi.stubGlobal('document',{cookie:'',documentElement:{lang:'en'}});fetchMock=vi.fn().mockImplementation(restored);vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('returning owner session',()=>{
 it('restores in one request with bootstrap, without loading LINE or local private data',async()=>{
  local.setItem('chordjai.owner-session.v1','1');const{restoreAppSession,takeOwnerBootstrap}=await import('../frontend/shared/api');
  expect(await restoreAppSession()).toBe(true);expect(session.getItem('chordjai.session')).toBe('restored-token');
  expect(takeOwnerBootstrap()).toEqual({pets:[{id:'fixture-pet'}],consents:[]});expect(takeOwnerBootstrap()).toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();expect(fetchMock.mock.calls[0][1]).toMatchObject({credentials:'same-origin',cache:'no-store'});expect(sdk.init).not.toHaveBeenCalled();expect(local.length).toBe(1);
 });
 it('coalesces concurrent restore attempts',async()=>{
  local.setItem('chordjai.owner-session.v1','1');const{restoreAppSession}=await import('../frontend/shared/api');expect(await Promise.all([restoreAppSession(),restoreAppSession(),restoreAppSession()])).toEqual([true,true,true]);expect(fetchMock).toHaveBeenCalledOnce();
 });
 it('does no restore or SDK work for a first ordinary browser visit',async()=>{
  const{restoreAppSession,autoLineLogin}=await import('../frontend/shared/api');expect(await restoreAppSession()).toBe(false);expect(await autoLineLogin('fixture-liff')).toBe(false);expect(fetchMock).not.toHaveBeenCalled();expect(sdk.init).not.toHaveBeenCalled();
 });
 it('clears only the expired-session hint after a rejected cookie',async()=>{
  local.setItem('chordjai.owner-session.v1','1');fetchMock.mockResolvedValue(new Response('{}',{status:401}));const{restoreAppSession}=await import('../frontend/shared/api');expect(await restoreAppSession()).toBe(false);expect(local.getItem('chordjai.owner-session.v1')).toBeNull();expect(session.getItem('chordjai.session')).toBeNull();
 });
 it('retains the hint on transient errors so a retry need not reauthenticate LINE',async()=>{
  local.setItem('chordjai.owner-session.v1','1');fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'TEMPORARY'}}),{status:503}));const{restoreAppSession}=await import('../frontend/shared/api');await expect(restoreAppSession()).rejects.toMatchObject({status:503});expect(local.getItem('chordjai.owner-session.v1')).toBe('1');expect(await restoreAppSession()).toBe(true);expect(sdk.init).not.toHaveBeenCalled();
 });
 it('discards a restore response arriving after logout',async()=>{
  local.setItem('chordjai.owner-session.v1','1');let release!:(response:Response)=>void;fetchMock.mockImplementationOnce(()=>new Promise<Response>(resolve=>{release=resolve;}));const{restoreAppSession,endAppSession,takeOwnerBootstrap}=await import('../frontend/shared/api');const pending=restoreAppSession(),rejected=expect(pending).rejects.toMatchObject({code:'SESSION_ENDED'});await endAppSession();release(restored());await rejected;expect(session.getItem('chordjai.session')).toBeNull();expect(takeOwnerBootstrap()).toBeNull();expect(await restoreAppSession()).toBe(false);expect(local.getItem('chordjai.explicit-signout.v1')).toBe('1');
 });
 it('bounds SDK initialization instead of showing an indefinite spinner',async()=>{
  vi.useFakeTimers();sdk.init.mockImplementation(()=>new Promise(()=>{}));const{initializedLiff}=await import('../frontend/shared/liff-session');const pending=initializedLiff('fixture-liff'),rejected=expect(pending).rejects.toMatchObject({code:'LIFF_INIT_TIMEOUT'});await vi.advanceTimersByTimeAsync(12_001);await rejected;
 });
});
