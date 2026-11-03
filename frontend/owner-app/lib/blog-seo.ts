import type { BlogDocument, BlogNode, BlogPublicPost } from '@chordjai/contracts';
export const BLOG_ORIGIN='https://www.chordjai.life';
export function blogArticleUrl(slug:string){return `${BLOG_ORIGIN}/blog/${encodeURIComponent(slug)}`;}
export function blogCoverUrl(id:string|null){return id?`${BLOG_ORIGIN}/api/v1/analytics/blog/images/${id}`:undefined;}
export function blogJsonLd(post:BlogPublicPost){
  const image=blogCoverUrl(post.coverImageId);
  return {'@context':'https://schema.org','@type':'BlogPosting',headline:post.title,description:post.seoDescription||post.excerpt,
    ...(image?{image:[image]}:{}),datePublished:post.publishedAt,dateModified:post.modifiedAt,inLanguage:post.language,
    author:{'@type':'Person',name:post.authorName},publisher:{'@type':'Organization',name:'ChordJai',url:BLOG_ORIGIN,logo:{'@type':'ImageObject',url:`${BLOG_ORIGIN}/brand/chordjai-logo.png`}},
    mainEntityOfPage:{'@type':'WebPage','@id':blogArticleUrl(post.slug)},url:blogArticleUrl(post.slug),articleSection:post.category,keywords:post.tags.join(', ')};
}
export function escapeJsonLd(value:unknown){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
export function blogHeadings(document:BlogDocument){
  const headings:{id:string;text:string;level:number}[]=[];
  const text=(node:BlogNode):string=>node.type==='text'?node.text??'':(node.content??[]).map(text).join('');
  const visit=(nodes:BlogNode[])=>{for(const node of nodes){if(node.type==='heading')headings.push({id:`blog-heading-${headings.length}`,text:text(node),level:Number(node.attrs?.level??2)});if(node.content)visit(node.content);}};
  visit(document.content);return headings;
}
export function blogIndexOptions(raw:Record<string,string|string[]|undefined>){
  const single=(key:string)=>typeof raw[key]==='string'?raw[key] as string:'';
  const rawPage=Number(single('page')||1);
  return {language:single('lang')==='en'?'en' as const:'th' as const,search:single('q').trim().slice(0,120),category:single('category').trim().slice(0,60),page:Number.isSafeInteger(rawPage)&&rawPage>=1&&rawPage<=2001?rawPage-1:0};
}
export function blogIndexHref({language,search='',category='',page=0}:{language:'th'|'en';search?:string;category?:string;page?:number}){
  const params=new URLSearchParams();if(language==='en')params.set('lang','en');if(search)params.set('q',search);if(category)params.set('category',category);if(page)params.set('page',String(page+1));
  return '/blog'+(params.size?'?'+params:'');
}
