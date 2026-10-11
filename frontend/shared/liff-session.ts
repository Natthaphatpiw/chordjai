import type { Liff } from '@line/liff';

let initialization: Promise<Liff> | undefined;
let initializedId = '';
export async function initializedLiff(liffId: string): Promise<Liff> {
  if (initialization && initializedId === liffId) return initialization;
  initializedId = liffId;
  const pending = import('@line/liff').then(async ({default: liff}) => {
    await liff.init({ liffId });
    return liff;
  }).catch(error => { if (initialization === pending) initialization = undefined; throw error; });
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
  const {default: liff} = await import('@line/liff');
  if (!liff.isInClient() && !hasLiffEntry(window.location.href)) return null;
  return initializedLiff(liffId);
}
