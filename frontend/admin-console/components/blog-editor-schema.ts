import type {Attribute} from '@tiptap/core';
import ImageExtension from '@tiptap/extension-image';
import {TableCell,TableHeader} from '@tiptap/extension-table';
/** Percent width and alignment are the only stored presentation attributes. */
export const BlogImageCore=ImageExtension.extend({
 addAttributes(){const inherited:Record<string,Attribute>={...this.parent?.()};delete inherited.height;return {...inherited,alt:{default:''},width:{default:100,parseHTML:element=>{const value=Number(element.getAttribute('data-width'));return value>=20&&value<=100?value:100;},renderHTML:attrs=>({'data-width':attrs.width})},align:{default:'center',parseHTML:element=>{const value=element.getAttribute('data-align');return ['left','center','right'].includes(value??'')?value:'center';},renderHTML:attrs=>({'data-align':attrs.align})}};},
 addInputRules(){return [];},addPasteRules(){return [];}
});
export const BlogTableCell=TableCell.extend({addAttributes(){const attrs:Record<string,Attribute>={...this.parent?.()};delete attrs.align;return attrs;}});
export const BlogTableHeader=TableHeader.extend({addAttributes(){const attrs:Record<string,Attribute>={...this.parent?.()};delete attrs.align;return attrs;}});
