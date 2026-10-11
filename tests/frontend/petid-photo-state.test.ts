import { describe, expect, it } from 'vitest';
import { canRegisterPetId, movePhoto, photoCapacity, photoFingerprint, type PetIdPhoto } from '../../frontend/owner-app/components/petid-photo-state';
const photos: PetIdPhoto[] = Array.from({ length: 5 }, (_, index) => ({ id: `photo-${index}`, url: `https://example.test/${index}`, label: `Photo ${index + 1}` }));
describe('PetID photo selection and explicit review', () => {
  it('allows at most five photos including existing reference photos', () => {
    expect(photoCapacity(0)).toBe(5);
    expect(photoCapacity(4)).toBe(1);
    expect(photoCapacity(5)).toBe(0);
    expect(photoCapacity(6)).toBe(0);
    expect(canRegisterPetId([...photos, photos[0]!], 'Orange ears', true, true)).toBe(false);
  });
  it('requires photos, editable identifying features, review and search permission', () => {
    expect(canRegisterPetId(photos, 'Orange ears', true, true)).toBe(true);
    expect(canRegisterPetId([], 'Orange ears', true, true)).toBe(false);
    expect(canRegisterPetId(photos, '  ', true, true)).toBe(false);
    expect(canRegisterPetId(photos, 'Orange ears', false, true)).toBe(false);
    expect(canRegisterPetId(photos, 'Orange ears', true, false)).toBe(false);
    expect(canRegisterPetId(photos, 'x'.repeat(3001), true, true)).toBe(false);
  });
  it('moves the primary reference without mutating existing selection and invalidates its fingerprint', () => {
    const reordered = movePhoto(photos, 1, -1);
    expect(reordered.map(photo => photo.id)).toEqual(['photo-1', 'photo-0', 'photo-2', 'photo-3', 'photo-4']);
    expect(photos[0]!.id).toBe('photo-0');
    expect(photoFingerprint(reordered)).not.toBe(photoFingerprint(photos));
    expect(photoFingerprint(photos.slice(0, 4))).not.toBe(photoFingerprint(photos));
    expect(movePhoto(photos, 0, -1)).toEqual(photos);
    expect(movePhoto(photos, 4, 1)).toEqual(photos);
  });
});
