import Link from 'next/link';
import { Heart, ArrowRight } from 'lucide-react';
import { PublicLayout } from '../../../components/public-layout';
export default async function Page({params}:{params:Promise<{code:string}>}){const{code}=await params;return <PublicLayout><section className="public-article public-invitation"><Heart size={40} className="public-invitation-icon"/><h1 style={{marginTop:20}}>ดูแลน้องไปด้วยกัน</h1><p>คุณได้รับลิงก์เชิญให้ร่วมดูแลหรือดูข้อมูลของน้อง<br/>เข้าสู่ระบบ LINE เพื่อรับคำเชิญ ลิงก์มีอายุ 72 ชั่วโมงและใช้ได้ครั้งเดียว</p><Link className="button" href={`/app?invite=${encodeURIComponent(code)}`}>เข้าสู่ระบบเพื่อรับคำเชิญ <ArrowRight size={18}/></Link></section></PublicLayout>;}
