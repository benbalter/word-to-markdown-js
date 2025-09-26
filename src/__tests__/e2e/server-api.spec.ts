import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Server API Endpoints', () => {
  const baseURL = 'http://localhost:3000';

  test('should respond to health check endpoint', async ({ request }) => {
    const response = await request.get(`${baseURL}/_healthcheck`);
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toBe('OK');
  });

  test('should convert Word document via POST /raw endpoint', async ({
    request,
  }) => {
    const fixturePath = path.join(__dirname, '../../__fixtures__/h1.docx');
    const fileBuffer = fs.readFileSync(fixturePath);

    const response = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'h1.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: fileBuffer,
        },
      },
    });

    expect(response.status()).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain('# Heading 1');
    expect(markdown.trim()).not.toBe('');
  });

  test('should convert multiple headings document via API', async ({
    request,
  }) => {
    const fixturePath = path.join(
      __dirname,
      '../../__fixtures__/multiple-headings.docx',
    );
    const fileBuffer = fs.readFileSync(fixturePath);

    const response = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'multiple-headings.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: fileBuffer,
        },
      },
    });

    expect(response.status()).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain('# H1');
    expect(markdown).toContain('## H2');
    expect(markdown).toContain('### H3');
    expect(markdown).toContain('Paragraph');
  });

  test('should convert table document via API', async ({ request }) => {
    const fixturePath = path.join(__dirname, '../../__fixtures__/table.docx');
    const fileBuffer = fs.readFileSync(fixturePath);

    const response = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'table.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: fileBuffer,
        },
      },
    });

    expect(response.status()).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain('|');
    expect(markdown).toMatch(/\|.*\|/); // Should contain pipe-separated content
    expect(markdown).toMatch(/\|[\s:-]+\|/); // Should contain table separator row
  });

  test('should convert list documents via API', async ({ request }) => {
    const ulFixturePath = path.join(__dirname, '../../__fixtures__/ul.docx');
    const olFixturePath = path.join(__dirname, '../../__fixtures__/ol.docx');

    // Test unordered list
    const ulBuffer = fs.readFileSync(ulFixturePath);
    const ulResponse = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'ul.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: ulBuffer,
        },
      },
    });

    expect(ulResponse.status()).toBe(200);
    const ulMarkdown = await ulResponse.text();
    expect(ulMarkdown).toMatch(/^[\s]*-[\s]+/m); // Should contain bullet points

    // Test ordered list
    const olBuffer = fs.readFileSync(olFixturePath);
    const olResponse = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'ol.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: olBuffer,
        },
      },
    });

    expect(olResponse.status()).toBe(200);
    const olMarkdown = await olResponse.text();
    // The conversion converts numbered lists to bullet points according to the code
    expect(olMarkdown).toMatch(/^[\s]*-[\s]+/m);
  });

  test('should handle text formatting via API', async ({ request }) => {
    const strongFixturePath = path.join(
      __dirname,
      '../../__fixtures__/strong.docx',
    );
    const emFixturePath = path.join(__dirname, '../../__fixtures__/em.docx');

    // Test bold text
    const strongBuffer = fs.readFileSync(strongFixturePath);
    const strongResponse = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'strong.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: strongBuffer,
        },
      },
    });

    expect(strongResponse.status()).toBe(200);
    const strongMarkdown = await strongResponse.text();
    expect(strongMarkdown).toContain('**bold**'); // Should contain bold formatting

    // Test italic text
    const emBuffer = fs.readFileSync(emFixturePath);
    const emResponse = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'em.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: emBuffer,
        },
      },
    });

    expect(emResponse.status()).toBe(200);
    const emMarkdown = await emResponse.text();
    expect(emMarkdown).toContain('_italic_'); // Should contain italic formatting
  });

  test('should reject .doc files with proper error message', async ({
    request,
  }) => {
    // Create a dummy file with .doc extension
    const dummyBuffer = Buffer.from('dummy content');

    const response = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'document.doc',
          mimeType: 'application/msword',
          buffer: dummyBuffer,
        },
      },
    });

    expect(response.status()).toBe(400);
    const errorMessage = await response.text();
    expect(errorMessage).toContain(
      'This tool only supports .docx files, not .doc files',
    );
  });

  test('should return 400 when no file is uploaded', async ({ request }) => {
    const response = await request.post(`${baseURL}/raw`);

    expect(response.status()).toBe(400);
    const errorMessage = await response.text();
    expect(errorMessage).toContain('You must upload a document to convert');
  });

  test('should handle files with spaces in names', async ({ request }) => {
    const fixturePath = path.join(
      __dirname,
      '../../__fixtures__/file with space.docx',
    );
    const fileBuffer = fs.readFileSync(fixturePath);

    const response = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'file with space.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: fileBuffer,
        },
      },
    });

    expect(response.status()).toBe(200);
    const markdown = await response.text();
    expect(markdown.trim()).not.toBe('');
    expect(markdown).toBeTruthy();
  });

  test('should handle complex document with various elements', async ({
    request,
  }) => {
    const fixturePath = path.join(
      __dirname,
      '../../__fixtures__/list-with-links.docx',
    );
    const fileBuffer = fs.readFileSync(fixturePath);

    const response = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'list-with-links.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: fileBuffer,
        },
      },
    });

    expect(response.status()).toBe(200);
    const markdown = await response.text();
    expect(markdown).toMatch(/^[\s]*-[\s]+/m); // Should contain list items
    expect(markdown).toMatch(/\[.*\]\(.*\)/); // Should contain links
  });

  test('should validate API response content-type and structure', async ({
    request,
  }) => {
    const fixturePath = path.join(__dirname, '../../__fixtures__/p.docx');
    const fileBuffer = fs.readFileSync(fixturePath);

    const response = await request.post(`${baseURL}/raw`, {
      multipart: {
        doc: {
          name: 'p.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: fileBuffer,
        },
      },
    });

    expect(response.status()).toBe(200);

    // Check response headers (should be text/plain for markdown responses)
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/plain');

    const markdown = await response.text();

    // Validate markdown structure
    expect(markdown).toBeTruthy();
    expect(typeof markdown).toBe('string');
    expect(markdown.trim()).not.toBe('');

    // Should not contain HTML tags (should be pure markdown)
    expect(markdown).not.toMatch(/<[^>]+>/);

    // Should be properly formatted markdown
    expect(markdown).toContain('This is paragraph text');
  });
});
