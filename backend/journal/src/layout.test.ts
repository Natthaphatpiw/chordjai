import {describe,it,expect} from 'vitest';
import {decorationSchema,validatePhotoElements,validateCanvasElements} from './app.js';
describe('untrusted AI layout validation',()=>{
  const theme={background:'#FFF9F1',accent:'#CC6D3D',font:'sans'};
  const sticker={id:'sticker-1',type:'sticker' as const,x:100,y:50,width:60,height:60,rotation:0,content:'🐾',color:'#CC6D3D'};
  it('accepts bounded inert JSON and rejects CSS/html schema fields',()=>{
    expect(decorationSchema.safeParse({theme,elements:[sticker]}).success).toBe(true);
    expect(decorationSchema.safeParse({theme:{...theme,background:'url(https://evil.example)'},elements:[sticker]}).success).toBe(false);
    expect(decorationSchema.safeParse({theme,elements:[{...sticker,x:-1}]}).success).toBe(false);
  });
  it('rejects arbitrary image URLs and duplicate element ids',()=>{
    expect(()=>validatePhotoElements([{...sticker,type:'photo',content:'https://evil.example/tracker.png'}])).toThrow('รูปในสมุด');
    expect(()=>validatePhotoElements([sticker,sticker])).toThrow('ID');
  });
});

describe('permanent Story pages and legacy layout bounds',()=>{
  it('accepts portrait Story elements below the old canvas and rejects out-of-bounds sums',()=>{
    const item={id:'date',type:'text' as const,x:100,y:1200,width:500,height:80,rotation:0,content:'11 Oct 2026'};
    expect(()=>validateCanvasElements([item],1422)).not.toThrow();
    expect(()=>validateCanvasElements([item],1000)).toThrow('ภายใน');
    expect(()=>validateCanvasElements([{...item,x:790}],1422)).toThrow('ภายใน');
    expect(()=>validateCanvasElements([{...item,y:1400}],1422)).toThrow('ภายใน');
  });
});
