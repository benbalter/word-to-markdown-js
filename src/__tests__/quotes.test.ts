import { convertHtml } from '../main.js';

// Chinese quotation marks (“”‘’) use the same code points as the curly quotes
// Word writes for English, so they can only be told apart by context: the
// default keeps them in mostly-Chinese text and converts them everywhere else.

const CHINESE =
  '会议指出：“各单位要按照《通知》要求，认真‘自查’，并及时上报。”';
const ENGLISH = 'He said, “hello” and it’s fine.';

describe('curly quotes', () => {
  it('keeps Chinese quotation marks in mostly-Chinese text by default', async () => {
    expect(await convertHtml(`<p>${CHINESE}</p>`)).toBe(CHINESE);
  });

  it('converts them in English text by default', async () => {
    expect(await convertHtml(`<p>${ENGLISH}</p>`)).toBe(
      `He said, "hello" and it's fine.`,
    );
  });

  it('converts them when the Chinese text is too short to count as Chinese', async () => {
    expect(await convertHtml('<p>他说：“你好”</p>')).toBe('他说："你好"');
  });

  it('treats kana text as Japanese and converts its quotes', async () => {
    expect(await convertHtml('<p>これは“テスト”です</p>')).toBe(
      'これは"テスト"です',
    );
  });

  it('keeps curly quotes in a mostly-Chinese document even around English words', async () => {
    const mixed = '会议指出：“请提交 report”，并注明 “draft” 状态。';
    expect(await convertHtml(`<p>${mixed}</p>`)).toBe(mixed);
  });

  it('converts Chinese quotes with quotes: "ascii"', async () => {
    expect(
      await convertHtml(`<p>${CHINESE}</p>`, { quotes: 'ascii' }),
    ).toBe('会议指出："各单位要按照《通知》要求，认真\'自查\'，并及时上报。"');
  });

  it('keeps English curly quotes with quotes: "preserve"', async () => {
    expect(
      await convertHtml(`<p>${ENGLISH}</p>`, { quotes: 'preserve' }),
    ).toBe(ENGLISH);
  });

  it('normalizes non-breaking spaces whatever the quote style', async () => {
    const html = '<p>a\u00A0b “quoted”</p>';
    expect(await convertHtml(html, { quotes: 'preserve' })).toBe(
      'a b “quoted”',
    );
    expect(await convertHtml(html, { quotes: 'ascii' })).toBe('a b "quoted"');
  });
});
