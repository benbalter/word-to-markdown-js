import {
  convertWithWarnings,
  extractDocumentProperties,
  generateWarnings,
} from '../main.js';
import JSZip from 'jszip';

describe('confidentiality flag detection', () => {
  it('should detect no warnings for a simple document', async () => {
    const path = 'src/__fixtures__/p.docx';
    const result = await convertWithWarnings(path);

    expect(result.warnings).toEqual([]);
    expect(result.markdown).toBe('This is paragraph text.');
  });

  it('should return ConvertResult with markdown and warnings properties', async () => {
    const path = 'src/__fixtures__/p.docx';
    const result = await convertWithWarnings(path);

    expect(result).toHaveProperty('markdown');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(typeof result.markdown).toBe('string');
  });

  describe('extractDocumentProperties', () => {
    it('should detect encryption when EncryptionInfo file exists', async () => {
      const zip = new JSZip();
      zip.file('EncryptionInfo', 'encrypted content');
      zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types></Types>');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const properties = await extractDocumentProperties(buffer);

      expect(properties.encryption).toBe(true);
    });

    it('should detect confidentiality in core properties', async () => {
      const zip = new JSZip();
      zip.file(
        'docProps/core.xml',
        '<?xml version="1.0"?><coreProperties><keywords>confidential</keywords></coreProperties>',
      );
      zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types></Types>');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const properties = await extractDocumentProperties(buffer);

      expect(properties.confidentiality).toBe('detected in core properties');
    });

    it('should detect sensitivity labels in custom properties', async () => {
      const zip = new JSZip();
      zip.file(
        'docProps/custom.xml',
        '<?xml version="1.0"?><Properties><property name="Sensitivity"><vt:lpwstr>Confidential</vt:lpwstr></property></Properties>',
      );
      zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types></Types>');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const properties = await extractDocumentProperties(buffer);

      expect(properties.sensitivity).toBe('detected in custom properties');
    });

    it('should detect MSIP labels in custom properties', async () => {
      const zip = new JSZip();
      zip.file(
        'docProps/custom.xml',
        '<?xml version="1.0"?><Properties><property name="MSIP_Label_12345"><vt:lpwstr>Label</vt:lpwstr></property></Properties>',
      );
      zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types></Types>');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const properties = await extractDocumentProperties(buffer);

      expect(properties.sensitivity).toBe('detected in custom properties');
    });

    it('should detect document protection', async () => {
      const zip = new JSZip();
      zip.file(
        'word/settings.xml',
        '<?xml version="1.0"?><settings><w:documentProtection w:edit="readOnly"/></settings>',
      );
      zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types></Types>');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const properties = await extractDocumentProperties(buffer);

      expect(properties.protection).toBe(true);
    });

    it('should handle malformed or missing XML gracefully', async () => {
      const zip = new JSZip();
      zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types></Types>');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const properties = await extractDocumentProperties(buffer);

      expect(properties).toEqual({});
    });
  });

  describe('generateWarnings', () => {
    it('should generate warning for encryption', () => {
      const properties = { encryption: true };
      const warnings = generateWarnings(properties);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('encrypted');
    });

    it('should generate warning for sensitivity labels', () => {
      const properties = { sensitivity: 'detected in custom properties' };
      const warnings = generateWarnings(properties);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('sensitivity labels');
    });

    it('should generate warning for confidentiality markers', () => {
      const properties = { confidentiality: 'detected in custom properties' };
      const warnings = generateWarnings(properties);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('confidentiality markers');
    });

    it('should generate warning for document protection', () => {
      const properties = { protection: true };
      const warnings = generateWarnings(properties);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('editing restrictions');
    });

    it('should generate multiple warnings when multiple flags are present', () => {
      const properties = {
        encryption: true,
        sensitivity: 'detected',
        confidentiality: 'detected',
        protection: true,
      };
      const warnings = generateWarnings(properties);

      expect(warnings).toHaveLength(4);
    });

    it('should return empty array when no flags are present', () => {
      const properties = {};
      const warnings = generateWarnings(properties);

      expect(warnings).toEqual([]);
    });
  });
});
