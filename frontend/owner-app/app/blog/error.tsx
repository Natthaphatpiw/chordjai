'use client';
import Link from 'next/link';
import {useLocale} from '../../../shared/locale';
import './blog.css';
export default function BlogError({reset}:{reset:()=>void}){
 const {t,locale}=useLocale();
 return <main className="blog-site"><section className="blog-error" role="alert"><span className="blog-kicker">ChordJai</span><h1>{t('ตอนนี้ยังเปิดบทความไม่ได้','We cannot open the articles right now.')}</h1><p>{t('บริการบทความยังไม่พร้อมใช้งานชั่วคราว ลองโหลดอีกครั้งได้เลย','The article service is temporarily unavailable. Please try loading it again.')}</p><button className="blog-button" onClick={reset}>{t('ลองอีกครั้ง','Try again')}</button><Link className="blog-error-link" href={`/?lang=${locale}`}>{t('กลับหน้าหลักชิดใจ','Visit the ChordJai homepage')}</Link></section></main>;
}
