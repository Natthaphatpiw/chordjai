import { readFile,writeFile,chmod,mkdir } from 'node:fs/promises';
const applyLiff=process.argv.includes('--apply-liff');
const applyWebhook=process.argv.includes('--apply-webhook');
const envPath=new URL('../backend/.env.local',import.meta.url);
const liffApps=JSON.parse(await readFile(new URL('../config/line-apps.json',import.meta.url),'utf8'));
const results={checkedAt:new Date().toISOString(),liffId:process.env.LIFF_ID,liffEndpoint:process.env.LIFF_ENDPOINT,webhookEndpoint:process.env.LINE_WEBHOOK_URL};
async function store(name,value){
  let content=await readFile(envPath,'utf8');const line=`${name}=${value}`;
  content=new RegExp(`^${name}=.*$`,'m').test(content)?content.replace(new RegExp(`^${name}=.*$`,'m'),line):`${content}\n${line}\n`;
  await writeFile(envPath,content,{mode:0o600});await chmod(envPath,0o600);process.env[name]=value;
}
async function token(prefix){
  const existing=process.env[`${prefix}_CHANNEL_ACCESS_TOKEN`],expiresAt=Number(process.env[`${prefix}_TOKEN_EXPIRES_AT`]);if(existing&&(!expiresAt||expiresAt>Date.now()+60000))return existing;
  const id=process.env[`${prefix}_CHANNEL_ID`],secret=process.env[`${prefix}_CHANNEL_SECRET`];if(!id||!secret)throw new Error('credentials_missing');
  const response=await fetch('https://api.line.me/v2/oauth/accessToken',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:id,client_secret:secret}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`token_rejected_http_${response.status}`);
  const payload=await response.json();if(typeof payload.access_token!=='string')throw new Error('token_response_invalid');
  await store(`${prefix}_CHANNEL_ACCESS_TOKEN`,payload.access_token);
  await store(`${prefix}_TOKEN_EXPIRES_AT`,String(Date.now()+payload.expires_in*1000));return payload.access_token;
}
async function line(path,auth,method='GET',body){
  const response=await fetch(`https://api.line.me${path}`,{method,headers:{Authorization:`Bearer ${auth}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`line_rejected_http_${response.status}`);const bodyText=await response.text();return bodyText?JSON.parse(bodyText):{};
}
try{
  const auth=await token('LINE_LOGIN'),inventory=await line('/liff/v1/apps',auth);
  results.liffApps=[];
  for(const configured of liffApps){
    const selected=inventory.apps?.find(app=>app.liffId===configured.liffId);if(!selected){results.liffApps.push({...configured,status:'not_in_channel'});continue;}
    if(applyLiff)await line(`/liff/v1/apps/${encodeURIComponent(configured.liffId)}`,auth,'PUT',{view:{type:'full',url:configured.endpoint},scope:['openid','profile'],botPrompt:'normal'});
    const updated=(await line('/liff/v1/apps',auth)).apps?.find(app=>app.liffId===configured.liffId);
    results.liffApps.push({...configured,status:updated?.view?.url===configured.endpoint?'configured':'requires_update',actualEndpoint:updated?.view?.url});
  }
  results.liff=results.liffApps.find(app=>app.purpose==='owner');
}catch(error){results.liff={status:'requires_manual_setup',reason:error.message};}
try{
  const auth=await token('LINE'),config=await line('/v2/bot/channel/webhook/endpoint',auth);
  results.messaging={status:'verified',currentEndpoint:config.endpoint,active:config.active};
  if(applyWebhook){
    // Only replace the live webhook after the deployed route accepts a LINE-signed
    // verification request; prevent routing current OA events into an unavailable app.
    const {createHmac}=await import('node:crypto');const raw=JSON.stringify({destination:'setup',events:[]});
    const check=await fetch(process.env.LINE_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','x-line-signature':createHmac('sha256',process.env.LINE_CHANNEL_SECRET).update(raw).digest('base64')},body:raw,signal:AbortSignal.timeout(15000)});
    if(!check.ok)throw new Error(`deployed_webhook_not_ready_http_${check.status}`);
    await line('/v2/bot/channel/webhook/endpoint',auth,'PUT',{endpoint:process.env.LINE_WEBHOOK_URL});
    results.messaging={status:'updated',endpoint:process.env.LINE_WEBHOOK_URL};
  }
}catch(error){results.messaging={status:'requires_manual_setup',reason:error.message};}
await mkdir(new URL('../docs/',import.meta.url),{recursive:true});
await writeFile(new URL('../docs/LINE_SETUP_STATUS.json',import.meta.url),`${JSON.stringify(results,null,2)}\n`);
console.log(JSON.stringify(results,null,2)); // safe metadata only; never provider tokens/errors/bodies
