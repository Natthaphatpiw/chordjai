/** The gallery order is deliberate: the first photo is the PetID reference. */
export const PETID_PHOTO_LIMIT = 5;
export interface PetIdPhoto {
  id: string;
  url: string;
  label: string;
  local?: boolean;
}
export function photoCapacity(count: number): number { return Math.max(0, PETID_PHOTO_LIMIT - count); }
export function movePhoto(photos: readonly PetIdPhoto[], index: number, direction: -1 | 1): PetIdPhoto[] {
  const target = index + direction;
  if (index < 0 || index >= photos.length || target < 0 || target >= photos.length) return [...photos];
  const next = [...photos];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
export function photoFingerprint(photos: readonly PetIdPhoto[]): string { return photos.map(photo => photo.id).join(':'); }
export function canRegisterPetId(photos: readonly PetIdPhoto[], description: string, reviewed: boolean, optIn: boolean): boolean {
  return photos.length > 0 && photos.length <= PETID_PHOTO_LIMIT && description.trim().length > 0 && description.length <= 3000 && reviewed && optIn;
}
