import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowRight,BookOpen,Search} from 'lucide-react';
import {listPublishedPosts} from '../../lib/blog';
import {BLOG_ORIGIN,blogIndexHref,blogIndexOptions} from '../../lib/blog-seo';
import {BlogCard,BlogCta,BlogFooter,BlogHeader} from './blog-parts';
import './blog.css';
export const dynamic='force-dynamic';
type Props={searchParams:Promise<Record<string,string|string[]|undefined>>};
export async function generateMetadata({searchParams}:Props):Promise<Metadata>{
 const options=blogIndexOptions(await searchParams),en=options.language==='en';const canonical=BLOG_ORIGIN+blogIndexHref({language:options.language,page:options.page});
 const title=en?'Pet stories & everyday care · ChordJai':'เรื่องของน้อง · บทความสัตว์เลี้ยงจากชิดใจ';
 const description=en?'Thoughtful reads about life with pets, everyday care and the little things worth remembering. Discover the ChordJai care diary, Pet Passport and PetID.':'อ่านเรื่องสัตว์เลี้ยง การดูแลในทุกวัน และเรื่องเล็ก ๆ ที่ควรเก็บไว้ พร้อมรู้จักไดอารี่ดูแลน้อง Pet Passport และ PetID ของชิดใจ';
 return {title,description,alternates:{canonical,languages:{th:BLOG_ORIGIN+'/blog',en:BLOG_ORIGIN+'/blog?lang=en','x-default':BLOG_ORIGIN+'/blog'}},robots:{index:!options.search&&!options.category,follow:true},openGraph:{type:'website',title,description,url:canonical,siteName:'ChordJai',locale:en?'en_US':'th_TH'}};
}
export default async function BlogIndex({searchParams}:Props){
 const options=blogIndexOptions(await searchParams),data=await listPublishedPosts(options),{language}=options;
 const t=(th:string,en:string)=>language==='en'?en:th;const countLabel=language==='en'?(data.total===1?'article':'articles'):'บทความ';const featured=options.page===0&&!options.search&&!options.category?data.items[0]:undefined;
 if(options.page>0&&!data.items.length)notFound();
 const items=featured?data.items.slice(1):data.items;const pages=Math.max(1,Math.ceil(data.total/data.pageSize));
 return <div className="blog-site" lang={language}><a className="blog-skip" href="#blog-main">{t('ข้ามไปยังบทความ','Skip to articles')}</a><BlogHeader language={language}/><main id="blog-main" className="blog-container"><section className="blog-intro"><span className="blog-kicker">{t('เรื่องของน้อง · อ่านไป ดูแลกันไป','A little reading. A little closer.')}</span><h1>{t('ทุกชีวิตเล็ก ๆ','Every little life')}<br/><span>{t('มีเรื่องให้เราเรียนรู้เสมอ','has a story to share.')}</span></h1><p>{t('บทความสำหรับคนที่อยากเข้าใจน้องมากขึ้น ตั้งแต่การดูแลในทุกวัน ไปจนถึงช่วงเวลาที่เราอยากจำ','Thoughtful reads for people who want to understand their pets a little better. From everyday care to the moments we want to remember.')}</p></section>
 <form className="blog-search" method="get" action="/blog"><input type="hidden" name="lang" value={language}/><div className="blog-search-field"><Search size={19} aria-hidden="true"/><label className="sr-only" htmlFor="blog-search">{t('ค้นหาบทความ','Search articles')}</label><input id="blog-search" name="q" placeholder={t('วันนี้อยากอ่านเรื่องอะไร','What would you like to read?')} maxLength={120} defaultValue={options.search}/></div><div className="blog-category-field"><label htmlFor="blog-category">{t('หมวดหมู่','Category')}</label><input id="blog-category" name="category" maxLength={60} placeholder={t('ทุกหมวดหมู่','All categories')} defaultValue={options.category}/></div><button className="blog-button" type="submit">{t('ค้นหา','Search')}<ArrowRight size={16}/></button></form>
 {(options.search||options.category)?<div className="blog-results-label"><p>{t('ผลการค้นหา','Search results')} · {data.total} {countLabel}{options.search?` · “${options.search}”`:''}{options.category?` · ${options.category}`:''}</p><Link className="blog-text-link" href={blogIndexHref({language})}>{t('ดูทั้งหมด','Clear filters')}</Link></div>:<div className="blog-results-label"><h2>{options.page?t('บทความทั้งหมด','All articles'):t('ค่อย ๆ รู้จักน้องให้มากขึ้น','Get to know them, a little better.')}</h2><span>{data.total} {countLabel}</span></div>}
 {featured?<BlogCard post={featured} featured/>:null}
 {items.length?<div className="blog-grid">{items.map(post=><BlogCard post={post} key={post.id}/>)}</div>:null}
 {!data.items.length?<section className="blog-empty"><BookOpen size={48} strokeWidth={1.2}/><h2>{options.search||options.category?t('ยังไม่พบเรื่องที่ค้นหา','No matching articles yet'):options.page?t('ยังไม่มีบทความในหน้านี้','There are no articles on this page'):t('เรื่องดี ๆ กำลังตามมา','Good stories are on their way.')}</h2><p>{options.search||options.category?t('ลองใช้คำค้นอื่น หรือเปิดดูบทความทั้งหมดได้เลย','Try another search, or browse all articles.'):t('เรากำลังเตรียมบทความสำหรับคุณกับน้อง ระหว่างนี้แวะมารู้จักชิดใจกันก่อนได้','We are putting together thoughtful reads for you and your pet. In the meantime, get to know ChordJai.')}</p><Link className="blog-text-link" href={options.search||options.category||options.page?blogIndexHref({language}):`/product?lang=${language}`}>{options.search||options.category||options.page?t('ดูบทความทั้งหมด','Browse all articles'):t('รู้จักชิดใจ','Explore ChordJai')}<ArrowRight size={17}/></Link></section>:null}
 {pages>1||options.page>0?<nav className="blog-pagination" aria-label={t('หน้าบทความ','Article pages')}>{options.page>0?<Link href={blogIndexHref({...options,page:options.page-1})}><ArrowLeft size={17}/>{t('ก่อนหน้า','Previous')}</Link>:<span/>}<span>{t('หน้า','Page')} {options.page+1} / {pages}</span>{options.page+1<pages?<Link href={blogIndexHref({...options,page:options.page+1})}>{t('ถัดไป','Next')}<ArrowRight size={17}/></Link>:<span/>}</nav>:null}
 <BlogCta language={language}/></main><BlogFooter language={language}/></div>;
}
