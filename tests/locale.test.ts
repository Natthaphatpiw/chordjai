import { describe, expect, it } from 'vitest';
import { asLocale, localizedHref, translate } from '../frontend/shared/locale-core';

describe('localized navigation', () => {
  it('preserves other query parameters and fragments for invitation and public links', () => {
    expect(localizedHref('/invite/example?source=line#accept', 'en')).toBe('/invite/example?source=line&lang=en#accept');
    expect(localizedHref('/emergency?lang=th', 'en')).toBe('/emergency?lang=en');
  });
  it('never modifies API, external or protocol-relative links', () => {
    expect(localizedHref('/api/v1/pets', 'en')).toBe('/api/v1/pets');
    expect(localizedHref('//other.example/path', 'en')).toBe('//other.example/path');
    expect(localizedHref('https://liff.line.me/example', 'en')).toBe('https://liff.line.me/example');
  });
  it('only accepts supported locale identifiers and selects a complete translation', () => {
    expect(asLocale('EN')).toBeUndefined();
    expect(asLocale('en')).toBe('en');
    expect(translate('en', 'สมุดสุขภาพ', 'Health records')).toBe('Health records');
  });
});
