/** Set local public paths only after the finished files have been added. See docs/LANDING_MEDIA_GUIDE.md. */
export type LandingMediaSource = {
  image: string | null;
  video: string | null;
  mobileImage?: string | null;
  mobileVideo?: string | null;
};
export const landingMedia = {
  hero: {
    image: "/landing/hero.webp",
    video: "/landing/hero.mp4",
    mobileImage: null,
    mobileVideo: null,
  },
  "story-diary": { image: "/landing/story-diary.webp", video: null },
  "story-passport": { image: "/landing/story-passport.webp", video: null },
  "story-followup": {
    image: "/landing/story-followup.webp",
    video: "/landing/story-followup.mp4",
  },
  petid: { image: "/landing/petid.webp", video: "/landing/petid.mp4" },
  memories: { image: "/landing/memories.webp", video: "/landing/memories.mp4" },
  closing: { image: "/landing/closing.webp", video: null },
} satisfies Record<string, LandingMediaSource>;
export type LandingMediaId = keyof typeof landingMedia;
