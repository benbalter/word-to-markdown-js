# scripts/

One-off maintenance and content-generation scripts. The `gen:*` scripts call
Azure OpenAI (AI Foundry) and are **credit-funded** — run them when you have
Azure credit to spend; the committed outputs keep working without it.

## Azure Foundry environment

The `gen:*` scripts read (see `lib/azure.mjs`):

```
AZURE_OPENAI_ENDPOINT      # https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY       # resource key
AZURE_OPENAI_DEPLOYMENT    # chat model deployment name, e.g. gpt-4o
AZURE_OPENAI_API_VERSION   # optional, defaults to 2024-08-01-preview
```

Every raw model response is written under `scripts/.gen-cache/` **before**
parsing, so the outputs can be re-processed offline. That folder is gitignored
and stays local. The one generated input that is committed is
`scripts/eval-specs/`, the parsed document specs `gen:fixtures` builds from.

## Eval corpus (golden regression suite + quality report)

Adversarial `.docx` fixtures + golden Markdown snapshots + an LLM-judged quality
report. Fixtures are generated from LLM specs and only kept if the real converter
can read them (round-trip guard).

```bash
node scripts/spike.mjs        # sanity: build+convert one hand-written fixture
npm run gen:specs             # A1 (credits): LLM → scripts/eval-specs/*.json
npm run gen:fixtures          # A2: specs → src/__fixtures__/eval/*.{docx,md}
npm run gen:judge             # A3/A4 (credits): score fidelity → docs/converter-quality-report.md
```

The suite is asserted by `src/__tests__/eval-corpus.test.ts`. To intentionally
refresh goldens after a deliberate converter change, re-run `npm run gen:fixtures`.

## i18n translation

Structure-preserving translation of `web/i18n/en.json` into new locales (leaf
values only, with a back-translation QA pass). Guarantees the parity enforced by
`src/__tests__/i18n-completeness.test.ts`.

```bash
npm run gen:i18n              # B1 (credits): writes web/i18n/<locale>.json
# then wire up each locale (see web/i18n/README.md): an entry in
# web/i18n/locales.ts and a dictionaries import in web/i18n/index.ts
```

## Social cards

`gen-og.mjs` renders `public/og/<locale>.png` (2400×1260) for every locale in
real Chrome against the built site, using the self-hosted brand fonts and each
locale's `eyebrow`/`tagline`. No credits needed. Outputs are committed: non-Latin
scripts fall back to system fonts, so renders differ by machine. Eyeball the
results after regenerating.

```bash
npm run build:site && npm run gen:og
```

## Other

- `make-fixtures.mjs` — regenerates the hand-authored synthetic `.docx` fixtures.
- `check-builds.sh` — CI guard that the TypeScript build succeeds.
