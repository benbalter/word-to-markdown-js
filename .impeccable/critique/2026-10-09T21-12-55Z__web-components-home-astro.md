---
target: web/components/Home.astro
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/benbalter/projects/word-to-markdown-js/web/components/Home.astro"
target_fingerprint: "sha256:df6b6fd9740f6827f089c6343711cd1cf99f749b9439fa49ed0a5a3321e23f55"
target_path: /Users/benbalter/projects/word-to-markdown-js/web/components/Home.astro
timestamp: 2026-10-09T21-12-55Z
slug: web-components-home-astro
---
Method: dual-agent (A: design review · B: detector + browser), each run independently

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Results show up about 500px down (about 680px on mobile); nothing scrolls them into view |
| 2 | Match System / Real World | 3 | Step 1 is called "Upload" two sections after "never uploaded"; warnings show raw parser text like w:someUnknownElement |
| 3 | User Control and Freedom | 3 | "Convert another" works; the converter's options (footnotes, bullets) can't be changed in the UI |
| 4 | Consistency and Standards | 3 | The one filled chartreuse button is the book promo, not Copy, which breaks DESIGN.md's own rule |
| 5 | Error Prevention | 3 | The 20 MB limit only appears as an error, and the FAQ says "no file limits" |
| 6 | Recognition Rather Than Recall | 4 | The Google Docs and .doc instructions appear right where they're needed |
| 7 | Flexibility and Efficiency | 2 | No paste-to-convert, no copy shortcut, one file at a time; the CLI callout partly makes up for it |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, but the hero is tall and the dark promo card sits right at the fold |
| 9 | Error Recovery | 4 | The .doc error is specific, tells you the fix, and can be dismissed |
| 10 | Help and Documentation | 3 | The FAQ is thorough; the README's list of what doesn't convert isn't linked |
| Total | | 31/40 | Good |

## Design Specificity Verdict
Built for this product: the three-typeface wordmark is the conversion itself, the .docx → .md chips repeat it, and chartreuse marks the output. Generic parts: the "Trusted since 2014" shield badge and the three-step How it works grid. Detector: the source scan found 1 advisory (a false positive: the w2m badge size is within DESIGN.md's label range). The built-page scans found 63 findings each, mostly noise (hashed font names, opacity variants of documented colors, grouped containers meant to have no inner padding). Real ones: undocumented error/warning colors (Tailwind red/amber) and the promo's #1c1d3e, 11 em dashes, and the w2m badge at 10.88px. Overlay: blocked by the page's CSP, so no overlay.

## Priority Issues
- [P1] The promo has the only filled button on the results screen. Fix: make Copy Markdown the filled chartreuse button; turn the results aside (Converter.astro:240) into a quieter row or link after the panels. /impeccable distill
- [P1] JetBrains Mono ligatures draw -> and -- as combined symbols in the output, so the screen doesn't match the copied bytes. Fix: font-variant-ligatures: none on #output and preview pre/code. /impeccable typeset
- [P2] Results appear below a full-height hero (about 680px down on mobile); the filename heading breaks mid-word. Fix: collapse the hero or scroll the results into view after success; give the filename its own line. /impeccable layout
- [P2] The word "Upload" and the upload icon contradict the privacy promise. Fix: rename the step "Drop"/"Choose", use a document icon, and add a "Stays on this device" line inside the dropzone that stays while converting. /impeccable clarify
- [P2] Warnings are technical and English-only (src/main.ts:746). Fix: map Mammoth messages to plain, localized categories with the detail behind a disclosure; move the strings into web/i18n. /impeccable harden

## Persona Red Flags
- Jordan (first-timer): the "Upload" wording raises doubt about privacy; the 20 MB limit contradicts the FAQ; after converting, the most prominent button is a book.
- Casey (mobile): the hero takes the first 540px; output is off screen after converting; the stacked panels scroll inside the page; "Drop" wording doesn't fit touch.
- Sam (keyboard/screen reader): the promo is the first tab stop after the file input, and its accessible name is the whole marketing paragraph; no skip link (minor).
- Dev (docs-as-code): ligatures misrepresent output; no visible options; no link to the list of what's dropped.

## Minor Observations
"Trusted since 2014" with a shield looks like a security seal; the eyebrow line leaves "BROWSER" alone on mobile; the promo card is the darkest thing in light mode; superscript shows as raw <sup> in a table promising clean GFM; red/amber aren't in DESIGN.md; 11 em dashes; How it works repeats the dropzone.

## Questions to Consider
Should the dropzone own the first screen instead of the hero? Should success end with no ask? Should pasting rich text be a primary input?
