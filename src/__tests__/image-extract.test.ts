import fs from 'fs';
import JSZip from 'jszip';
import convert, {
  convertWithWarnings,
  extensionForContentType,
} from '../main.js';

const IMAGE = 'src/__fixtures__/image.docx';

// End-to-end coverage for `images: 'extract'`, which replaces Mammoth's default
// base64 inlining with relative links plus the raw bytes on ConvertResult.images.
describe("images: 'extract' (end to end)", () => {
  it('links images relatively and returns their bytes', async () => {
    const result = await convertWithWarnings(IMAGE, { images: 'extract' });
    expect(result.markdown).toContain('![](images/image1.png)');
    expect(result.markdown).not.toContain('data:image');
    expect(result.images).toHaveLength(1);
    const [image] = result.images!;
    expect(image).toMatchObject({
      path: 'images/image1.png',
      contentType: 'image/png',
    });
    expect(image.bytes).toBeInstanceOf(Uint8Array);
    expect(image.bytes.length).toBeGreaterThan(0);
  });

  it('returns the exact embedded bytes in a standalone buffer, even from an uncompressed .docx', async () => {
    // Repack with STORE so the image entry is uncompressed: JSZip may then hand
    // back a view into the whole .docx. The worker transfers each image's
    // `.buffer`, so the bytes must own their buffer outright.
    const zip = await JSZip.loadAsync(fs.readFileSync(IMAGE));
    const media = zip.file(/^word\/media\//);
    expect(media).toHaveLength(1);
    const original = await media[0].async('uint8array');
    const stored = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'STORE',
    });

    for (const input of [IMAGE, stored]) {
      const { images } = await convertWithWarnings(input, {
        images: 'extract',
      });
      const { bytes } = images![0];
      expect(Array.from(bytes)).toEqual(Array.from(original));
      expect(bytes.byteOffset).toBe(0);
      expect(bytes.byteLength).toBe(bytes.buffer.byteLength);
    }
  });

  it('honors a custom imageDir for both the link and the returned path', async () => {
    const result = await convertWithWarnings(IMAGE, {
      images: 'extract',
      imageDir: 'assets',
    });
    expect(result.markdown).toContain('![](assets/image1.png)');
    expect(result.images![0].path).toBe('assets/image1.png');
  });

  it('leaves images inline (base64) by default and omits the images field', async () => {
    const result = await convertWithWarnings(IMAGE);
    expect(result.markdown).toContain('data:image/png;base64');
    expect(result.images).toBeUndefined();
  });

  it('the default-export convert() still returns the linked Markdown string', async () => {
    const md = await convert(IMAGE, { images: 'extract' });
    expect(md).toContain('![](images/image1.png)');
  });
});

describe('extensionForContentType', () => {
  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/jpg', 'jpg'],
    ['image/gif', 'gif'],
    ['image/tiff', 'tiff'],
    ['image/bmp', 'bmp'],
    ['image/webp', 'webp'],
    ['image/svg+xml', 'svg'],
    ['image/x-emf', 'emf'],
    ['image/x-wmf', 'wmf'],
    ['IMAGE/PNG', 'png'], // case-insensitive
    ['image/avif', 'avif'], // unknown but clean subtype → subtype
    ['image/x-weird', 'bin'], // non-alphanumeric subtype → bin
  ])('maps %s → %s', (contentType, expected) => {
    expect(extensionForContentType(contentType)).toBe(expected);
  });
});
