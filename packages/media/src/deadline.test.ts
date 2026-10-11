import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks=vi.hoisted(()=>({get:vi.fn(),query:vi.fn()}));
vi.mock('@vercel/blob',()=>({get:mocks.get}));
vi.mock('@chordjai/db',()=>({withUser:async(_id:string,callback:(db:{query:typeof mocks.query})=>unknown)=>callback({query:mocks.query}),withSystem:async(callback:(db:{query:typeof mocks.query})=>unknown)=>callback({query:mocks.query})}));
import {loadOwnedImage} from './index';
const user='00000000-0000-4000-8000-000000000001',image='00000000-0000-4000-8000-000000000002';
let timeout:AbortController;
beforeEach(()=>{
  timeout=new AbortController();
  vi.spyOn(AbortSignal,'timeout').mockReturnValue(timeout.signal);
  vi.stubEnv('BLOB_READ_WRITE_TOKEN','test-only-blob-token');
  vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Live network calls are forbidden in media deadline tests');}));
  mocks.get.mockReset();mocks.query.mockReset();
  mocks.query.mockResolvedValue({rows:[{id:image,user_id:user,pathname:`u/${user}/${image}.jpg`,mime:'image/jpeg',status:'ready'}]});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('private media download deadline',()=>{
  it('passes a fifteen-second abort signal and still decodes complete private image bytes',async()=>{
    const bytes=await sharp({create:{width:20,height:20,channels:3,background:'#ff8a24'}}).jpeg().toBuffer();
    mocks.get.mockResolvedValue({statusCode:200,stream:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(bytes));controller.close();}})});
    expect(await loadOwnedImage(user,image)).toMatch(/^data:image\/jpeg;base64,/);
    expect(AbortSignal.timeout).toHaveBeenCalledWith(15_000);
    expect(mocks.get.mock.calls[0][1].abortSignal).toBe(timeout.signal);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns a safe retryable error if the request times out before headers arrive',async()=>{
    mocks.get.mockImplementation((_path:string,options:{abortSignal:AbortSignal})=>new Promise((_resolve,reject)=>options.abortSignal.addEventListener('abort',()=>reject(options.abortSignal.reason),{once:true})));
    const pending=loadOwnedImage(user,image);
    const rejected=expect(pending).rejects.toMatchObject({status:503,code:'SERVICE_UNAVAILABLE'});
    await vi.waitFor(()=>expect(mocks.get).toHaveBeenCalledTimes(1));
    timeout.abort(new DOMException('Timed out','TimeoutError'));
    await rejected;expect(fetch).not.toHaveBeenCalled();
  });
  it('cancels a stalled response stream and releases its reader when the same deadline expires',async()=>{
    const cancel=vi.fn();
    const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array([255,216]));},cancel});
    mocks.get.mockResolvedValue({statusCode:200,stream});
    const pending=loadOwnedImage(user,image);
    const rejected=expect(pending).rejects.toMatchObject({status:503,code:'SERVICE_UNAVAILABLE'});
    await vi.waitFor(()=>expect(stream.locked).toBe(true));
    timeout.abort(new DOMException('Timed out','TimeoutError'));
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);expect(stream.locked).toBe(false);expect(fetch).not.toHaveBeenCalled();
  });
});
