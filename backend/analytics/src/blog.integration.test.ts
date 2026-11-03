import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {randomUUID,scryptSync} from 'node:crypto';
import sharp from 'sharp';
import pg from 'pg';
import {withSystem,closeDatabase} from '@chordjai/db';
import {type BlogDraft} from '@chordjai/contracts';
const blobs=vi.hoisted(()=>({data:new Map<string,Uint8Array>(),calls:0}));
vi.mock('@vercel/blob',()=>({
 put:vi.fn(async(pathname:string,data:Uint8Array)=>{blobs.data.set(pathname,new Uint8Array(data));return {pathname,url:'https://private-blob.example/'+pathname};}),
 get:vi.fn(async(pathname:string)=>{blobs.calls++;const bytes=blobs.data.get(pathname);return bytes?{statusCode:200,stream:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})}:null;}),
}));
import app from './app';
const url=process.env.TEST_DATABASE_URL,isolated=!!url&&['localhost','127.0.0.1','::1'].includes(new URL(url).hostname);
describe.skipIf(!isolated)('editorial blog with dashboard session and isolated PostgreSQL',()=>{
 const origin='http://localhost:3382',username='synthetic-blog-operator',password='Synthetic-blog-password-only!',suffix=randomUUID().slice(0,8),slug='synthetic-blog-'+suffix;
 const drafts: string[]=[],images:string[]=[];let cookie='',id='',version=0,imageId='';
 const draft:BlogDraft={title:'Synthetic pet care article',slug,language:'en',excerpt:'An example written only in an isolated local test.',category:'Care',tags:['care','tag-only-'+suffix],authorName:'Synthetic editor',seoTitle:'',seoDescription:'',coverImageId:null,coverAlt:'',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'A synthetic article with enough text to publish safely in a local test.'}]}]}};
 async function call(path:string,method='GET',body?:unknown,session=cookie,requestOrigin=origin){const response=await app.request('/api/v1/analytics'+path,{method,headers:{Origin:requestOrigin,...(session?{Cookie:session}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const type=response.headers.get('content-type');return {status:response.status,body:type?.includes('json')?await response.json():null,cookie:response.headers.get('set-cookie'),headers:response.headers,bytes:type?.startsWith('image/')?await response.arrayBuffer():null};}
 beforeAll(async()=>{process.env.DATABASE_URL=url;process.env.ADMIN_DASHBOARD_USERNAME=username;const salt='b'.repeat(32);process.env.ADMIN_DASHBOARD_PASSWORD_HASH=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;process.env.ADMIN_DASHBOARD_ORIGIN=origin;process.env.BLOB_READ_WRITE_TOKEN='synthetic-not-a-real-blob-token';const login=await call('/admin/login','POST',{username,password},'');expect(login.status).toBe(200);cookie=login.cookie!.split(';')[0]!;});
 afterAll(async()=>{const db=new pg.Client({connectionString:url});await db.connect();try{await db.query('delete from analytics.blog_posts where id=any($1::uuid[])',[drafts]);await db.query('delete from analytics.blog_images where id=any($1::uuid[])',[images]);await db.query('delete from ops.dashboard_sessions where username=$1',[username]);}finally{await db.end();}blobs.data.clear();await closeDatabase();});
 it('denies owner-role access to editorial drafts and image storage metadata',async()=>{
  const db=new pg.Client({connectionString:url});await db.connect();
  try{for(const table of ['analytics.blog_posts','analytics.blog_images']){await db.query('begin');await db.query('set local role chordjai_app');await expect(db.query('select * from '+table)).rejects.toMatchObject({code:'42501'});await db.query('rollback');}}finally{await db.end();}
 });
 it('requires the current dashboard session and exact Origin for every write',async()=>{
  expect((await call('/admin/blog','GET',undefined,'')).status).toBe(401);
  expect((await call('/admin/blog','POST',{draft},'')).status).toBe(401);
  expect((await call('/admin/blog','POST',{draft},cookie,'https://evil.example')).status).toBe(403);
 });
 it('allows multiple unnamed drafts without publishing or leaking content',async()=>{
  for(let i=0;i<2;i++){const response=await call('/admin/blog','POST',{draft:{...draft,title:'',slug:'',authorName:'',document:{type:'doc',content:[{type:'paragraph'}]}}});expect(response.status).toBe(201);drafts.push(response.body.data.id);}
  const created=await call('/admin/blog','POST',{draft});expect(created.status).toBe(201);id=created.body.data.id;version=created.body.data.version;drafts.push(id);expect(created.body.data.hasPublishedVersion).toBe(false);
  expect((await call('/blog/'+slug,'GET',undefined,'')).status).toBe(404);
  expect((await call('/blog?language=en&search='+suffix,'GET',undefined,'')).body.data.total).toBe(0);
  expect((await call('/blog/sitemap','GET',undefined,'')).body.data.items.some((item:{slug:string})=>item.slug===slug)).toBe(false);
 });
 it('rejects unsafe document nodes and invalid external image URLs',async()=>{
  for(const document of [{type:'doc',content:[{type:'html',text:'<script>bad()</script>'}]},{type:'doc',content:[{type:'image',attrs:{src:'https://evil.example/private.jpg',alt:'test'}}]}])expect((await call('/admin/blog/'+id,'PUT',{version,draft:{...draft,document}})).status).toBe(400);
  expect((await call('/admin/blog/'+drafts[0]+'/publish','POST',{version:1})).body.error.code).toBe('BLOG_PUBLISH_INCOMPLETE');
 });
 it('uploads only real accepted raster images and keeps unreferenced images private',async()=>{
  const bad=new FormData();bad.set('file',new File(['<svg/>'],'bad.png',{type:'image/png'}));const rejected=await app.request('/api/v1/analytics/admin/blog/images',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:bad});expect(rejected.status).toBe(400);
  const good=new FormData();good.set('file',new File([new Uint8Array(await sharp({create:{width:20,height:16,channels:3,background:'#ff8c42'}}).png().toBuffer())],'fixture.png',{type:'image/png'}));
  const response=await app.request('/api/v1/analytics/admin/blog/images',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:good});expect(response.status).toBe(201);const result=(await response.json()).data;imageId=result.id;images.push(imageId);expect(result.width).toBe(20);expect(result.publicUrl).toBe('/api/v1/analytics/blog/images/'+imageId);
  const before=blobs.calls;expect((await call('/blog/images/'+imageId,'GET',undefined,'')).status).toBe(404);expect(blobs.calls).toBe(before);
  const preview=await call('/admin/blog/images/'+imageId);expect(preview.status).toBe(200);expect(preview.headers.get('content-type')).toBe('image/webp');expect(preview.bytes!.byteLength).toBeGreaterThan(0);
  expect((await call('/admin/blog/images/'+imageId,'GET',undefined,'')).status).toBe(401);
 });
 it('validates referenced assets and image alt descriptions before publishing',async()=>{
  expect((await call('/admin/blog/'+id,'PUT',{version,draft:{...draft,coverImageId:randomUUID()}})).body.error.code).toBe('BLOG_IMAGE_NOT_READY');
  let saved=await call('/admin/blog/'+id,'PUT',{version,draft:{...draft,coverImageId:imageId}});expect(saved.status).toBe(200);version=saved.body.data.version;
  expect((await call('/admin/blog/'+id+'/publish','POST',{version})).body.error.code).toBe('BLOG_IMAGE_ALT_REQUIRED');
  saved=await call('/admin/blog/'+id,'PUT',{version,draft:{...draft,coverImageId:imageId,coverAlt:'An orange test fixture'}});expect(saved.status).toBe(200);version=saved.body.data.version;
 });
 it('publishes a snapshot, scoped summaries and sitemap with correct dates',async()=>{
  const result=await call('/admin/blog/'+id+'/publish','POST',{version});expect(result.status).toBe(200);version=result.body.data.version;expect(result.body.data.hasPublishedVersion).toBe(true);expect(result.body.data.publishedVersion).toBe(version);
  const publicResult=await call('/blog/'+slug,'GET',undefined,'');expect(publicResult.status).toBe(200);expect(publicResult.body.data.document).toEqual(draft.document);expect(publicResult.body.data.publishedAt).toBeTruthy();expect(publicResult.body.data.modifiedAt).toBeTruthy();expect(publicResult.headers.get('cache-control')).toContain('no-store');
  const list=await call('/blog?language=en&search='+suffix,'GET',undefined,'');expect(list.body.data.total).toBe(1);expect(list.body.data.items[0].document).toBeUndefined();expect((await call('/blog?language=en&search=tag-only-'+suffix,'GET',undefined,'')).body.data.total).toBe(1);expect((await call('/blog?language=th&search='+suffix,'GET',undefined,'')).body.data.total).toBe(0);
  expect((await call('/blog/sitemap','GET',undefined,'')).body.data.items.some((item:{slug:string})=>item.slug===slug)).toBe(true);
  expect((await call('/blog/images/'+imageId,'GET',undefined,'')).status).toBe(200);
 });
 it('preserves a live snapshot until publish and rejects stale versions or permalink changes',async()=>{
  const updated={...draft,title:'Synthetic revision remains a draft',coverImageId:imageId,coverAlt:'An orange fixture'};
  let result=await call('/admin/blog/'+id,'PUT',{version,draft:updated});expect(result.status).toBe(200);const old=version;version=result.body.data.version;
  expect((await call('/blog/'+slug,'GET',undefined,'')).body.data.title).toBe(draft.title);
  expect((await call('/admin/blog/'+id,'PUT',{version:old,draft})).status).toBe(409);
  expect((await call('/admin/blog/'+id+'/publish','POST',{version:old})).status).toBe(409);
  expect((await call('/admin/blog/'+id,'PUT',{version,draft:{...updated,slug:slug+'-new'}})).body.error.code).toBe('BLOG_PERMALINK_LOCKED');
  expect((await call('/admin/blog/'+id,'PUT',{version,draft:{...updated,language:'th'}})).body.error.code).toBe('BLOG_PERMALINK_LOCKED');
  result=await call('/admin/blog/'+id+'/publish','POST',{version});expect(result.status).toBe(200);version=result.body.data.version;expect((await call('/blog/'+slug,'GET',undefined,'')).body.data.title).toBe(updated.title);
 });
 it('unpublishes articles and images immediately, archive/restore never republishes implicitly',async()=>{
  let result=await call('/admin/blog/'+id+'/unpublish','POST',{version});expect(result.status).toBe(200);version=result.body.data.version;
  expect((await call('/blog/'+slug,'GET',undefined,'')).status).toBe(404);expect((await call('/blog/images/'+imageId,'GET',undefined,'')).status).toBe(404);
  expect((await call('/blog/sitemap','GET',undefined,'')).body.data.items.some((item:{slug:string})=>item.slug===slug)).toBe(false);
  result=await call('/admin/blog/'+id+'/publish','POST',{version});expect(result.status).toBe(200);version=result.body.data.version;
  result=await call('/admin/blog/'+id,'DELETE',{version});expect(result.status).toBe(200);version=result.body.data.version;expect(result.body.data.archivedAt).toBeTruthy();expect((await call('/blog/'+slug,'GET',undefined,'')).status).toBe(404);
  expect((await call('/admin/blog?status=archived&search='+suffix)).body.data.items.some((item:{id:string})=>item.id===id)).toBe(true);
  expect((await call('/admin/blog/'+id+'/publish','POST',{version})).body.error.code).toBe('BLOG_ARCHIVED');
  result=await call('/admin/blog/'+id+'/restore','POST',{version});expect(result.status).toBe(200);version=result.body.data.version;expect(result.body.data.hasPublishedVersion).toBe(false);expect(result.body.data.archivedAt).toBeNull();expect((await call('/blog/'+slug,'GET',undefined,'')).status).toBe(404);
 });
 it('allows inline image references but rejects text-only mentions as public grants',async()=>{
  const inlineDraft={...draft,slug:slug+'-inline',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'An inline image article that is long enough for publication.'}]},{type:'image',attrs:{src:'/api/v1/analytics/blog/images/'+imageId,alt:'Inline fixture',width:70}}]}};
  const created=await call('/admin/blog','POST',{draft:inlineDraft});expect(created.status).toBe(201);const inlineId=created.body.data.id;drafts.push(inlineId);
  expect((await call('/admin/blog/'+inlineId+'/publish','POST',{version:1})).status).toBe(200);expect((await call('/blog/images/'+imageId,'GET',undefined,'')).status).toBe(200);
  const archived=await call('/admin/blog/'+inlineId,'DELETE',{version:2});expect(archived.status).toBe(200);
  const textDraft={...draft,slug:slug+'-mention',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'A prose-only mention must not expose a private image: /api/v1/analytics/blog/images/'+imageId}]}]}};
  const textCreated=await call('/admin/blog','POST',{draft:textDraft});expect(textCreated.status).toBe(201);drafts.push(textCreated.body.data.id);expect((await call('/admin/blog/'+textCreated.body.data.id+'/publish','POST',{version:1})).status).toBe(200);expect((await call('/blog/images/'+imageId,'GET',undefined,'')).status).toBe(404);
 });
 it('checks duplicate slugs, bounded pagination and logged-out sessions',async()=>{
  expect((await call('/admin/blog','POST',{draft})).status).toBe(409);
  expect((await call('/blog?page=-1','GET',undefined,'')).status).toBe(400);
  expect((await call('/blog?language=xx','GET',undefined,'')).status).toBe(400);
  expect((await call('/admin/logout','POST',{})).status).toBe(200);
  expect((await call('/admin/blog')).status).toBe(401);
 });
});
