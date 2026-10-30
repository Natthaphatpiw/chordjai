'use client';
import {BookHeart,Camera,Fingerprint,FolderHeart,Heart,MapPin,MessageCircle,Plus,ScanLine,Settings,Users,Bell,ChevronRight,CalendarDays} from 'lucide-react';
import {useLocale,LanguageSwitcher} from '../../shared/locale';
import type {Pet,HealthRecord} from '../lib/types';
type Tool='booklet'|'journal'|'chat'|'care'|'petid'|'passport'|'settings'|'followups';
export default function OwnerProfile({pet,records,onTool,onEdit,onAdd,onInbox}:{pet:Pet;records:HealthRecord[];onTool:(tool:Tool)=>void;onEdit:()=>void;onAdd:()=>void;onInbox:()=>void}){
 const{t}=useLocale();
 const weight=records.filter(item=>item.kind==='weight'&&item.value!=null).sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt))[0]?.value??pet.weightKg;
 const tools=[
  {id:'booklet' as const,icon:FolderHeart,title:t('วัคซีนและสมุดสุขภาพ','Vaccines & health records'),detail:t('ดูประวัติเดิม เพิ่มข้อมูล หรือสแกนสมุด','View records, add details or scan a booklet')},
  {id:'passport' as const,icon:CalendarDays,title:t('เตรียมพบหมอ','Prepare for a vet visit'),detail:t('ตอบคำถามและเลือกเรื่องที่อยากให้คุณหมอรู้','Answer questions and choose what to tell your vet')},
  {id:'petid' as const,icon:Fingerprint,title:'PetID',detail:t('สร้างตัวตนน้องและเก็บรูปหลายมุม','Create your pet’s identity with photos from different angles')},
  {id:'journal' as const,icon:BookHeart,title:t('สมุดความทรงจำ','Memory book'),detail:t('อ่านเรื่องเก่า หรือแต่งหน้าสมุดในแบบของคุณ','Read past moments or decorate your book')},
  {id:'care' as const,icon:MapPin,title:t('หาคลินิกและช่วยน้องหาย','Find clinics & missing pets'),detail:t('ค้นคลินิก แจ้งหาย หรือช่วยน้องที่พบกลับบ้าน','Find care, report a missing pet or help a found pet')},
  {id:'followups' as const,icon:Heart,title:t('ติดตามอาการผ่าน LINE','LINE check-ins'),detail:t('เลือกให้ชิดใจทักติดตาม และปรับความถี่ได้','Choose check-ins and control their frequency')}
 ];
 return <section className="owner-profile-space"><div className="page-heading"><div><span className="eyebrow">{t('สมาชิกคนสำคัญของเรา','Part of your family')}</span><h1>{pet.name}</h1><p>{t('ข้อมูลและเครื่องมือของน้อง อยู่ตรงนี้เสมอ','Your pet’s details and care tools, always here.')}</p></div>{pet.canEdit!==false?<button className="text-button" onClick={onEdit}>{t('แก้ไขโปรไฟล์','Edit profile')}<ChevronRight size={16}/></button>:null}</div>
  <div className="owner-profile-facts"><span>{pet.species==='cat'?t('แมว','Cat'):t('สุนัข','Dog')}</span>{weight!=null?<span>{weight} {t('กก.','kg')}</span>:null}{pet.canEdit!==false?<button className="text-button" onClick={onEdit}>{t('เติมข้อมูลเมื่อพร้อม','Add details when ready')}</button>:<span>{t('สิทธิ์อ่านอย่างเดียว','Read-only access')}</span>}</div>
  <div className="owner-tool-list">{tools.map(({id,icon:Icon,title,detail})=><button key={id} type="button" className="owner-tool-row" onClick={()=>onTool(id)}><span className="owner-tool-icon"><Icon size={23} aria-hidden="true"/></span><span><b>{title}</b><small>{detail}</small></span><ChevronRight size={18} aria-hidden="true"/></button>)}</div>
  <div className="owner-profile-utilities"><button className="text-button" onClick={onAdd}><Plus size={17}/>{t('เพิ่มน้องอีกตัว','Add another pet')}</button><button className="text-button" onClick={()=>onTool('settings')}><Settings size={17}/>{t('บัญชี ความเป็นส่วนตัว และผู้ร่วมดูแล','Account, privacy & caregivers')}</button><button className="text-button" onClick={onInbox}><Bell size={17}/>{t('แจ้งเตือนของฉัน','My notifications')}</button><div className="owner-language"><span>{t('ภาษา','Language')}</span><LanguageSwitcher/></div></div>
 </section>;
}
