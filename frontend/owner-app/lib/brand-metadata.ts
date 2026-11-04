import type { Metadata } from 'next';
import type { Locale } from '../../shared/locale-core';

export const SITE_ORIGIN = 'https://www.chordjai.life';
export const brandPreview = {
  url: `${SITE_ORIGIN}/brand/chordjai-social.png`,
  width: 1200,
  height: 630,
  alt: 'ChordJai dog and cat logo',
};

export function brandSocialMetadata({ title, description, locale, path }: {
  title: string;
  description: string;
  locale: Locale;
  path?: string;
}): Metadata {
  const url = path === undefined ? undefined : `${SITE_ORIGIN}${path}`;
  const canonical = url && (locale === 'en' ? `${url}?lang=en` : url);
  return {
    title,
    description,
    ...(url ? { alternates: {
      canonical,
      languages: { th: url, en: `${url}?lang=en`, 'x-default': url },
    } } : {}),
    openGraph: {
      type: 'website', title, description, siteName: 'ChordJai',
      locale: locale === 'en' ? 'en_US' : 'th_TH',
      ...(canonical ? { url: canonical } : {}),
      images: [brandPreview],
    },
    twitter: { card: 'summary_large_image', title, description, images: [brandPreview.url] },
  };
}
