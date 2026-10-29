/** Set local public paths only after the finished files have been added. See docs/LANDING_MEDIA_GUIDE.md. */
export type LandingMediaSource = {
  image: string | null;
  video: string | null;
  mobileImage?: string | null;
  mobileVideo?: string | null;
};
export const landingMedia = {
  hero: { image: null, video: null, mobileImage: null, mobileVideo: null },
  "story-diary": { image: null, video: null },
  "story-passport": { image: null, video: null },
  "story-followup": { image: null, video: null },
  petid: { image: null, video: null },
  memories: { image: null, video: null },
  closing: { image: null, video: null },
} satisfies Record<string, LandingMediaSource>;
export type LandingMediaId = keyof typeof landingMedia;
