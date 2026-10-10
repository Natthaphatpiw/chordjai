import { Flower2, Leaf, Heart, Sun, Moon, PawPrint, Star, Sprout, type LucideIcon } from 'lucide-react';

export const journalGraphics: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'graphic:flower', label: 'ดอกไม้', icon: Flower2 },
  { value: 'graphic:leaf', label: 'ใบไม้', icon: Leaf },
  { value: 'graphic:heart', label: 'หัวใจ', icon: Heart },
  { value: 'graphic:sun', label: 'ดวงอาทิตย์', icon: Sun },
  { value: 'graphic:moon', label: 'ดวงจันทร์', icon: Moon },
  { value: 'graphic:paw', label: 'รอยเท้า', icon: PawPrint },
  { value: 'graphic:star', label: 'ดาว', icon: Star },
  { value: 'graphic:sprout', label: 'ต้นไม้', icon: Sprout },
];

export function JournalGraphic({ value }: { value: string }) {
  const graphic = journalGraphics.find(item => item.value === value);
  if (!graphic) return <span>{value}</span>;
  const Icon = graphic.icon;
  return <Icon className="journal-graphic" aria-hidden="true" strokeWidth={1.2}/>;
}

export function graphicLabel(value: string) {
  return journalGraphics.find(item => item.value === value)?.label ?? value;
}
