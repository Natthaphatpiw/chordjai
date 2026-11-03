import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, ChevronRight } from 'lucide-react';
import type { BlogSummary } from '@chordjai/contracts';
import type { Locale } from '../../../shared/locale-core';
import { localizedHref } from '../../../shared/locale-core';
import { blogIndexHref } from '../../lib/blog-seo';

export function BlogHeader({language}:{language:Locale}){
 const t=(th:string,en:string)=>language==='en'?en:th;
 return <header className="blog-header"><div className="blog-container blog-header-inner"><Link href={localizedHref('/',language)} className="blog-wordmark" aria-label={t('ชิดใจ หน้าหลัก','ChordJai home')}><Image src="/brand/chordjai-emblem.png" alt="" width={56} height={56}/><span>chord<span>jai</span></span></Link><nav aria-label={t('เมนูเว็บไซต์','Website navigation')}><Link href={localizedHref('/product',language)}>{t('รู้จักชิดใจ','Our product')}</Link><Link href={blogIndexHref({language})} aria-current="page">{t('บทความ','Blog')}</Link></nav><div className="blog-header-actions"><div className="blog-language" aria-label={t('อ่านบทความตามภาษา','Browse articles by language')}><Link href="/blog" aria-label={t('บทความภาษาไทย','Articles in Thai')} aria-current={language==='th'?'true':undefined}>TH</Link><Link href="/blog?lang=en" aria-label={t('บทความภาษาอังกฤษ','Articles in English')} aria-current={language==='en'?'true':undefined}>EN</Link></div><Link className="blog-button blog-button-small" href={localizedHref('/app',language)}>{t('เปิดชิดใจ','Open app')}<ArrowRight size={16}/></Link></div></div></header>;
}
export function BlogFooter({language}:{language:Locale}){
 const t=(th:string,en:string)=>language==='en'?en:th;
 return <footer className="blog-footer"><div className="blog-container"><div><b>chordjai</b><p>{t('ทุกเรื่องของน้อง อยู่ใกล้ใจ','Their little life, close to your heart.')}</p></div><nav aria-label={t('ข้อมูลเพิ่มเติม','More information')}><Link href={localizedHref('/',language)}>{t('หน้าหลัก','Home')}</Link><Link href={localizedHref('/product',language)}>{t('ผลิตภัณฑ์','Product')}</Link><Link href={localizedHref('/privacy',language)}>{t('ความเป็นส่วนตัว','Privacy')}</Link></nav><small>© {new Date().getFullYear()} ChordJai</small></div></footer>;
}
export function BlogCta({language}:{language:Locale}){
 const t=(th:string,en:string)=>language==='en'?en:th;
 return <aside className="blog-cta"><div className="blog-cta-copy"><span className="blog-kicker">{t('จากเรื่องที่อ่าน สู่เรื่องของน้อง','From their little story to yours')}</span><h2>{t('เรื่องของน้อง ไม่ต้องจำคนเดียว','Keep their story close.')}<br/>{t('ให้ชิดใจช่วยเก็บไว้ด้วยกัน','You do not have to remember it all.')}</h2><p>{t('เล่าเรื่องน้องผ่าน LINE เก็บอาการ การไปพบหมอ ค่าใช้จ่าย และความทรงจำ แล้วค่อย ๆ ดูแลกันต่อในทุกวัน','Tell ChordJai about your pet on LINE. Keep symptoms, vet visits, expenses and memories together, one day at a time.')}</p><div className="blog-cta-links"><Link className="blog-button" href={localizedHref('/app',language)}>{t('เริ่มพื้นที่ของเรากับน้อง','Start your pet’s space')}<ArrowRight size={17}/></Link><Link className="blog-text-link" href={localizedHref('/product',language)}>{t('ดูว่าชิดใจช่วยอะไรได้บ้าง','Explore ChordJai')}<ChevronRight size={17}/></Link></div></div><div className="blog-cta-mark" aria-hidden="true"><Image src="/brand/chordjai-emblem.png" alt="" width={230} height={230}/></div></aside>;
}
export function BlogCard({post,featured=false}:{post:BlogSummary;featured?:boolean}){
 const t=(th:string,en:string)=>post.language==='en'?en:th;
 return <article className={`blog-card${featured?' blog-card-featured':''}`}><Link className="blog-card-link" href={`/blog/${post.slug}`} prefetch={false}>
 {post.coverImageId?<div className="blog-card-cover"><img src={`/api/v1/analytics/blog/images/${post.coverImageId}`} alt={post.coverAlt} loading={featured?'eager':'lazy'}/></div>:<div className="blog-card-cover blog-card-type"><BookOpen size={featured?58:42} strokeWidth={1.2}/><span>{post.category||t('เรื่องของน้อง','Pet stories')}</span></div>}
 <div className="blog-card-copy"><div className="blog-card-meta"><span>{post.category||t('เรื่องของน้อง','Pet stories')}</span><time dateTime={post.publishedAt}>{blogDate(post.publishedAt,post.language)}</time></div><h2>{post.title}</h2><p>{post.excerpt}</p><span className="blog-read-link">{t('อ่านเรื่องนี้','Read the article')}<ArrowRight size={17}/></span></div></Link></article>;
}
export function blogDate(value:string,language:Locale){return new Intl.DateTimeFormat(language==='en'?'en-GB':'th-TH',{dateStyle:'long',timeZone:'Asia/Bangkok'}).format(new Date(value));}
