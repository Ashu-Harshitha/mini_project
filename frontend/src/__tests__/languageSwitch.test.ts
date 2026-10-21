import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';

describe('Language Switch & Localization (en, hi, kn)', () => {
  it('initializes with default or fallback language', () => {
    expect(['en', 'hi', 'kn']).toContain(i18n.language);
  });

  it('switches to Hindi and translates keys accurately', async () => {
    await i18n.changeLanguage('hi');
    expect(i18n.language).toBe('hi');
    expect(i18n.t('nav.dashboard')).toBe('डैशबोर्ड');
    expect(i18n.t('nav.newCase')).toBe('नया केस');
  });

  it('switches to Kannada and translates keys accurately', async () => {
    await i18n.changeLanguage('kn');
    expect(i18n.language).toBe('kn');
    expect(i18n.t('nav.dashboard')).toBe('ಡ್ಯಾಶ್‌ಬೋರ್ಡ್');
    expect(i18n.t('nav.newCase')).toBe('ಹೊಸ ಪ್ರಕರಣ');
  });

  it('switches back to English accurately', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
    expect(i18n.t('nav.newCase')).toBe('New Case');
  });
});
