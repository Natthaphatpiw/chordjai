# ChordJai landing and Product design QA

Date: 2026-10-30

Final result: passed

Scope: install the seven supplied landing media assets and add a bilingual `/product` page with actual LINE/LIFF screenshots in responsive phone frames. This continues the Petnow-inspired storytelling direction delivered on 2026-10-29, retaining ChordJai’s bright orange/white/peach palette, Mitr and product positioning.

## Media and visual fidelity

- All seven supplied originals are preserved in the workspace. Web delivery copies contain four silent H.264 MP4s, four extracted posters and three WebP stills, totalling 2,685,728 bytes (79.7% below the originals).
- Hero, PetID and follow-up films retain their delivered 640 × 360 landscape dimensions. Memories retains 360 × 640 portrait dimensions. The landing frames match these ratios instead of forcing portrait clips into landscape frames.
- Closing now uses the supplied image’s 2:1 ratio, preserving the owner’s head and the pets’ paws. Diary and Passport stills retain 4:3 composition. Posters were inspected with beginning, middle and ending film frames; the supplied films are not claimed to be pixel-perfect loops.
- The original ChordJai logo remains in the shared marketing navigation. All alt text now describes the installed scenes instead of reserved media.
- The new Product page presents care diary, LINE assistant, Pet Passport, memory book and PetID. Phone frames are structural borders, with no fabricated operating-system status bars or controls. Screenshots keep their natural aspect ratio.

## Real screenshot capture and privacy

Captured with computer use from the signed-in ChordJai LINE Desktop app and actual LIFF interface. Ten reviewed WebP files cover five features in Thai and English (312,128 bytes total).

- Thai LINE image is a cropped excerpt of actual bot replies; its caption explicitly identifies LINE Desktop. It excludes other chats, the owner profile, private health/cost details and raw link tokens.
- English assistant image is the actual LIFF memory-controls interface, described accurately in its caption. No translated or fabricated LINE conversation is presented as a capture.
- Other images show empty diary/Passport/PetID forms and a memory-book cover. English UI retains the original pet’s proper name. No private memory page is published.
- PetID was recaptured after identifying that document-coordinate clipping at a scrolled page could catch an incomplete dialog. Both final locale images show the stable registration dialog and passed source-versus-render review.
- No record, chat message, Passport session, upload or consent change was submitted during capture. Full-window LINE evidence stays under ignored `.verification/`; only reviewed crops are in public assets.

Detailed provenance and dimensions: `docs/PRODUCT_SCREENSHOTS.md`. Actual landing mapping and replacement instructions: `docs/LANDING_MEDIA_ASSETS.md`.

## Browser and production-build verification

1. Inspected the Product page at 1280 × 900 and 390 × 844. No horizontal overflow; Thai/English copy, spacing and phone images render clearly. Earlier landing reference comparison and small-screen checks are retained in Git history.
2. Landing “Meet ChordJai” opens `/product?lang=en`. Product home links return to the landing with the locale retained. Feature anchors clear the fixed header. Mobile menu opens/closes and Escape dismisses it. Product return-to-top reaches `scrollY = 0` and `#top`.
3. English Product DOM contains no Thai copy; all five screen sources use English images. Pet proper names inside genuine captures remain unchanged. Locale changes update HTML language and app links.
4. With motion enabled, the supplied Hero plays muted at 640 × 360; current time advances. Pausing motion removes videos, retains posters and leaves all reveal content visible (`hiddenReveals = 0`). Existing reduced-motion and offscreen playback controls remain in place.
5. Local production server serves landing and both Product locales with HTTP 200. All eleven landing delivery files return correct media types; Hero byte-range requests return 206. Loaded phone images have non-zero natural dimensions.
6. Owner-app TypeScript and production Next build pass, including the new `/product` route. The production browser check reports no console errors. `git diff --check` passes. No SQL, environment or dependency change is required.
7. Independent final review found no remaining P0/P1/P2 issue in navigation, locale, captions, privacy or media configuration.

Representative evidence is stored locally in ignored `.verification/product/`: desktop Thai and mobile English Product captures. These are evidence files, not public product assets.

## Product truthfulness

Care diary and continuity lead the narrative. Passport requires owner review before sharing; follow-ups remain opt-in. PetID is described as assisted matching with owner confirmation, with separate training consent, without certification, measured-accuracy, partnership or clinical-outcome claims. Supplied promotional pet films are not biometric training/evaluation data or proof of identity.
