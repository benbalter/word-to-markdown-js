---
name: Word to Markdown
description: A Word document typeset into clean Markdown, in the browser.
colors:
  paper: '#f6f5ef'
  paper-card: '#fffdf8'
  ink: '#0a1120'
  ink-card: '#111c30'
  navy: '#14213c'
  navy-soft: '#54607a'
  mist: '#9aa6bf'
  snow: '#f1f2f7'
  chartreuse: '#d0d820'
  chartreuse-deep: '#646a00'
  rule-light: '#e5e3d8'
  rule-dark: '#243049'
  alert-error: '#9f0712'
  alert-warning: '#7b3306'
typography:
  display:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: 'clamp(3rem, 8vw, 4.5rem)'
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: '-0.025em'
  headline:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: '1.875rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  title:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: '1.125rem'
    fontWeight: 500
    lineHeight: 1.55
  body:
    fontFamily: "'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif"
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.625
    fontFeature: "'ss01'"
  lead:
    fontFamily: "'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif"
    fontSize: '1.25rem'
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: '0.72rem'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: '0.22em'
  code:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: '0.82rem'
    fontWeight: 400
    lineHeight: 1.625
rounded:
  sm: '4px'
  md: '6px'
  lg: '8px'
  xl: '12px'
  2xl: '16px'
  full: '9999px'
spacing:
  control-x: '14px'
  control-y: '8px'
  cell-x: '20px'
  cell-y: '12px'
  card: '24px'
  dropzone-y: '56px'
  section: '80px'
components:
  button-secondary:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.navy}'
    typography: '{typography.body}'
    rounded: '{rounded.lg}'
    padding: '8px 14px'
  button-secondary-dark:
    backgroundColor: '{colors.ink-card}'
    textColor: '{colors.snow}'
    rounded: '{rounded.lg}'
    padding: '8px 14px'
  button-accent:
    backgroundColor: '{colors.chartreuse}'
    textColor: '{colors.navy}'
    rounded: '{rounded.lg}'
    padding: '8px 16px'
  button-accent-hover:
    backgroundColor: '{colors.chartreuse-deep}'
    textColor: '#ffffff'
  dropzone:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.navy}'
    rounded: '{rounded.2xl}'
    padding: '56px 24px'
  panel:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.navy}'
    rounded: '{rounded.xl}'
    padding: '12px 16px'
  panel-dark:
    backgroundColor: '{colors.ink-card}'
    textColor: '{colors.snow}'
    rounded: '{rounded.xl}'
    padding: '12px 16px'
  file-chip:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.navy-soft}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '8px 12px'
  eyebrow:
    textColor: '{colors.chartreuse-deep}'
    typography: '{typography.label}'
---

# Design System: Word to Markdown

## Overview

**Creative North Star: "The Typeset Diff"**

Every screen shows the product's one transformation: a document becomes Markdown. The serif (Fraunces, often italic) stands for the Word document, the world of editors and print. The monospace (JetBrains Mono) stands for the result, the world of repos and plain text. A clean grotesque (Hanken Grotesk) carries the body text between them. The wordmark spells this out: italic serif _Word_, a quiet sans _to_, monospace **Markdown**. Chartreuse marks the change, the way a diff highlights the lines that moved. It goes on the arrow, the output chip, the converted filename, and the accent dot on the Markdown panel.

The page is calm and editorial. It sits on warm document paper in light mode and deep navy-black ink in dark mode, which follows `prefers-color-scheme` automatically. A faint dot grid in light mode (a soft chartreuse glow in dark) adds texture to the top of the page without competing with the content. The layout is a single centered column with generous vertical space between sections. Density stays low because the visitor came to do one thing.

The controls stay quiet so the result can stand out. Buttons, cards and the dropzone are neutral, outlined surfaces until someone interacts with them; then they pick up chartreuse. The only filled chartreuse control is Copy Markdown, the next action after a successful conversion.

**Key Characteristics:**

- Three type families, each with a meaning: serif = document, mono = Markdown, sans = explanation.
- Navy plus a single chartreuse accent, in a light and a dark theme.
- Flat surfaces separated by 1px rules and tone. Shadows only show state.
- Consistent rounded corners (8px controls, 12px panels, 16px dropzone).
- Motion is limited to one staggered page-load reveal, plus hover and drag feedback, and all of it respects reduced motion.
- Built for 21 locales, including right-to-left and CJK.

## Colors

A warm paper and navy-ink palette with one electric chartreuse accent. Every color has a light-mode and dark-mode counterpart.

### Primary

- **Signal Chartreuse** (`chartreuse`): the accent for whatever changed or what to do next. Used for the hero arrow, the `.md` output chip, the converted filename, the Markdown panel dot, text selection, focus rings in dark mode, dropzone hover and drag-over, and the one filled button (Copy Markdown). It's legible on ink and on navy, but only about 1.4:1 on paper, so in light mode it may only fill a surface or appear as a tint (`/10`, `/40`), never as text or a focus ring.
- **Proof Olive** (`chartreuse-deep`): the light-mode stand-in for chartreuse wherever the accent has to meet contrast: eyebrow text, links, step numbers, icons, list markers, and focus rings on paper. It's also the hover fill for the accent button.

### Neutral

- **Document Paper** (`paper`): light-mode page background, a warm off-white rather than pure white.
- **Fresh Sheet** (`paper-card`): light-mode raised surfaces such as cards, panels, buttons and the dropzone, usually at 60 to 70% opacity over the dot grid.
- **Midnight Ink** (`ink`): dark-mode page background.
- **Ink Well** (`ink-card`): dark-mode raised surfaces.
- **Brand Navy** (`navy`): primary text and headings on paper, and the base color for borders on light controls (`navy/15`).
- **Slate Note** (`navy-soft`): secondary text on paper, such as taglines, descriptions, captions and the _to_ in the wordmark.
- **Mist** (`mist`): secondary text on ink.
- **Snow** (`snow`): primary text and headings on ink.
- **Paper Rule** / **Ink Rule** (`rule-light` / `rule-dark`): 1px borders, dividers and table rules in each theme.

### Status

- **Alert Red** (`alert-error`) and **Alert Amber** (`alert-warning`): the text colors of the error and warning alerts, which use Tailwind's red and amber scales rather than brand colors: a `-50` fill, `-300` border and `-800`/`-900` text in light mode; the `-500` hue at 10% fill and 40% border with `-200` text in dark mode. They're the only colors outside the brand palette, and only for alerts.

### Named Rules

**The Diff Highlight Rule.** Chartreuse marks only the transformation (the output, the arrow, the converted file) or the single next action. If it's on something unrelated to the result, take it off.

**The Paper Contrast Rule.** On paper, bright chartreuse may appear only as a fill or tint. Any accent text, icon, or focus ring on paper uses Proof Olive.

**The Theme Pair Rule.** Every color has a dark-mode partner (paper→ink, paper-card→ink-card, navy→snow, navy-soft→mist, rule-light→rule-dark, chartreuse-deep→chartreuse). A new surface isn't finished until both themes are set.

## Typography

**Display Font:** Fraunces (with Georgia, serif) **Body Font:** Hanken Grotesk (with system-ui, sans-serif) **Label/Mono Font:** JetBrains Mono (with ui-monospace)

**Character:** The serif adds warmth and a sense of editing. The mono adds precision and signals the developer world. The grotesque stays neutral so the other two can carry meaning. All three are self-hosted through the Astro Fonts API.

### Hierarchy

- **Display**: the single hero `<h1>`, which is the three-family wordmark. Mobile is 3rem and desktop is 4.5rem. Very tight leading, balanced wrapping.
- **Headline**: section headings ("What gets converted", FAQ). Fraunces semibold, 1.5rem on mobile and 1.875rem on desktop, centered, slightly tight tracking.
- **Title**: card, step, panel and dropzone titles, plus FAQ questions. Fraunces medium at 1rem to 1.25rem.
- **Lead**: the hero tagline. Hanken, 1.125rem on mobile and 1.25rem on desktop, Slate Note, about 36rem wide.
- **Body**: descriptions, table cells, FAQ answers. Hanken 0.875rem with relaxed leading, Slate Note or Mist.
- **Label**: eyebrows, panel headers, footnote captions, the Google Doc hint. JetBrains Mono at 0.6875 to 0.75rem (11 to 12px; never smaller), uppercase or widely tracked. Code never shows font ligatures (`font-variant-ligatures: none` on `code`, `pre`, `kbd`, `samp`), so `->` and `--` look exactly as they're copied.
- **Code**: Markdown output, inline `.docx`/`.md`, the Markdown elements in the conversion table. JetBrains Mono at 0.82rem.

### Named Rules

**The Three Voices Rule.** Serif is for things that read like a document (headings, titles). Mono is for things that are, or name, Markdown and files (output, extensions, labels). Sans is for everything else. Don't use mono just to look technical.

**The RTL Tracking Rule.** Tracked mono labels switch to the sans with normal letter spacing in right-to-left locales (`rtl:font-sans rtl:tracking-normal`), because tracking breaks Arabic letters apart. Every new tracked label needs the same override.

## Layout

There's one centered column. The page shell (header, main, footer) is at most 64rem wide with 24px side padding. Content blocks are narrower and centered: the hero, How It Works and FAQ are at most 48rem, and the converter, conversion table and CLI callout are at most 42rem. The hero is centered; other content is start-aligned.

Sections are separated by large vertical gaps (64px to 80px), not by background bands. Inside a section, spacing tightens to 16px to 32px. How It Works uses a three-column grid that collapses to one column on small screens, with each cell separated by a 1px rule. The results area places the Markdown and Preview panels side by side from the `lg` breakpoint and stacks them below it. Button rows wrap. Buttons use logical properties (`start`/`end`, `ms`/`me`), and directional icons flip in right-to-left locales (`rtl:-scale-x-100`).

## Elevation & Depth

The system is flat, and hairlines define it. Surfaces are told apart by tone (Fresh Sheet over Document Paper, Ink Well over Midnight Ink) and 1px Paper Rule / Ink Rule borders. The dropzone and some cards are slightly translucent with a light backdrop blur, so the dot grid shows through. Shadows appear only to show state or to lift something that genuinely floats.

### Shadow Vocabulary

- **Resting hairline** (`0 1px 2px rgba(20,33,60,0.04)`): the dropzone at rest, barely visible.
- **Drag glow** (`0 14px 40px -18px rgba(208,216,32,0.55)`): the dropzone while a file is dragged over it, together with a 1.2% scale-up and the icon nudging up 4px.
- **Floating banner** (Tailwind `shadow-lg`): the fixed language-suggestion banner, the only element floating above the page.
- **Promo lift** (`0 6px 18px rgba(0,0,0,0.35)` on hover): the Open & Async card, which rises 2px.

### Named Rules

**The State-Only Shadow Rule.** Nothing has a noticeable shadow at rest. A shadow means "this is responding to you" or "this floats above the page."

## Shapes

Corners are softly and consistently rounded, and the radius grows with the size of the container: 4px for inline code and footer links, 8px for buttons and file chips, 12px for panels, cards, tables, the FAQ and the promo, and 16px for the dropzone. Circles are used only for icon badges (the dropzone icon, step numbers) and status dots. Borders are always 1px, except the dropzone, which uses a 2px dashed border at rest and turns solid on hover, focus or drag-over: an empty slot waiting to be filled. Grouped content (How It Works, FAQ, the conversion table) shares one rounded outer border with internal 1px dividers, rather than separate floating cards.

## Components

### Buttons

Quiet by default, chartreuse when you interact.

- **Shape:** gently rounded (8px), with an icon and label separated by 8px.
- **Secondary (default):** Fresh Sheet fill with a `navy/15` border and Brand Navy text, 14px medium. In dark mode: Ink Well fill, `white/15` border, Snow text. Used for Download .md, Download .zip, Convert another file, and the CLI copy action.
- **Hover:** the border turns chartreuse and the fill gets a `chartreuse/10` tint, with a color transition only (no movement).
- **Accent (one per screen at most):** solid Signal Chartreuse with Brand Navy text, 14px semibold, and a light shadow. On hover the fill becomes Proof Olive with white text. It's Copy Markdown, the next action after a conversion; promotions never get it.
- **Focus:** the global 2px outline with a 2px offset, in Proof Olive on paper and Signal Chartreuse on ink.

### Dropzone (signature)

The main feature of the page. It's a large `<label>` that wraps a visually hidden file input, so clicking, keyboard use and dropping a file all work.

- **Rest:** a 16px radius, a 2px dashed rule border, translucent Fresh Sheet / Ink Well with backdrop blur, and a 56px circular chartreuse-tint icon badge (an arrow going into a document, never an upload arrow) above a Fraunces title, a "click to choose a file" link in Proof Olive, and a mono note with a lock icon giving the size limit and "never uploaded". The note stays visible while converting.
- **Hover / focus-within:** the border turns chartreuse (solid on focus) and the focus ring appears around the whole zone.
- **Drag-over:** a solid chartreuse border, a 9% chartreuse fill, the drag glow, a 1.2% scale-up and the icon lifting. Movement is removed under reduced motion.
- **Converting:** a progress cursor, and the icon becomes a chartreuse spinner (static under reduced motion).

### Cards / Containers

- **Corner Style:** 12px.
- **Background:** Fresh Sheet / Ink Well, often at 50 to 70% opacity.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** 1px Paper Rule / Ink Rule.
- **Internal Padding:** 24px for callouts, 20px × 12–16px for table cells and FAQ rows, 16px × 12px for result panels.

### Result Panels

Two matching panels, "Markdown" and "Preview." Each has a header strip containing a 10px status dot (chartreuse for Markdown, slate for Preview) and an uppercase mono label, separated from the body by a 1px rule. The Markdown body is a left-to-right, scrollable `<pre>` limited to 28rem tall. The Preview renders the Markdown with Tailwind Typography, styled with the brand fonts: Fraunces headings, Proof Olive list markers, chartreuse link underlines.

### File Chips

Small mono labels (`.docx`, `.md`) inside 8px-rounded chips, used in the hero's transformation strip. The input chip is neutral (rule border, Slate Note). The output chip is tinted chartreuse (`chartreuse/40` border, `chartreuse/10` fill, Proof Olive text): the diff highlight in miniature.

### Disclosure (FAQ)

A list of `<details>` rows inside one 12px-rounded bordered container with 1px dividers. The question is a Fraunces title; a Proof Olive chevron rotates 180° when the row opens.

### Navigation

The header has a mono `w2m`-style badge (chartreuse tint, 6px radius) next to a Fraunces wordmark, which is the home link. The footer is centered: the language list (current locale in Proof Olive), a row of text links whose underline fades in as chartreuse on hover, and a mono privacy tagline. A gradient hairline (`.rule`) separates the footer from the content.

### Open & Async Promo

A navy gradient card that keeps the same colors in both themes, with a faint commit-graph SVG motif behind the text, the book cover, a chartreuse dot label, and a chartreuse call to action. It's deliberately set apart from the converter's look and sits below it. After a successful conversion it's hidden and replaced by a quiet hairline row below the output: Slate Note text and a Proof Olive text link, with no fill and no button.

## Do's and Don'ts

### Do:

- **Do** use the three families for their meanings: Fraunces for document headings, JetBrains Mono for file names, Markdown and labels, and Hanken Grotesk for prose.
- **Do** pair every color with its dark-mode partner (The Theme Pair Rule) and test both themes.
- **Do** use Proof Olive (`chartreuse-deep`) for accent text, icons and focus rings on paper. Keep bright chartreuse for fills, tints and ink backgrounds.
- **Do** separate surfaces with 1px rules and tone, and group related items in one bordered container with internal dividers.
- **Do** keep the page's motion to the existing staggered `rise` reveal (0.7s, `cubic-bezier(0.16, 1, 0.3, 1)`) and short 0.15–0.18s state transitions, all disabled under `prefers-reduced-motion`.
- **Do** add `rtl:font-sans rtl:tracking-normal` to tracked mono labels and `rtl:-scale-x-100` to directional icons.
- **Do** style through classes or `element.style` from JS; the site's Content-Security-Policy blocks inline `style=""` attributes.

### Don't:

- **Don't** use bright chartreuse as text or an outline on paper; it's about 1.4:1 contrast.
- **Don't** add a second filled chartreuse button to a screen. The filled accent is reserved for the one next action.
- **Don't** give resting surfaces a shadow; shadows only show state or floating.
- **Don't** hard-code a near-white for dark-mode text; use Snow (`text-snow`, `var(--color-snow)`).
- **Don't** let the Open & Async promo take on the converter's styling or appear above the dropzone.
- **Don't** use mono just to look technical when the text isn't a file, code, Markdown, or a label.
