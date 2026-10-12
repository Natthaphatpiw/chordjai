import { describe, expect, it, vi } from 'vitest';
import { carePhotoUploadInit, encodeCarePhotoUpload, uploadPreparedCarePhoto } from '../../frontend/owner-app/components/care-photo-upload';

describe('Care diary image upload retry', () => {
  it('preserves the multipart boundary, bytes and idempotency key on every attempt', async () => {
    const image = new Blob([new Uint8Array([255, 216, 255, 224, 1, 2, 3])], { type: 'image/jpeg' });
    const prepared = await encodeCarePhotoUpload(image, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001');
    const first = carePhotoUploadInit(prepared), retry = carePhotoUploadInit(prepared);
    expect(first.body).toBe(retry.body);
    expect(first.headers).toEqual(retry.headers);
    expect(new Headers(first.headers).get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(new Headers(first.headers).get('Idempotency-Key')).toBe(prepared.key);
    const firstRequest = new Request('http://localhost/api/v1/media/upload', first), retryRequest = new Request('http://localhost/api/v1/media/upload', retry);
    expect(new Uint8Array(await firstRequest.clone().arrayBuffer())).toEqual(new Uint8Array(await retryRequest.arrayBuffer()));
    const decoded = await firstRequest.formData();
    expect(decoded.get('petId')).toBe('00000000-0000-4000-8000-000000000002');
    const file = decoded.get('file') as File;
    expect(file.name).toBe('care-photo.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array(await image.arrayBuffer()));
  });
  it('sends the explicit multipart type through the API and refreshes a read link on retry only', async () => {
    const id = '00000000-0000-4000-8000-000000000003';
    const calls: { path: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit) => {
      calls.push({ path, init });
      return Response.json({ data: { id, url: path.endsWith('/link') ? '/fresh-private-read-link' : '/cached-private-read-link' } });
    }));
    try {
      const request = await encodeCarePhotoUpload(new Blob(['fixture'], { type: 'image/jpeg' }), 'pet-1');
      expect((await uploadPreparedCarePhoto(request)).url).toBe('/cached-private-read-link');
      expect((await uploadPreparedCarePhoto(request, true)).url).toBe('/fresh-private-read-link');
      expect(calls.map(call => call.path)).toEqual(['/api/v1/media/upload', '/api/v1/media/upload', `/api/v1/media/${id}/link`]);
      expect(new Headers(calls[0].init.headers).get('Content-Type')).toBe(request.contentType);
      expect(new Headers(calls[1].init.headers).get('Idempotency-Key')).toBe(request.key);
      expect(calls[0].init.body).toBe(calls[1].init.body);
      expect(calls[2].init.body).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });
  it('assigns a separate request ID and multipart body to a new photo', async () => {
    const image = new Blob(['fixture'], { type: 'image/jpeg' });
    const first = await encodeCarePhotoUpload(image, 'pet-1'), second = await encodeCarePhotoUpload(image, 'pet-1');
    expect(first.key).not.toBe(second.key);
    expect(first.body).not.toBe(second.body);
  });
});
