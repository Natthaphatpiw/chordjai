import {describe,it,expect} from 'vitest';
import type {BlogPublicPost} from '@chordjai/contracts';
import {blogArticleUrl,blogCoverUrl,blogHeadings,blogIndexHref,blogIndexOptions,blogJsonLd,escapeJsonLd} from '../frontend/owner-app/lib/blog-seo';
const post:BlogPublicPost={id:'10000000-0000-4000-8000-000000000001',title:'A pet story </script><script>bad()</script>',slug:'a-pet-story',excerpt:'Read their story',language:'en',category:'Everyday care',tags:['Pets'],coverImageId:'20000000-0000-4000-8000-000000000002',coverAlt:'A cat by the window',authorName:'The editor',seoTitle:'',seoDescription:'An owner’s story',document:{type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'First heading'}]},{type:'paragraph',content:[{type:'text',text:'Everyday life.'}]},{type:'blockquote',content:[{type:'heading',attrs:{level:3},content:[{type:'text',text:'A nested heading'}]}]}]},publishedAt:'2026-11-03T12:00:00.000Z',modifiedAt:'2026-11-04T12:00:00.000Z'};
describe('public blog discovery metadata',()=>{
 it('serializes author text safely inside a JSON-LD script without closing it',()=>{
  const value=escapeJsonLd(blogJsonLd(post));expect(value).not.toContain('</script>');expect(value).not.toContain('<script>');expect(JSON.parse(value).headline).toBe(post.title);
 });
 it('uses stable canonical URLs and real publication timestamps',()=>{
  const json=blogJsonLd(post);expect(json.url).toBe('https://www.chordjai.life/blog/a-pet-story');expect(json.inLanguage).toBe('en');expect(json.datePublished).toBe(post.publishedAt);expect(json.dateModified).toBe(post.modifiedAt);expect(json.image?.[0]).toBe(blogCoverUrl(post.coverImageId));expect(blogArticleUrl(post.slug)).not.toContain('?lang');
 });
 it('does not invent a cover image when there is none',()=>{expect(blogJsonLd({...post,coverImageId:null})).not.toHaveProperty('image');});
 it('matches traversal order for article contents anchors',()=>{expect(blogHeadings(post.document)).toEqual([{id:'blog-heading-0',text:'First heading',level:2},{id:'blog-heading-1',text:'A nested heading',level:3}]);});
 it('uses explicit article-list languages and bounded query values',()=>{
  expect(blogIndexOptions({lang:'en',q:'  cat  ',category:' Care ',page:'2'})).toEqual({language:'en',search:'cat',category:'Care',page:1});expect(blogIndexOptions({lang:['en','th'],page:'-2'}).language).toBe('th');expect(blogIndexOptions({page:'Infinity'}).page).toBe(0);expect(blogIndexOptions({q:'a'.repeat(500)}).search.length).toBe(120);
 });
 it('keeps index canonical routes deterministic and safely encodes search strings',()=>{expect(blogIndexHref({language:'th'})).toBe('/blog');expect(blogIndexHref({language:'en',page:1})).toBe('/blog?lang=en&page=2');expect(blogIndexHref({language:'th',search:'cat & dog'})).toBe('/blog?q=cat+%26+dog');});
});
