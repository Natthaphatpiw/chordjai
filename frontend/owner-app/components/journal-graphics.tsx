'use client';
import { Flower2, Leaf, Heart, Sun, Moon, PawPrint, Star, Sprout, type LucideIcon } from 'lucide-react';
import { useLocale } from '../../shared/locale';
import { translate, type Locale } from '../../shared/locale-core';
const graphics: { value: string; thai: string; english: string; icon: LucideIcon }[] = [
  { value: 'graphic:flower', thai: 'ดอกไม้', english: 'Flower', icon: Flower2 },
  { value: 'graphic:leaf', thai: 'ใบไม้', english: 'Leaf', icon: Leaf },
  { value: 'graphic:heart', thai: 'หัวใจ', english: 'Heart', icon: Heart },
  { value: 'graphic:sun', thai: 'ดวงอาทิตย์', english: 'Sun', icon: Sun },
  { value: 'graphic:moon', thai: 'ดวงจันทร์', english: 'Moon', icon: Moon },
  { value: 'graphic:paw', thai: 'รอยเท้า', english: 'Paw', icon: PawPrint },
  { value: 'graphic:star', thai: 'ดาว', english: 'Star', icon: Star },
  { value: 'graphic:sprout', thai: 'ต้นไม้', english: 'Sprout', icon: Sprout },
];
export function useJournalGraphics() {
  const { t } = useLocale();
  return graphics.map(({thai,english,...item})=>({...item,label:t(thai,english)}));
}
export function JournalGraphic({ value }: { value: string }) {
  const graphic = graphics.find(item => item.value === value);
  if (!graphic) return <span>{value}</span>;
  const Icon = graphic.icon;
  return <Icon className="journal-graphic" aria-hidden="true" strokeWidth={1.2}/>;
}
export function graphicLabel(value: string, locale: Locale) {
  const graphic=graphics.find(item=>item.value===value);
  return graphic?translate(locale,graphic.thai,graphic.english):value;
}
