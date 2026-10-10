import { Syringe, Weight, Pill, Leaf, Activity, FileText } from 'lucide-react';
import type { HealthRecord } from '../lib/types';

const icons = { vaccine: Syringe, weight: Weight, medication: Pill, parasite: Leaf, checkin: Activity, note: FileText };
export function RecordIcon({ kind }: { kind: HealthRecord['kind'] }) {
  const Icon = icons[kind];
  return <Icon size={19} strokeWidth={1.6} aria-hidden="true"/>;
}
