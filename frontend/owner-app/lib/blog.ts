import 'server-only';
import { cache } from 'react';
import type { BlogPublicPost, BlogSummary } from '@chordjai/contracts';

const apiOrigin = process.env.API_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://api.chordjai.life' : 'http://localhost:8787');
export type BlogListing = {items:BlogSummary[];total:number;page:number;pageSize:number};
export type BlogSitemapItem = {slug:string;language:'th'|'en';modifiedAt:string};
async function request<T>(path:string, allowNotFound=false):Promise<T|null> {
  let response:Response;
  try { response=await fetch(`${apiOrigin}/api/v1/analytics/blog${path}`, {cache:'no-store',signal:AbortSignal.timeout(12_000)}); }
  catch { throw new Error('BLOG_SERVICE_UNAVAILABLE'); }
  if(allowNotFound&&response.status===404)return null;
  if(!response.ok)throw new Error('BLOG_SERVICE_UNAVAILABLE');
  const body=await response.json() as {data?:T};
  if(body.data===undefined)throw new Error('BLOG_RESPONSE_INVALID');
  return body.data;
}
export async function listPublishedPosts(params:{language:'th'|'en';search?:string;category?:string;page?:number}):Promise<BlogListing> {
  const query=new URLSearchParams({language:params.language,page:String(params.page??0)});
  if(params.search)query.set('search',params.search);
  if(params.category)query.set('category',params.category);
  return (await request<BlogListing>('?'+query))!;
}
// Request-scoped memoization shares metadata/page reads, without persisting drafts or stale publications.
export const getPublishedPost=cache(async (slug:string):Promise<BlogPublicPost|null>=> {
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>120)return null;
  return request<BlogPublicPost>('/'+encodeURIComponent(slug),true);
});
export async function blogSitemapItems():Promise<BlogSitemapItem[]> {
  return (await request<{items:BlogSitemapItem[]}>('/sitemap'))!.items;
}
