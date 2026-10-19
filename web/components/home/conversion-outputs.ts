// Markdown output for each row of the "What gets converted" table. Universal
// syntax, so it isn't translated; pairs with t.conversionRows by index — the
// two arrays must stay the same length. Shared by ConversionTable.astro and
// the home page's Markdown twin (web/agent/markdown.ts).
export const conversionOutputs = [
  '# Heading',
  '**bold** *italic*',
  '1. item · - item',
  '| a | b |',
  '[text](url)',
  '`code`',
  '![alt](image)',
  '~~text~~',
  'x<sup>2</sup>',
  'text[^1]',
];
