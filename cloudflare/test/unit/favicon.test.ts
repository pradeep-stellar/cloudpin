import { describe, it, expect } from 'vitest';
import { isImageContentType } from '../../src/jobs/handlers/favicon';

describe('isImageContentType', () => {
  it('accepts common image types', () => {
    expect(isImageContentType('image/png')).toBe(true);
    expect(isImageContentType('image/jpeg')).toBe(true);
    expect(isImageContentType('image/jpg')).toBe(true);
    expect(isImageContentType('image/gif')).toBe(true);
    expect(isImageContentType('image/webp')).toBe(true);
    expect(isImageContentType('image/x-icon')).toBe(true);
    expect(isImageContentType('image/svg+xml')).toBe(true);
  });

  it('rejects non-image types', () => {
    expect(isImageContentType('text/html')).toBe(false);
    expect(isImageContentType('application/pdf')).toBe(false);
    expect(isImageContentType('')).toBe(false);
  });
});
