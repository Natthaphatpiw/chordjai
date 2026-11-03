import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowRight} from 'lucide-react';
import {BlogContent} from '../../../../shared/blog-renderer';
import {getPublishedPost,listPublishedPosts} from '../../../lib/blog';
import {BLOG_ORIGIN,blogArticleUrl,blogCoverUrl,blogHeadings,blogIndexHref,blogJsonLd,escapeJsonLd} from '../../../lib/blog-seo';
import {BlogCard,BlogCta,BlogFooter,BlogHeader,blogDate} from '../blog-parts';
import {BlogShare} from '../blog-share';
import '../blog.css';
import '../../../../shared/blog-content.css';
export const dynamic='force-dynamic';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const post=await getPublishedPost((await params).slug);if(!post)notFound();
 const title=post.seoTitle||post.title,description=post.seoDescription||post.excerpt,image=blogCoverUrl(post.coverImageId),canonical=blogArticleUrl(post.slug);
 return {title:`${title} · ChordJai`,description,keywords:post.tags,alternates:{canonical},robots:{index:true,follow:true},openGraph:{type:'article',url:canonical,title,description,siteName:'ChordJai',locale:post.language==='en'?'en_US':'th_TH',publishedTime:post.publishedAt,modifiedTime:post.modifiedAt,authors:[post.authorName],tags:post.tags,section:post.category,...(image?{images:[{url:image,alt:post.coverAlt}]}:{})},twitter:{card:image?'summary_large_image':'summary',title,description,...(image?{images:[image]}:{})}};
}
export default async function BlogArticle({params}:Props){
 const post=await getPublishedPost((await params).slug);if(!post)notFound();
 const language=post.language,t=(th:string,en:string)=>language==='en'?en:th;const headings=blogHeadings(post.document),url=blogArticleUrl(post.slug);
 const related=await listPublishedPosts({language,category:post.category}).then(data=>data.items.filter(item=>item.id!==post.id).slice(0,3)).catch(()=>[]);
 const breadcrumbs={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:t('หน้าหลัก','Home'),item:BLOG_ORIGIN+'/'},{'@type':'ListItem',position:2,name:t('บทความ','Blog'),item:BLOG_ORIGIN+blogIndexHref({language})},{'@type':'ListItem',position:3,name:post.title,item:url}]};
 return <div className="blog-site" lang={language}><a className="blog-skip" href="#article-main">{t('ข้ามไปยังเนื้อหาบทความ','Skip to article')}</a><BlogHeader language={language}/><main id="article-main" className="blog-container"><nav className="blog-breadcrumb" aria-label={t('เส้นทางหน้าปัจจุบัน','Breadcrumb')}><Link href={`/?lang=${language}`}>{t('หน้าหลัก','Home')}</Link><span>/</span><Link href={blogIndexHref({language})}>{t('บทความ','Blog')}</Link><span>/</span><span aria-current="page">{post.category||t('เรื่องของน้อง','Pet stories')}</span></nav>
 <article className="blog-article"><header className="blog-article-header"><Link className="blog-kicker" href={blogIndexHref({language,category:post.category})}>{post.category||t('เรื่องของน้อง','Pet stories')}</Link><h1>{post.title}</h1><p className="blog-article-deck">{post.excerpt}</p><div className="blog-byline"><span>{t('โดย','By')} {post.authorName}</span><span aria-hidden="true">·</span><time dateTime={post.publishedAt}>{blogDate(post.publishedAt,language)}</time></div>{post.modifiedAt!==post.publishedAt?<p className="blog-updated">{t('อัปเดตล่าสุด','Updated')} <time dateTime={post.modifiedAt}>{blogDate(post.modifiedAt,language)}</time></p>:null}<BlogShare url={url} title={post.title} language={language}/></header>
 {post.coverImageId?<figure className="blog-article-cover"><img src={`/api/v1/analytics/blog/images/${post.coverImageId}`} alt={post.coverAlt} fetchPriority="high"/></figure>:null}
 <div className={`blog-reading-layout${headings.length>1?' has-contents':''}`}>{headings.length>1?<aside className="blog-contents"><details open><summary>{t('ในบทความนี้','In this article')}</summary><nav aria-label={t('สารบัญบทความ','Table of contents')}>{headings.map(heading=><a className={heading.level===3?'blog-contents-sub':undefined} href={`#${heading.id}`} key={heading.id}>{heading.text}</a>)}</nav></details></aside>:null}<div className="blog-reading"><BlogContent document={post.document} locale={language}/><footer className="blog-article-end">{post.tags.length?<nav className="blog-tags" aria-label={t('หัวข้อที่เกี่ยวข้อง','Related topics')}>{post.tags.map(tag=><Link key={tag} href={blogIndexHref({language,search:tag})}>{tag}</Link>)}</nav>:null}<BlogShare url={url} title={post.title} language={language}/><Link className="blog-text-link" href={blogIndexHref({language})}><ArrowLeft size={17}/>{t('กลับไปอ่านเรื่องอื่น','Back to all articles')}</Link></footer></div></div></article>
 {related.length?<section className="blog-related"><div className="blog-results-label"><h2>{t('อ่านกันต่ออีกนิด','A little more to read.')}</h2><Link href={blogIndexHref({language})} className="blog-text-link">{t('บทความทั้งหมด','All articles')}<ArrowRight size={17}/></Link></div><div className="blog-grid">{related.map(item=><BlogCard post={item} key={item.id}/>)}</div></section>:null}<BlogCta language={language}/></main><BlogFooter language={language}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:escapeJsonLd(blogJsonLd(post))}}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:escapeJsonLd(breadcrumbs)}}/></div>;
}
