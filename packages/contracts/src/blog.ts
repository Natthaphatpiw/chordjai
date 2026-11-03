import { z } from 'zod';

export type BlogMark = {type:'bold'|'italic'|'underline'|'strike'|'code'|'link';attrs?:Record<string,unknown>};
export type BlogNode = {type:'paragraph'|'heading'|'text'|'bulletList'|'orderedList'|'listItem'|'blockquote'|'horizontalRule'|'hardBreak'|'codeBlock'|'image'|'table'|'tableRow'|'tableCell'|'tableHeader';attrs?:Record<string,unknown>;text?:string;marks?:BlogMark[];content?:BlogNode[]};
export type BlogDocument = {type:'doc';content:BlogNode[]};
const imagePath=/^\/api\/v1\/analytics\/blog\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export function blogImageId(src:unknown):string|null{return typeof src==='string'?imagePath.exec(src)?.[1]??null:null;}
export function safeBlogLink(href:unknown):href is string{
 if(typeof href!=='string'||href.length>2000||/[\u0000-\u0020\u007f\\]/.test(href))return false;
 if(/^\/(?!\/)/.test(href))return true;
 try{const url=new URL(href);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const only=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
const alignment=(v:unknown)=>v==null||['left','center','right','justify'].includes(String(v));
const blockTypes=['paragraph','heading','bulletList','orderedList','blockquote','horizontalRule','codeBlock','image','table'];
/** An allowlist, not stored HTML. Iterative traversal bounds untrusted nesting before rendering. */
export function validBlogDocument(input:unknown):input is BlogDocument{
 if(!record(input)||input.type!=='doc'||!only(input,['type','content'])||!Array.isArray(input.content)||input.content.length>400)return false;
 const stack:{node:unknown;parent:string;depth:number}[]=input.content.map(node=>({node,parent:'doc',depth:1}));
 let count=0,characters=0;
 while(stack.length){
  const {node,parent,depth}=stack.pop()!;
  if(++count>2500||depth>12||!record(node)||!only(node,['type','attrs','text','marks','content'])||typeof node.type!=='string')return false;
  const type=node.type,attrs=node.attrs??{};
  if(!record(attrs))return false;
  const allowed=parent==='paragraph'||parent==='heading'?['text','hardBreak']:parent==='codeBlock'?['text']:parent==='bulletList'||parent==='orderedList'?['listItem']:parent==='table'?['tableRow']:parent==='tableRow'?['tableCell','tableHeader']:blockTypes;
  if(!allowed.includes(type)||(['tableCell','tableHeader'].includes(parent)&&type==='table'))return false;
  if(node.text!==undefined&&type!=='text'||node.marks!==undefined&&type!=='text')return false;
  if(type==='text'){
   if(!only(attrs,[])||typeof node.text!=='string'||!node.text.length||node.content!==undefined)return false;
   characters+=node.text.length;if(characters>100000)return false;
   if(node.marks!==undefined){
    if(!Array.isArray(node.marks)||node.marks.length>6)return false;
    const seen=new Set<string>();
    for(const mark of node.marks){
     if(!record(mark)||!only(mark,['type','attrs'])||typeof mark.type!=='string'||seen.has(mark.type))return false;seen.add(mark.type);
     const ma=mark.attrs??{};if(!record(ma))return false;
     if(mark.type==='link'){
      if(!only(ma,['href','target','rel','class','title'])||!safeBlogLink(ma.href)||ma.target!=null&&!['_blank','_self'].includes(String(ma.target))||ma.title!=null&&(typeof ma.title!=='string'||ma.title.length>200))return false;
      if(ma.rel!=null&&typeof ma.rel!=='string'||ma.class!=null&&typeof ma.class!=='string')return false;
     }else if(!['bold','italic','underline','strike','code'].includes(mark.type)||!only(ma,[]))return false;
    }
   }continue;
  }
  if(type==='paragraph'||type==='heading'){
   if(!only(attrs,type==='heading'?['level','textAlign']:['textAlign'])||!alignment(attrs.textAlign)||type==='heading'&&![2,3].includes(Number(attrs.level)))return false;
  }else if(type==='image'){
   if(!only(attrs,['src','alt','title','width','align'])||!blogImageId(attrs.src)||typeof attrs.alt!=='string'||attrs.alt.length>300||attrs.title!=null&&(typeof attrs.title!=='string'||attrs.title.length>300)||attrs.width!=null&&(typeof attrs.width!=='number'||!Number.isFinite(attrs.width)||attrs.width<20||attrs.width>100)||attrs.align!=null&&!['left','center','right'].includes(String(attrs.align)))return false;
  }else if(type==='orderedList'){
   if(!only(attrs,['start','type'])||attrs.start!=null&&(!Number.isInteger(attrs.start)||Number(attrs.start)<1||Number(attrs.start)>10000)||attrs.type!=null&&attrs.type!=='1')return false;
  }else if(type==='codeBlock'){
   if(!only(attrs,['language'])||attrs.language!=null&&(typeof attrs.language!=='string'||attrs.language.length>40))return false;
  }else if(type==='tableCell'||type==='tableHeader'){
   if(!only(attrs,['colspan','rowspan','colwidth'])||attrs.colspan!=null&&(!Number.isInteger(attrs.colspan)||Number(attrs.colspan)<1||Number(attrs.colspan)>8)||attrs.rowspan!=null&&(!Number.isInteger(attrs.rowspan)||Number(attrs.rowspan)<1||Number(attrs.rowspan)>20)||attrs.colwidth!=null&&(!Array.isArray(attrs.colwidth)||attrs.colwidth.length>8||attrs.colwidth.some(x=>!Number.isInteger(x)||Number(x)<20||Number(x)>2000)))return false;
  }else if(!only(attrs,[]))return false;
  const leaf=['image','horizontalRule','hardBreak'].includes(type);
  if(leaf&&node.content!==undefined)return false;
  if(!leaf&&node.content!==undefined&&!Array.isArray(node.content))return false;
  const children=(node.content??[]) as unknown[];
  if(children.length>400)return false;
  if(['bulletList','orderedList','listItem','blockquote','table','tableRow','tableCell','tableHeader'].includes(type)&&!children.length)return false;
  if(type==='table'&&(children.length>20||children.some(row=>!record(row)||!Array.isArray(row.content)||row.content.reduce((sum:number,cell:unknown)=>sum+(record(cell)&&record(cell.attrs)?Number(cell.attrs.colspan??1):1),0)>8)))return false;
  stack.push(...children.map(child=>({node:child,parent:type,depth:depth+1})));
 }
 return true;
}
export const blogDocumentSchema=z.custom<BlogDocument>(validBlogDocument,'รูปแบบบทความไม่ถูกต้อง หรือเนื้อหาเกินขนาดที่รองรับ');
export const blogDraftSchema=z.object({
 title:z.string().trim().max(180),slug:z.string().max(120).regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/).refine(v=>!['sitemap','images'].includes(v),'URL นี้สงวนไว้สำหรับระบบ กรุณาใช้ชื่ออื่น'),
 excerpt:z.string().trim().max(500),language:z.enum(['th','en']),category:z.string().trim().max(60),tags:z.array(z.string().trim().min(1).max(40)).max(10),
 coverImageId:z.uuid().nullable(),coverAlt:z.string().trim().max(300),authorName:z.string().trim().max(100),
 seoTitle:z.string().trim().max(180),seoDescription:z.string().trim().max(320),document:blogDocumentSchema,
}).strict();
export type BlogDraft=z.infer<typeof blogDraftSchema>;
export type BlogAdminPost={id:string;version:number;draft:BlogDraft;hasPublishedVersion:boolean;publishedAt:string|null;updatedAt:string;publishedVersion:number|null;archivedAt:string|null};
export type BlogPublicPost=BlogDraft&{id:string;publishedAt:string;modifiedAt:string};
export type BlogSummary=Omit<BlogPublicPost,'document'>;
export function blogPlainText(document:BlogDocument):string{
 const stack:BlogNode[]=[...document.content].reverse(),chunks:string[]=[];
 while(stack.length){const node=stack.pop()!;if(node.type==='text')chunks.push(node.text??'');else if(node.type==='hardBreak')chunks.push('\n');else{if(['paragraph','heading','listItem','tableRow'].includes(node.type))chunks.push('\n');if(node.content)stack.push(...[...node.content].reverse());}}
 return chunks.join('').trim();
}
export function blogImageIds(document:BlogDocument):string[]{
 const ids=new Set<string>(),stack=[...document.content];
 while(stack.length){const node=stack.pop()!;if(node.type==='image'){const id=blogImageId(node.attrs?.src);if(id)ids.add(id);}if(node.content)stack.push(...node.content);}
 return [...ids];
}
