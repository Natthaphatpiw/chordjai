import {createHmac} from 'node:crypto';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {verifyWebhookSignature,verifyLineIdToken,verifyLineFriendship,getMessagingAccessToken,lineMessagingReadiness,pushLine} from './index.js';
describe('LINE authenticity',()=>{
  const secret='unit-test-secret',body='{"events":[],"destination":"test"}';
  const sign=(value:string)=>createHmac('sha256',secret).update(value).digest('base64');
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
  it('checks raw bytes, rejecting altered body and truncated signatures',()=>{
    expect(verifyWebhookSignature(body,sign(body),secret)).toBe(true);
    expect(verifyWebhookSignature(body+' ',sign(body),secret)).toBe(false);
    expect(verifyWebhookSignature(body,sign(body).slice(0,12),secret)).toBe(false);
    expect(verifyWebhookSignature(body,undefined,secret)).toBe(false);
  });
  it('exchanges ID token server-side and rejects the wrong audience',async()=>{
    vi.stubEnv('LINE_LOGIN_CHANNEL_ID','2010549060');
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({sub:'Uverified',aud:'other',iss:'https://access.line.me',exp:Date.now()/1000+100}),{status:200,headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(verifyLineIdToken('untrusted-id-token')).rejects.toThrow('belongs to another channel');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.line.me/oauth2/v2.1/verify');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });
  it('refuses an expired ID token even when verify endpoint replies 200',async()=>{
    vi.stubEnv('LINE_LOGIN_CHANNEL_ID','2010549060');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({sub:'Uverified',aud:'2010549060',iss:'https://access.line.me',exp:1}),{status:200})));
    await expect(verifyLineIdToken('expired')).rejects.toThrow('expired');
  });
  it('reconciles friendship only for a verified access-token audience and matching profile',async()=>{
    vi.stubEnv('LINE_LOGIN_CHANNEL_ID','2010549060');
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({client_id:'2010549060',expires_in:120,scope:'profile'}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({userId:'Uverified'}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({friendFlag:true}),{status:200}));vi.stubGlobal('fetch',fetchMock);
    await expect(verifyLineFriendship('test-user-access-token','Uverified')).resolves.toBe(true);
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://api.line.me/friendship/v1/status');
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(fetchMock.mock.calls[2]?.[1]?.signal);
  });
  it('does not use friendship for a token from another login channel or LINE user',async()=>{
    vi.stubEnv('LINE_LOGIN_CHANNEL_ID','2010549060');
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({client_id:'other',expires_in:120}),{status:200}));vi.stubGlobal('fetch',fetchMock);
    await expect(verifyLineFriendship('test-wrong-channel','Uverified')).resolves.toBeNull();expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({client_id:'2010549060',expires_in:120}),{status:200})).mockResolvedValueOnce(new Response(JSON.stringify({userId:'Uother'}),{status:200}));
    await expect(verifyLineFriendship('test-wrong-user','Uverified')).resolves.toBeNull();expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
describe('LINE runtime token lifecycle, no live provider calls',()=>{
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
  const clear=()=>{for(const name of ['LINE_CHANNEL_ACCESS_TOKEN','LINE_MESSAGING_ACCESS_TOKEN','LINE_TOKEN_EXPIRES_AT','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET'])vi.stubEnv(name,'');};
  it('fails explicitly when missing config and never calls LINE',async()=>{
    clear();const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    await expect(getMessagingAccessToken()).rejects.toMatchObject({code:'LINE_NOT_CONFIGURED',status:503});
    expect(lineMessagingReadiness()).toEqual({ready:false,mode:'missing_credentials'});
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserves a configured static token and does not replace it after 401',async()=>{
    clear();vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN','test-static-token');vi.stubEnv('LINE_CHANNEL_ID','test-preserve');vi.stubEnv('LINE_CHANNEL_SECRET','test-secret');
    const fetchMock=vi.fn().mockResolvedValue(new Response('{}',{status:401}));vi.stubGlobal('fetch',fetchMock);
    await expect(getMessagingAccessToken()).resolves.toBe('test-static-token');
    await expect(pushLine('Utest',[{type:'text',text:'unit test, not sent'}],'11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({code:'LINE_API_ERROR',status:401});
    expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.line.me/v2/bot/message/push');
  });
  it('rejects an expired short-lived token without credentials before any send',async()=>{
    clear();vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN','test-expired-token');vi.stubEnv('LINE_TOKEN_EXPIRES_AT','1');const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    await expect(getMessagingAccessToken()).rejects.toMatchObject({code:'LINE_TOKEN_EXPIRED'});expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses one cached stateless token for concurrent requests without env mutation',async()=>{
    clear();vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN','test-expired');vi.stubEnv('LINE_TOKEN_EXPIRES_AT','1');vi.stubEnv('LINE_CHANNEL_ID','test-runtime-cache-channel');vi.stubEnv('LINE_CHANNEL_SECRET','test-runtime-cache-secret');
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({access_token:'test-new-stateless',expires_in:900,token_type:'Bearer'}),{status:200}));vi.stubGlobal('fetch',fetchMock);
    expect(await Promise.all([getMessagingAccessToken(),getMessagingAccessToken()])).toEqual(['test-new-stateless','test-new-stateless']);
    await expect(getMessagingAccessToken()).resolves.toBe('test-new-stateless');expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.line.me/oauth2/v3/token');
    expect(process.env.LINE_CHANNEL_ACCESS_TOKEN).toBe('test-expired');
  });
});
