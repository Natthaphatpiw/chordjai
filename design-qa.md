# ChordJai — Kindness & Kinship design QA

Date: 10 October 2026. Scope: the existing Owner, Clinic, Admin and public/LIFF frontend. This is a production frontend redesign of the existing pilot, not a pixel clone of a reference website.

## Comparison truth and evidence

- Selected source: the user's Kindness & Kinship board, original `/var/folders/rx/64khk2hx5j32qytlzb6dt0fh0000gn/T/TemporaryItems/NSIRD_screencaptureui_7pgdl4/Screenshot 2569-10-10 at 11.21.34.png`; stable local evidence copy `.verification/reference-kindness-kinship.png` (1902 × 1130 pixels).
- The board is a palette/control/typography concept, not a mockup of an application route. There is no matching authenticated state or viewport to compare pixel-for-pixel. The user's explicit Sarabun instruction overrides the board's Quicksand/Inter labels. The written color tokens override the board's older swatch labels where their values differ.
- Browser-rendered local production screenshots: `.verification/cua-landing-desktop.jpg`, `.verification/chordjai-overview-production.jpg`, `.verification/cua-owner-{health,journal,chat,care,settings}-desktop.jpg`, and their mobile equivalents; `.verification/cua-landing-mobile.jpg`, `.verification/cua-owner-login-mobile.jpg`, `.verification/cua-clinic-login-{desktop,mobile}.jpg`, `.verification/cua-admin-login-mobile.jpg`.
- Authenticated Clinic/Admin screenshots use synthetic API fixtures in isolated browser contexts: `.verification/clinic-appointments-desktop.png`, `.verification/clinic-appointments-mobile.png`, `.verification/clinic-health-mobile.png`, `.verification/admin-overview-desktop.png`, `.verification/admin-clinics-mobile.png`, `.verification/admin-jobs-mobile.png`. They are test evidence, not real user or clinic activity.
- Successful public SSR states were also compared with the source board using synthetic loopback-only API fixtures: `.verification/public-share-{desktop,mobile}.png`, `.verification/public-lost-{desktop,mobile}.png`, `.verification/public-lost-tip-success-mobile.png`. Sarabun, readable summary rows, labeled tip inputs, successful submission, no overflow/broken images/pageerrors were verified; the temporary fixture server was then stopped.
- CSS viewports: Owner desktop 1440 × 1100, mobile 390 × 844; portal functional smoke desktop 1440 × 1000, mobile 390 × 844. The additional CUA clinic desktop capture uses 1280 × 720. Image pixels equal CSS pixels in these captures (density 1). Full-page screenshots extend vertically beyond their viewport; a fixed mobile navigation bar remains at the viewport's lower edge in such images.
- Combined full-view comparison opened and reviewed: `.verification/design-comparison.png` (1440 × 1800). The source board and five implementation regions are present together, each proportionally normalized into a 720 × 580 panel. Source and app states are explicitly different, so this comparison evaluates brand translation and hierarchy, not numerical pixel fidelity.
- Focused comparisons: the source board and full-size Owner journal mobile capture were opened in the same comparison input. Owner home, journal editor, personality dialog, mobile navigation, Clinic login and Admin login were also inspected at native browser size. Landing dog-photo and product sections were inspected after scrolling them into view; evidence `.verification/cua-landing-memory-desktop.jpg` and `.verification/cua-landing-product-mobile.jpg`.

## Findings

No actionable P0/P1/P2 visual or usability findings remain within this redesign scope.

### Required fidelity surfaces

1. **Fonts and typography:** all three layouts import Sarabun through `next/font/google`, with Thai/Latin subsets and weights 400/500/600/700. Computed browser body family is `Sarabun, "Sarabun Fallback"`. Thai headings wrap cleanly, functional form text stays 16px, and labels use readable weights. Mobile journal artwork scales as a canvas preview while its editing controls retain normal readable text.
2. **Spacing and layout rhythm:** the landing page uses an editorial photo/text composition, a real product screenshot, numbered horizontal feature stories, a memory section and one closing action. Functional screens use task lists, health timelines, actual appointment tables, forms and a journal canvas. Mobile stacking keeps navigation, save buttons, toggles and forms reachable. Every tested route/tab at 390px has no horizontal document overflow.
3. **Colors and visual tokens:** `frontend/shared/tokens.css` contains the supplied palette, including surface `#fdf9f3`, white `#ffffff`, primary `#9b4500`, orange container `#ff8c42`, peach `#ffdbc9`, and semantic mint/blue/error colors. The dark warm primary is used for readable white action text; peach marks selected/supporting areas. White/off-white dominate the screens. Thin warm dividers, modest radii and consistent focus states translate the board without copying its panel grid into every screen.
4. **Image quality and asset fidelity:** real cat and dog photos were found with Google Images through computer use, opened at their original Unsplash pages, downloaded and saved as local WebP files. Subjects and crops were checked on desktop/mobile. There are no decorative emoji, generated dashboard pictures or borrowed reference-site artwork. The marketing product image is a 1440 × 1100 capture of this app's production build in explicitly labeled demo mode. Lucide supplies a consistent library of UI icons and journal decoration symbols. Live pets without a photo retain a species symbol rather than a stock image posing as their pet.
5. **Copy and content:** Thai copy describes concrete care tasks, permission choices, journal actions and assistant memory. Demo data is labeled. AI notices explain login/demo boundaries without asking end users to configure API keys. No invented testimonials, medical success rates, customer statistics or clinic locations appear in the product. Admin counters reflect API responses; fixtures are used only for verification.

### Interaction and accessibility evidence

- Owner smoke: all six sections at desktop/mobile, health entry and emergency triage, journal drag/keyboard movement/save/reload, AI demo boundary, personality and opt-in memory, PetID owner/finder states, permissions and deletion confirmation, offline emergency, and public error/invitation/legal pages.
- Clinic/Admin smoke: appointment acceptance and authorized health summary, memberships/logout, AI request filtering, background-job replay and clinic creation. Actual forms and result-state rendering were verified with isolated fixtures.
- Modal dialogs use native dialog focus containment and Escape close. Inputs have labels, icon-only controls have accessible names, images have contextual alt text, and reduced-motion styling remains available.
- Browser automation reported zero pageerrors. Provider calls, LINE login and production customer data were excluded from these UI tests.

## Comparison history

Before the final combined comparison, the implementation was refined to keep portal navigation's active item visible on narrow screens, move the Clinic photo caption clear of the dog's face, raise small functional labels to 14px, remove operator setup instructions from consumer copy, and return to the top on login/demo/live mode changes. Native-size browser inspection confirmed the final composition and the Owner mode transition at scrollY 0.

The first long landing capture showed a blank below-the-fold dog area because the lazy image had not yet entered the viewport. This was a capture-state mismatch, not a rendering defect: after scrolling to the memory heading, the image was complete with naturalWidth 874. Both full-page captures were replaced with loaded-image evidence before acceptance. No code fix was needed for this capture issue.

## Implementation checklist and residual limits

- Shared palette and Sarabun applied to all existing frontend routes.
- Local licensed photos and a production app screenshot installed.
- Decorative emoji removed from app defaults; user-authored historic content remains intact.
- Desktop/mobile visual and interaction verification completed.
- Unit, TypeScript, production builds, isolated service startup, and temporary-database tests passed; see `docs/VERIFICATION.md`.
- A live LINE/iOS/Android/provider acceptance run still depends on the user's production credentials and is not claimed by this frontend QA. PetID accuracy and medical evaluation are separate requirements recorded in `docs/FEATURES.md`.

**Follow-up polish:** no blocking polish items. Additional brand photography can be added later using the same licensed-asset workflow.

final result: passed
