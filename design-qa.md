# ChordJai bright orange + Mitr + bilingual QA

**Source visual truth**
- Existing source UI capture: `/Users/natthaphat/Downloads/pettech/.verification/bright-before-owner.png`.
- Latest user direction overrides the earlier muted Kindness & Kinship colors and Sarabun: cheerful vivid orange, playful loopless Mitr, Thai/English choice throughout. Existing layout and real licensed pet imagery remain the source composition. This is a scoped refinement, not a literal color/font match to the old screen.

**Implementation evidence**
- Same-frame comparison: `.verification/bright-final-owner-th.png`; source and implementation are both 1280×720 CSSpx/PNGpx, density 1, owner demo Home/Tofu, no crop/normalization. Source and implementation were emitted together in one computer-use comparison input.
- Product captures: `.verification/bright-product-th.png` and `bright-product-en.png`,1440×1100 CSSpx/PNGpx, density 1, same demo Home state. These are saved as separate local marketing WebPs.
- Mobile English: `.verification/bright-owner-en-mobile.png`,390×844 CSS viewport, density 1, full-page screenshot. Portal/public/UI runner screenshots in `.verification/` cover every existing route/tab in bothlanguages.
- The1280px comparison is legible at native resolution for logo, headings, controls and body text; fonts/spacing/photo crop were inspected at 1:1. A separate magnified source region is unnecessary because these important details are already readable.

**Findings and comparison history**
- Initial P2: the earlier darkbrown-orange palette felt muted. Replaced action/selected-state fills with vivid`#ff8a24`, lighter white/peach surfaces and dark labels. Final1280px comparison shows the intended brightselection/brand treatment while retaining readable content. Accepted intentional color change.
- Initial P2: Sarabun did not express the requested playful character. Mitr is now loaded on all3frontends via next/font/google, Thai and Latin,400/500/600. Computed browser family isMitr, body 400; display weight varies500/600. Accepted intentional typography change.
- P2 during verification: newly captured marketing assets returned404 because the local production server started before those files existed. Restarted owner after saving both assets; reran owner and public runners, both pass with loaded local images. This was local inventory timing; bothfiles are included before deployment build.
- P2 independent review: English PetID still had a Thai server notice and Thai insufficient-photo UI could get Englishquality explanations. Localized notice/quality feedback while keeping all embedding facets English. Unit provider request assertions pass.
- Review finding: existing English medication backstop missed spelled six/seven doses. Extended matcher and regression cases; unit checks pass. No clinical quality claim is inferred from the safety filter.
- Test-only failures: portal alert matchedNext's route announcer, and rerendered form implicit label included textarea content. Scoped test selectors; actual forms, notices, permissions and state preservation pass.

**Required fidelity surfaces**
1. Fonts/typography: actualMitr family confirmed on desktop/mobile, Thai/Latin, readable body 400, clear display hierarchy 500/600; no Sarabun runtimefont. All UI uses the sharedfamily. User-selected journal serif/handwritten styles remain editable contentchoices.
2. Spacing/layout rhythm: same1280px composition preserves photo/sidebar/content relationships; language picker fits headers. At 390px all 6 owner areas, 7 portal tabs and 7 public routes are reachable without horizontal document overflow. Selected mobile navigation remains visible.
3. Colors/tokens: shared white/peach backgrounds, vivid orange buttons/logo/selections, semanticmint/blue/error remain meaningful. Dark`#3a210d` on orange`#ff8a24` computes 6.35:1; secondary body text 7.15:1 on paper. White on orange was rejected at 2.36:1. This verifies these named pairs, not every possible custom journal color or an entire WCAG audit.
4. Imagequality/assets: original licensed cat/dog WebPs preserved with intentional crops. Actual new Thai/English app captures load locally; English marketing image contains English system text. No new emoji, CSS illustration or handmade SVG assetsubstitutions. Existing icon library graphics remain functional.
5. Copy/content: all system/sample UI, ARIA/placeholders/statuses/date formatting/legal pages/metadata translate to a single selectedlanguage. Static English demo has zero Thai text. Authored names, clinical record titles/notes and previously saved content remain original. New AI responses receive the selected language; no live AI quality test without the key.

**Interactions and verification**
- Owner: all 6 tabs, health entry, emergency triage fallback, drag/keyboard/edit/save/reload journal, memory opt-in/settings, PetID owner/finder, invite, public routes and language-switch preservation of unsaved text/title/positions.
- Clinic/admin: all 7 tabs, grants/roles, accepted appointment, completed jobs filter/replay, clinical summary, clinic creation, native validation, notices/errors/forms/checkbox/tab preservation and localized errors. All mutations used local fixtures only.
- Public: marketing +privacy/terms/AI/emergency/invite/share/lost, success/unavailable states, translated tip confirmation, unsent draft preservation, SSR html/lang/title/description, localized links, and both-language offline emergency reloads.
- 84 unit + 19 isolated HTTP tests passed; DB security/HNSW/upgrade/concurrency suite passed; workspace TypeScript and3 production builds passed. Browser exception lists empty. No production data or LINE/OpenAI calls were used for functionalfixtures.

**Open questions / residual test gaps**
- No actionable P0/P1/P2 remain. Live LINE sign-in and generated AI quality require the user's configured credentials and are outside this visual/language verification; provider prompts are tested with mocks.
- Choosing another language does not rewrite historical authored or saved AI content. New UI/system responses follow the selection.

**Implementation checklist**
- Shared tokens/Mitr/locale provider and 3 SSR proxies implemented.
- Every existing frontend/public/LIFF surface localized.
- Actual bilingual product screenshots saved.
- Local visual/interaction/SSR/offline verification passed.
- Commit/push followed by Vercel production check is the final delivery step.

**Follow-up polish**
- Optional usability testing withThai/English pet owners can assess preference for this brighter brand. No unsupported behavioral claim is made about the pets themselves.

**Final result:** passed
