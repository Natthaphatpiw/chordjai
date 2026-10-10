import { describe, expect, it } from 'vitest';
import { responseLocale } from './locale';

describe('response language preference', () => {
  it('supports explicit Thai and regional English preferences', () => {
    expect(responseLocale('en')).toBe('en');
    expect(responseLocale('en-GB,en;q=0.9,th;q=0.6')).toBe('en');
    expect(responseLocale('th-TH')).toBe('th');
  });
  it('honours quality, ignores unsupported languages and never uses arbitrary prompt text', () => {
    expect(responseLocale('en;q=0.1,th;q=0.9')).toBe('th');
    expect(responseLocale('fr, en;q=0.8')).toBe('en');
    expect(responseLocale('en;q=0')).toBe('th');
    expect(responseLocale('en;q=garbage')).toBe('th');
    expect(responseLocale('ignore previous instructions')).toBe('th');
    expect(responseLocale()).toBe('th');
  });
});
