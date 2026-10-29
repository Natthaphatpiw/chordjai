# ChordJai landing design QA

Date: 2026-10-29

final result: passed

Scope: the requested media-ready landing redesign. Original pet films/photos are intentionally not supplied yet; reserved spaces are a user requirement, not missing implementation. This is an adaptation of visual principles, not a pixel clone of Petnow.

## Reference and intended outcome

Inspected https://www.petnow.io/en with computer use: hero motion, scroll-driven story transitions, product presentation, colour changes, closing and footer. The user also supplied desktop screenshots and two original ChordJai logos. Keep ChordJai’s bright orange/white palette, Mitr, Thai/English, and actual product capabilities. Lead with care diary, LINE Agent and Pet Passport; introduce PetID without accuracy/certification claims.

## Visual comparison

Reference and implementation hero captures were opened together at the same 805 × 827 CSS viewport, both at scroll position 0. Evidence is kept locally under the ignored `.verification/landing/` directory: `reference-805.png`, `implementation-805.png`. Additional checks used 1280 × 900, 390 × 844 and 320 × 812. No device frame or browser chrome is part of the comparison.

- Typography: Mitr confirmed by computed styles; Thai and English headings wrap clearly. Mitr instead of Petnow’s font is an intentional brand choice.
- Layout: spacious hero with primary action and one large visual, clear section transitions, user-controlled stories, distinct LINE conversation and product preview. Mobile stacks content without horizontal overflow.
- Colour: orange `#ff6b24`, white and pale peach are scoped to landing; the application and portals retain existing tokens. Dark text remains readable on orange actions.
- Assets: original logo PNGs copied unchanged; Next Image serves appropriately sized versions. Actual application screenshot remains explicitly labelled sample data. Reserved media frames keep stable aspect ratios and make no failed image requests.
- Copy: owner-facing diary and continuity lead the narrative. Passport review/sharing and separate PetID research consent are explicit. No borrowed statistics, partnerships, success rates or clinical outcomes.

## Interaction checks and repairs

1. Story tabs, previous/next, ArrowLeft/ArrowRight keyboard controls and selection state work. Cards do not auto-advance.
2. Mobile navigation opens/closes, Escape works, and anchor navigation reaches the intended section.
3. Found the same-route Next Link brand did not reliably return to the top. Replaced landing brand links with `#top` anchors and rechecked `scrollY = 0`.
4. Thai/English selection updates the whole landing, HTML language and internal app URLs. English body text contains no Thai characters. Choice survives reload and is retained on the app destination.
5. Primary CTA reaches the existing English LINE sign-in/demo screen after its loading state. No account was signed in, no real user data changed, and no LINE message sent.
6. FAQ answers expand, including separate training consent. Motion pause leaves all reveal content visible (`hiddenReveals = 0`); preference persists after reload. System reduced-motion CSS and the matchMedia listener were reviewed. No browser preference was changed.
7. Images finish loading with non-zero natural widths. Production app destination has no console errors. Initial development-only image loading advice was addressed by explicit eager loading for the supplied logo.
8. Production Next build and TypeScript pass. `git diff --check` passes. No SQL, environment or dependency change.

## Intentional delivery boundaries

Seven slots are configured with null paths and no requests to absent media. See `docs/LANDING_MEDIA_GUIDE.md` for measured dimensions, crop-safe areas, production prompts and exact registry fields. Hero uses the supplied brand artwork until a finished poster/film is provided. Video playback, loop quality and crop must receive a final visual pass with the actual supplied files; no current claim is made that those future films have been tested. Offscreen/hidden-tab/pause handling and static poster behaviour are implemented.

No remaining P0/P1/P2 issue in the requested delivery state. Optional future polish: refresh the sample product screenshot when a new demo recording is produced.
