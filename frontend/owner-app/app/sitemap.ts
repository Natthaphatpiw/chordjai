import type {MetadataRoute} from 'next';
import {blogSitemapItems} from '../lib/blog';
import {BLOG_ORIGIN,blogArticleUrl} from '../lib/blog-seo';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const articles=await blogSitemapItems();
 return [{url:BLOG_ORIGIN+'/',changeFrequency:'weekly',priority:1},{url:BLOG_ORIGIN+'/product',changeFrequency:'monthly',priority:.8},{url:BLOG_ORIGIN+'/blog',changeFrequency:'weekly',priority:.8},{url:BLOG_ORIGIN+'/blog?lang=en',changeFrequency:'weekly',priority:.7},...articles.slice(0,49_996).map(article=>({url:blogArticleUrl(article.slug),lastModified:article.modifiedAt}))];
}
