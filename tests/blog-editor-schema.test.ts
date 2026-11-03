import {describe,it,expect} from 'vitest';
import {getSchema} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import {Table,TableCell,TableHeader,TableRow} from '@tiptap/extension-table';
import {validBlogDocument} from '@chordjai/contracts';
import {BlogImageCore,BlogTableCell,BlogTableHeader} from '../frontend/admin-console/components/blog-editor-schema';
const schema=getSchema([StarterKit.configure({heading:{levels:[2,3]}}),BlogImageCore,TextAlign.configure({types:['heading','paragraph']}),Table,TableRow,BlogTableHeader,BlogTableCell]);
import {blogStableJson} from '../frontend/admin-console/components/blog-json';
const image='/api/v1/analytics/blog/images/00000000-0000-4000-8000-000000000001';
describe('blog editor produces documents accepted by the public allowlist',()=>{
 it('compares server JSONB by values rather than object key order, preserving content order',()=>{
  const draft={title:'A story',document:{type:'doc',content:[{type:'paragraph',attrs:{textAlign:null},content:[{type:'text',text:'A'}]},{type:'paragraph',content:[{type:'text',text:'B'}]}]}};
  const database={document:{content:[{attrs:{textAlign:null},content:[{text:'A',type:'text'}],type:'paragraph'},{content:[{text:'B',type:'text'}],type:'paragraph'}],type:'doc'},title:'A story'};
  expect(blogStableJson(draft)).toBe(blogStableJson(database));
  database.document.content.reverse();expect(blogStableJson(draft)).not.toBe(blogStableJson(database));
 });
 it('normalizes all editor node defaults without unsupported image height',()=>{
  const document=schema.nodeFromJSON({type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'A heading'}]},{type:'paragraph',content:[{type:'text',text:'A link',marks:[{type:'link',attrs:{href:'https://example.com'}}]},{type:'hardBreak'},{type:'text',text:'More text',marks:[{type:'underline'}]}]},{type:'image',attrs:{src:image,alt:'A pet',title:'Caption',width:65,align:'left'}},{type:'orderedList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'A point'}]}]}]},{type:'codeBlock',content:[{type:'text',text:'Code'}]},{type:'table',content:[{type:'tableRow',content:[{type:'tableHeader',content:[{type:'paragraph',content:[{type:'text',text:'Column'}]}]},{type:'tableCell',content:[{type:'paragraph'}]}]}]}]}).toJSON();
  expect(validBlogDocument(document)).toBe(true);
  const attrs=document.content.find((node:any)=>node.type==='image').attrs;expect(attrs).not.toHaveProperty('height');expect(attrs.width).toBe(65);
 });
 it('keeps a selected image width in the agreed percent range',()=>{
  const document=schema.nodeFromJSON({type:'doc',content:[{type:'image',attrs:{src:image,alt:'A pet',width:100}}]}).toJSON();expect(validBlogDocument(document)).toBe(true);
  document.content[0].attrs.width=101;expect(validBlogDocument(document)).toBe(false);
 });
});
