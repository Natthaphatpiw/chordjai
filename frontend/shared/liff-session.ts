import type { Liff } from '@line/liff';
import {browserLocale,translate} from './locale-core';

let initialization: Promise<Liff> | undefined;
let initializedId = '';
export async function initializedLiff(liffId: string): Promise<Liff> {
  if (initialization && initializedId === liffId) return initialization;
  initializedId = liffId;
  let timer:ReturnType<typeof setTimeout>;
  const work = import('@line/liff').then(async ({default: liff}) => {
    await liff.init({ liffId });
    return liff;
  });
  const pending=Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(translate(browserLocale(),'LINE ใช้เวลานานกว่าปกติ กรุณาลองอีกครั้ง','LINE is taking longer than usual. Please try again.')),{code:'LIFF_INIT_TIMEOUT'})),12_000);})])
    .finally(()=>clearTimeout(timer)).catch(error => { if (initialization === pending) initialization = undefined; throw error; });
  initialization = pending;
  return pending;
}
export function hasLiffEntry(url: string): boolean {
  const params = new URL(url).searchParams;
  return [...params.keys()].some(key => key.startsWith('liff.') || key === 'lineAppVersion') || (params.has('code') && params.has('state'));
}
/** Ordinary browser/demo visits remain available without a LINE redirect. */
export async function automaticLiff(liffId: string): Promise<Liff | null> {
  if (!liffId) return null;
  if (initialization && initializedId === liffId) return initialization;
  // This is only a cheap SDK-loading hint, never proof of identity. A normal
  // browser visit must not download and initialise LINE before showing entry.
  if(!hasLiffEntry(window.location.href)&&!(typeof navigator!=='undefined'&&/\bLine\//i.test(navigator.userAgent)))return null;
  const {default: liff} = await import('@line/liff');
  if (!liff.isInClient() && !hasLiffEntry(window.location.href)) return null;
  return initializedLiff(liffId);
}
