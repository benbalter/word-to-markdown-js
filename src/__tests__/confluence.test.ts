import { toConfluenceWiki } from '../confluence.js';
import convert, { markdownToConfluence } from '../main.js';

describe('toConfluenceWiki', () => {
  it.each([
    ['# Title', 'h1. Title'],
    ['###### Six', 'h6. Six'],
    ['**bold** and _em_ and ~~gone~~', '*bold* and _em_ and -gone-'],
    ['---', '----'],
    ['[site](https://example.com)', '[site|https://example.com]'],
    ['<https://example.com>', '[https://example.com]'],
    ['x<sup>2</sup> H<sub>2</sub>O', 'x{^}2{^} H{~}2{~}O'],
    ['a <sup>2</sup> b', 'a ^2^ b'],
    ['<u>under</u>', '+under+'],
  ])('renders %j as %j', (markdown, expected) => {
    expect(toConfluenceWiki(markdown)).toBe(expected);
  });

  it('braces formatting mid-word, as Confluence requires', () => {
    expect(toConfluenceWiki('un**believ**able')).toBe('un{*}believ{*}able');
  });

  it('escapes prose that would otherwise become markup', () => {
    expect(
      toConfluenceWiki(
        'Use {name} and [x] or a|b. Wow !img! and (i) :) C:\\dir -struck- ',
      ),
    ).toBe(
      'Use \\{name\\} and \\[x\\] or a\\|b. Wow \\!img! and \\(i) \\:) C:&#92;dir \\-struck\\-',
    );
  });

  it('leaves hyphenated words and lone dashes alone', () => {
    expect(toConfluenceWiki('word-to-markdown, a - b')).toBe(
      'word-to-markdown, a - b',
    );
  });

  it('escapes a paragraph that would start a list or heading', () => {
    expect(toConfluenceWiki('\\- not a list')).toBe('\\- not a list');
    expect(toConfluenceWiki('h1\\. not a heading')).toBe('\\h1. not a heading');
  });

  it('turns soft line breaks into spaces and hard breaks into newlines', () => {
    expect(toConfluenceWiki('one\ntwo')).toBe('one two');
    expect(toConfluenceWiki('one\\\ntwo')).toBe('one\ntwo');
  });

  it('writes inline code with entities so Confluence reads nothing in it', () => {
    expect(toConfluenceWiki('`a{b}|*c*`')).toBe(
      '{{a&#123;b&#125;&#124;&#42;c&#42;}}',
    );
  });

  it('nests mixed lists with combined markers', () => {
    expect(toConfluenceWiki('- one\n- two\n  1. a\n  2. b\n- three')).toBe(
      '* one\n* two\n*# a\n*# b\n* three',
    );
  });

  it('keeps a list item with several paragraphs on one line', () => {
    expect(toConfluenceWiki('1. first\n\n   more\n2. second')).toBe(
      '# first \\\\ more\n# second',
    );
  });

  it('moves a code block out of a list item, which cannot hold it', () => {
    expect(toConfluenceWiki('1. step\n\n   ```\n   run\n   ```\n2. next')).toBe(
      '# step\n# next\n\n{noformat}\nrun\n{noformat}',
    );
  });

  it('writes tables with a header row and line breaks in cells', () => {
    expect(
      toConfluenceWiki(
        '| a | b |\n| - | - |\n| one<br>two | x\\|y |\n|  | z |',
      ),
    ).toBe('||a||b||\n|one \\\\ two|x\\|y|\n| |z|');
  });

  it('uses {code} for languages Confluence knows and {noformat} otherwise', () => {
    expect(toConfluenceWiki('```js\nconst a = {};\n```')).toBe(
      '{code:language=javascript}\nconst a = {};\n{code}',
    );
    expect(toConfluenceWiki('```\nplain {x}\n```')).toBe(
      '{noformat}\nplain {x}\n{noformat}',
    );
    expect(toConfluenceWiki('```brainfuck\n+++\n```')).toBe(
      '{noformat}\n+++\n{noformat}',
    );
  });

  it('keeps code from closing its own block', () => {
    expect(toConfluenceWiki('```\na\n{noformat}\n{html}x{html}\n```')).toBe(
      '{noformat}\na\n{\u200Bnoformat}\n{html}x{html}\n{noformat}',
    );
    expect(toConfluenceWiki('```js\n{code}\n```')).toBe(
      '{code:language=javascript}\n{\u200Bcode}\n{code}',
    );
  });

  it('keeps an image path from breaking out of the image', () => {
    expect(toConfluenceWiki('![](<images/a!b|c d.png>)')).toBe(
      '!a%21b%7Cc%20d.png!',
    );
  });

  it('drops links and images with unsafe schemes, keeping the text', () => {
    expect(toConfluenceWiki('[click](javascript:alert(1))')).toBe('click');
    expect(toConfluenceWiki('[x](https://e.com/{html})')).toBe(
      '[x|https://e.com/%7Bhtml%7D]',
    );
    expect(toConfluenceWiki('![x](javascript:alert(1))')).toBe('');
    expect(toConfluenceWiki('[mail](mailto:a@example.com) [top](#top)')).toBe(
      '[mail|mailto:a@example.com] [top|#top]',
    );
  });

  it('keeps a LaTeX block verbatim', () => {
    expect(toConfluenceWiki('$$\nx_1^2\n$$')).toBe(
      '{noformat}\n$$\nx_1^2\n$$\n{noformat}',
    );
  });

  it('quotes block quotes', () => {
    expect(toConfluenceWiki('> quoted')).toBe('{quote}\nquoted\n{quote}');
  });

  it('turns footnotes into superscript numbers and trailing notes', () => {
    expect(toConfluenceWiki('Claim.[^1]\n\n[^1]: Source.')).toBe(
      'Claim.^1^\n\n----\n\n^1^ Source.',
    );
  });

  it('names images as attachments, matching image extraction', () => {
    expect(
      toConfluenceWiki(
        '![a chart](data:image/png;base64,AAAA) ![](data:image/jpeg;base64,AAAA) ![](images/image3.gif) ![](https://example.com/x.png)',
      ),
    ).toBe(
      '!image1.png|alt="a chart"! !image2.jpg! !image3.gif! !https://example.com/x.png!',
    );
    // A linked image doesn't shift the numbering of the inline ones.
    expect(
      toConfluenceWiki(
        '![](https://example.com/x.png) ![](data:image/png;base64,AAAA)',
      ),
    ).toBe('!https://example.com/x.png! !image1.png!');
  });

  it('resolves reference links', () => {
    expect(toConfluenceWiki('[site][s]\n\n[s]: https://example.com')).toBe(
      '[site|https://example.com]',
    );
  });
});

describe('markdownToConfluence', () => {
  it('converts a real document', async () => {
    const markdown = await convert('src/__fixtures__/h1.docx');
    expect(await markdownToConfluence(markdown)).toBe(
      toConfluenceWiki(markdown),
    );
    expect(await markdownToConfluence(markdown)).toMatch(/^h1\. /);
  });
});
