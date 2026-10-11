'use client';
import { useEffect, useState } from 'react';
import { api,messageOf } from '../../shared/api';
import { CareSummary,type ClinicalCareEntry } from '../../shared/care-summary';
import { useLocale } from '../../shared/locale';
import { Busy,ErrorBox,Notice } from './ui';

export default function CareSharePreview({petId,includeCosts,onReady}:{petId:string;includeCosts:boolean;onReady:(ready:boolean)=>void}){
  const {locale,t}=useLocale();
  const [data,setData]=useState<{entries:ClinicalCareEntry[];truncated?:boolean}|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;setData(null);setError('');onReady(false);
    api<{entries:ClinicalCareEntry[];truncated?:boolean}>(`/health/care/summary?petId=${encodeURIComponent(petId)}&includeCosts=${includeCosts}`).then(next=>{
      if(!cancelled){setData(next);onReady(true);}
    }).catch(cause=>{if(!cancelled)setError(messageOf(cause,locale));});
    return()=>{cancelled=true;};
  },[petId,includeCosts,onReady]);
  if(error)return <ErrorBox message={error}/>;
  if(!data)return <Busy label={t('กำลังเตรียมข้อมูลที่เลือกแชร์','Preparing the selected details')}/>;
  return <>{data.truncated?<Notice>{t('สรุปแสดงรายการล่าสุดไม่เกิน 100 รายการ','This brief contains up to 100 of the most recent entries.')}</Notice>:null}<CareSummary entries={data.entries}/></>;
}
