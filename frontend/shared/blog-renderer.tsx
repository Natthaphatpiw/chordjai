import type {CSSProperties,ReactNode} from 'react';
import {blogImageId,safeBlogLink,type BlogDocument,type BlogNode,type BlogMark} from '@chordjai/contracts';

/** React escapes every text node. No author HTML, CSS, scripts, or remote images execute here. */
export function BlogContent({document,imageBase='public',locale='th'}:{document:BlogDocument;imageBase?:'public'|'admin';locale?:'th'|'en'}){
 let heading=0;
 function marked(text:string,marks:BlogMark[]=[]):ReactNode{
  return marks.reduce<ReactNode>((child,mark,index)=>{
   const key=index;
   switch(mark.type){
    case 'bold':return <strong key={key}>{child}</strong>;
    case 'italic':return <em key={key}>{child}</em>;
    case 'underline':return <u key={key}>{child}</u>;
    case 'strike':return <s key={key}>{child}</s>;
    case 'code':return <code key={key}>{child}</code>;
    case 'link':return safeBlogLink(mark.attrs?.href)?<a key={key} href={mark.attrs.href} target={mark.attrs.target==='_blank'?'_blank':undefined} rel="noopener noreferrer" title={typeof mark.attrs.title==='string'?mark.attrs.title:undefined}>{child}</a>:child;
    default:return child;
   }
  },text);
 }
 function render(node:BlogNode,key:string):ReactNode{
  const attrs=node.attrs??{},children=node.content?.map((child,i)=>render(child,`${key}-${i}`));
  const align=attrs.textAlign as CSSProperties['textAlign'];
  const style:CSSProperties|undefined=['left','center','right','justify'].includes(String(align))?{textAlign:align}:undefined;
  switch(node.type){
   case 'text':return <span key={key}>{marked(node.text??'',node.marks)}</span>;
   case 'paragraph':return <p key={key} style={style}>{children?.length?children:<br/>}</p>;
   case 'heading':{const id=`blog-heading-${heading++}`;return attrs.level===3?<h3 key={key} id={id} style={style}>{children}</h3>:<h2 key={key} id={id} style={style}>{children}</h2>;}
   case 'hardBreak':return <br key={key}/>;
   case 'bulletList':return <ul key={key}>{children}</ul>;
   case 'orderedList':return <ol key={key} start={typeof attrs.start==='number'?attrs.start:undefined}>{children}</ol>;
   case 'listItem':return <li key={key}>{children}</li>;
   case 'blockquote':return <blockquote key={key}>{children}</blockquote>;
   case 'horizontalRule':return <hr key={key}/>;
   case 'codeBlock':return <pre key={key}><code>{children}</code></pre>;
   case 'image':{
    const id=blogImageId(attrs.src);if(!id)return null;
    const width=typeof attrs.width==='number'?Math.max(20,Math.min(100,attrs.width)):100;
    const margins=attrs.align==='left'?{marginLeft:0,marginRight:'auto'}:attrs.align==='right'?{marginLeft:'auto',marginRight:0}:{marginLeft:'auto',marginRight:'auto'};
    return <figure key={key} style={{width:`${width}%`,...margins}}><img src={`/api/v1/analytics/${imageBase==='admin'?'admin/':''}blog/images/${id}`} alt={typeof attrs.alt==='string'?attrs.alt:''} loading="lazy" decoding="async"/>{typeof attrs.title==='string'&&attrs.title?<figcaption>{attrs.title}</figcaption>:null}</figure>;
   }
   case 'table':return <div key={key} className="blog-table-scroll" tabIndex={0} role="region" aria-label={locale==='en'?'Scrollable table':'ตาราง เลื่อนเพื่ออ่าน'}><table><tbody>{children}</tbody></table></div>;
   case 'tableRow':return <tr key={key}>{children}</tr>;
   case 'tableHeader':return <th key={key} colSpan={Number(attrs.colspan)||1} rowSpan={Number(attrs.rowspan)||1}>{children}</th>;
   case 'tableCell':return <td key={key} colSpan={Number(attrs.colspan)||1} rowSpan={Number(attrs.rowspan)||1}>{children}</td>;
   default:return null;
  }
 }
 return <div className="blog-prose">{document.content.map((node,index)=>render(node,String(index)))}</div>;
}
