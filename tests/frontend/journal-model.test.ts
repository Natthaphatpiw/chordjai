import { describe, it, expect } from 'vitest';
import { boundElement, canvasHeight, orderPages, safeJournalPhoto, scaleElement } from '../../frontend/owner-app/components/journal-model';
import type { JournalElement, JournalPage } from '../../frontend/owner-app/lib/types';
const photo:JournalElement={id:'photo',type:'photo',content:'/api/v1/media/11111111-1111-1111-1111-111111111111',x:100,y:100,width:400,height:300,rotation:0};
describe('Story interaction geometry and data compatibility',()=>{
  it('keeps old pages at 800x1000 and uses portrait height only when explicitly saved',()=>{
    expect(canvasHeight({})).toBe(1000);expect(canvasHeight({canvasHeight:1422})).toBe(1422);
  });
  it('resizes photos proportionally and keeps corner/pinch extremes inside both canvases',()=>{
    for(const height of [1000,1422])for(const factor of [.0001,.9,1.1,100]){
      const next=scaleElement(photo,factor,height);expect(next.width/next.height).toBeCloseTo(4/3);expect(next.width).toBeGreaterThanOrEqual(24);expect(next.height).toBeGreaterThanOrEqual(24);expect(next.x).toBeGreaterThanOrEqual(0);expect(next.y).toBeGreaterThanOrEqual(0);expect(next.x+next.width).toBeLessThanOrEqual(800);expect(next.y+next.height).toBeLessThanOrEqual(height);
    }
  });
  it('clamps drag movement without losing original content or rotation',()=>{
    const moved=boundElement({...photo,x:-200,y:5000,rotation:-15},1422);expect(moved.x).toBe(0);expect(moved.y).toBe(1122);expect(moved.content).toBe(photo.content);expect(moved.rotation).toBe(-15);
  });
  it('retains permanent page order when another page is edited',()=>{
    const base={petId:'pet',title:'a',version:1,theme:{background:'#ffffff',font:'sans',accent:'#ff8a24'},elements:[]};
    const pages:JournalPage[]=[{...base,id:'b',pageOrder:2,updatedAt:'2026-01-01'},{...base,id:'a',pageOrder:1,updatedAt:'2026-10-11'}];expect(orderPages(pages).map(p=>p.id)).toEqual(['a','b']);expect(pages[0].id).toBe('b');
  });
  it('accepts local uploaded media and demo image data only in explicit demo mode',()=>{
    expect(safeJournalPhoto(photo.content)).toBe(photo.content);expect(safeJournalPhoto('javascript:alert(1)',true)).toBe('');expect(safeJournalPhoto('data:image/jpeg;base64,aGVsbG8=')).toBe('');expect(safeJournalPhoto('data:image/jpeg;base64,aGVsbG8=',true)).toContain('data:image/');expect(safeJournalPhoto('data:image/svg+xml;base64,aGVsbG8=',true)).toBe('');
  });
});
