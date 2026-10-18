// The HTML preview of the converted Markdown. Its renderer (unified, remark,
// rehype: ~52KB gzipped) runs on the main thread and is imported only once a
// conversion starts, so a visitor who never converts doesn't download it.

type Renderer = (markdown: string) => Promise<string>;

let renderer: Promise<Renderer> | null = null;

function loadRenderer(): Promise<Renderer> {
  renderer ??= Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
    import('remark-rehype'),
    import('rehype-sanitize'),
    import('rehype-stringify'),
  ]).then(
    ([
      { unified },
      { default: remarkParse },
      { default: remarkGfm },
      { default: remarkRehype },
      { default: rehypeSanitize, defaultSchema },
      { default: rehypeStringify },
    ]) => {
      // remark-rehype already namespaces footnote ids/hrefs with
      // `user-content-` consistently. rehype-sanitize's default clobberPrefix
      // re-prefixes *ids* (but not href fragments), double-prefixing footnote
      // targets and breaking the in-page jump/backlinks. Disable its
      // clobbering; the ids remain namespaced (and thus clobber-safe) by
      // remark-rehype.
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeSanitize, { ...defaultSchema, clobberPrefix: '' })
        .use(rehypeStringify);
      return async (markdown: string) =>
        String(await processor.process(markdown));
    },
    (error: unknown) => {
      // Let a later conversion retry a failed download.
      renderer = null;
      throw error;
    },
  );
  return renderer;
}

// Start downloading the renderer, so the preview is ready when the result is.
export function prefetchRenderer(): void {
  loadRenderer().catch(() => {});
}

// Fill the preview pane with the rendered Markdown, kept off the interaction's
// critical path. A frame is yielded first so the results reveal (the raw
// Markdown) paints before this main-thread render/parse begins — on a large or
// complex document the unified/rehype pass plus its innerHTML parse is a
// multi-second long task. A failure here is non-fatal: the raw Markdown (the
// primary output, and the copy/download source) is already on screen.
// `isCurrent` says whether this document is still the one on screen.
export async function renderPreview(
  target: HTMLElement | null,
  markdown: string,
  isCurrent: () => boolean,
): Promise<void> {
  if (!target) return;
  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    const render = await loadRenderer();
    const html = await render(markdown);
    // A newer document replaced this one while it rendered.
    if (!isCurrent()) return;
    target.innerHTML = html;
    // Open the document's own links in a new tab so following one doesn't
    // navigate away from (and discard) the conversion. In-page footnote links
    // (#user-content-fn-…) stay as they are.
    target
      .querySelectorAll<HTMLAnchorElement>('a[href^="http"]')
      .forEach((link) => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });
    hideSpacerImages(target);
  } catch (error) {
    console.error(error);
  }
}

// A 1×1 image (a spacer or tracking pixel, common in pasted web content)
// renders as an invisible dot wrapped in Typography's image margins: a blank
// gap in the preview. Hide those once they decode. The Markdown keeps them,
// since that's the document's content.
function hideSpacerImages(target: HTMLElement): void {
  for (const image of target.querySelectorAll('img')) {
    const check = (): void => {
      if (image.naturalWidth > 1 || image.naturalHeight > 1) return;
      image.hidden = true;
      // An image alone in its paragraph leaves the paragraph's margins
      // behind as the same blank gap, so hide that too.
      const parent = image.parentElement;
      if (
        parent?.tagName === 'P' &&
        parent.children.length === 1 &&
        !parent.textContent?.trim()
      ) {
        parent.hidden = true;
      }
    };
    if (image.complete && image.naturalWidth > 0) check();
    else image.addEventListener('load', check, { once: true });
  }
}
