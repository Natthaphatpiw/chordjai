import {describe,it,expect} from 'vitest';
import {blogDraftSchema,validBlogDocument,blogImageIds,blogPlainText,safeBlogLink,type BlogDocument} from './blog';
const id='a1000000-0000-4000-8000-000000000001';
const doc:BlogDocument={type:'doc',content:[{type:'heading',attrs:{level:2,textAlign:'left'},content:[{type:'text',text:'เรื่องของน้อง'}]},{type:'paragraph',content:[{type:'text',text:'A safe story',marks:[{type:'bold'},{type:'link',attrs:{href:'https://www.chordjai.life/product',target:'_blank',rel:'noopener'}}]},{type:'hardBreak'},{type:'text',text:'Another line'}]},{type:'image',attrs:{src:`/api/v1/analytics/blog/images/${id}`,alt:'น้องแมว',title:'ภาพประกอบ',width:65,align:'center'}}]};
describe('bounded blog document contract',()=>{
 it('accepts multilingual paragraphs, safe links, and stable blog images',()=>{expect(validBlogDocument(doc)).toBe(true);expect(blogImageIds(doc)).toEqual([id]);expect(blogPlainText(doc)).toContain('A safe story\nAnother line');});
 it('rejects author HTML, unknown marks, nested invalid nodes and private owner images',()=>{
  for(const node of [{type:'html',text:'<script>alert(1)</script>'},{type:'paragraph',attrs:{style:'color:red'}},{type:'paragraph',content:[{type:'text',text:'x',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]},{type:'image',attrs:{src:'/api/v1/media/'+id,alt:'private'}},{type:'image',attrs:{src:'https://attacker.example/collect',alt:'remote'}},{type:'image',attrs:{src:`/api/v1/analytics/blog/images/${id}`,alt:'x',width:'100%;position:fixed'}},{type:'paragraph',content:[{type:'image',attrs:{src:`/api/v1/analytics/blog/images/${id}`,alt:'x'}}]}])expect(validBlogDocument({type:'doc',content:[node]})).toBe(false);
 });
 it('requires constrained URLs even when pasting rich HTML',()=>{for(const url of ['javascript:alert(1)','data:text/html,x','//attacker.example','/\\attacker.example','https://user:secret@example.com','https://example.com\n'])expect(safeBlogLink(url)).toBe(false);expect(safeBlogLink('/product?lang=en')).toBe(true);});
 it('bounds image layout, text length, document breadth and nesting',()=>{
  expect(validBlogDocument({type:'doc',content:[{type:'image',attrs:{src:`/api/v1/analytics/blog/images/${id}`,alt:'',width:0}}]})).toBe(false);
  expect(validBlogDocument({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'x'.repeat(100001)}]}]})).toBe(false);
  expect(validBlogDocument({type:'doc',content:Array.from({length:401},()=>({type:'paragraph'}))})).toBe(false);
  let nested:unknown={type:'paragraph'};for(let i=0;i<13;i++)nested={type:'blockquote',content:[nested]};expect(validBlogDocument({type:'doc',content:[nested]})).toBe(false);
 });
 it('permits drafts without a publish title while validating all metadata',()=>{
  const draft={title:'',slug:'',excerpt:'',language:'th',category:'',tags:[],coverImageId:null,coverAlt:'',authorName:'',seoTitle:'',seoDescription:'',document:doc};expect(blogDraftSchema.safeParse(draft).success).toBe(true);
  expect(blogDraftSchema.safeParse({...draft,slug:'../admin'}).success).toBe(false);expect(blogDraftSchema.safeParse({...draft,slug:'sitemap'}).success).toBe(false);expect(blogDraftSchema.safeParse({...draft,tags:Array(11).fill('x')}).success).toBe(false);
 });
 it('permits structured checklists and bounded tables without executable attrs',()=>{
  const table={type:'table',content:[{type:'tableRow',content:[{type:'tableHeader',attrs:{colspan:1,rowspan:1,colwidth:null},content:[{type:'paragraph',content:[{type:'text',text:'หัวข้อ'}]}]},{type:'tableCell',content:[{type:'paragraph'}]}]}]};
  expect(validBlogDocument({type:'doc',content:[table]})).toBe(true);expect(validBlogDocument({type:'doc',content:[{...table,content:Array(21).fill(table.content[0])}]})).toBe(false);
 });
});
