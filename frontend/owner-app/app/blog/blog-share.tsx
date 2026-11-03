'use client';
import {useState} from 'react';
import {Check,Link as LinkIcon,Share2} from 'lucide-react';
export function BlogShare({url,title,language}:{url:string;title:string;language:'th'|'en'}){
 const [state,setState]=useState<'idle'|'copied'|'error'>('idle');const t=(th:string,en:string)=>language==='en'?en:th;
 async function share(){try{if(navigator.share){await navigator.share({title,url});return;}await navigator.clipboard.writeText(url);setState('copied');}catch(error){if(error instanceof Error&&error.name==='AbortError')return;setState('error');}}
 return <div className="blog-share"><button type="button" onClick={()=>void share()}>{state==='copied'?<Check size={17}/>:<Share2 size={17}/>} {state==='copied'?t('คัดลอกลิงก์แล้ว','Link copied'):t('แชร์บทความ','Share article')}</button>{state==='error'?<p role="status">{t('คัดลอกลิงก์นี้เพื่อแชร์','Copy this link to share')}: <a href={url}><LinkIcon size={14}/>{url}</a></p>:null}</div>;
}
