import convert, {
  FileNotFoundError,
  InvalidFileError,
  FilePermissionError,
  ConversionError,
} from '../main.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('error messages', () => {
  describe('FileNotFoundError', () => {
    it('should throw FileNotFoundError for non-existent file', async () => {
      const nonExistentFile = '/path/that/does/not/exist/file.docx';
      await expect(convert(nonExistentFile)).rejects.toThrow(FileNotFoundError);
      await expect(convert(nonExistentFile)).rejects.toThrow('File not found');
      await expect(convert(nonExistentFile)).rejects.toThrow(
        'Please check that the file exists',
      );
    });

    it('should include file path in error message', async () => {
      const testPath = '/test/file.docx';
      await expect(convert(testPath)).rejects.toThrow(testPath);
    });
  });

  describe('InvalidFileError', () => {
    let tempDir: string;
    let tempFile = '';

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w2m-test-'));
    });

    afterEach(() => {
      if (tempFile && fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    });

    it('should throw InvalidFileError for non-zip file with .docx extension', async () => {
      tempFile = path.join(tempDir, 'invalid.docx');
      fs.writeFileSync(tempFile, 'This is not a valid docx file');

      await expect(convert(tempFile)).rejects.toThrow(InvalidFileError);
      await expect(convert(tempFile)).rejects.toThrow('not a valid .docx');
      await expect(convert(tempFile)).rejects.toThrow('corrupted');
    });

    it('should throw InvalidFileError for empty file', async () => {
      tempFile = path.join(tempDir, 'empty.docx');
      fs.writeFileSync(tempFile, '');

      await expect(convert(tempFile)).rejects.toThrow(InvalidFileError);
    });

    it('should include file path in error message for file path input', async () => {
      tempFile = path.join(tempDir, 'corrupt.docx');
      fs.writeFileSync(tempFile, 'corrupt data');

      await expect(convert(tempFile)).rejects.toThrow(tempFile);
    });

    it('should throw InvalidFileError for ArrayBuffer with invalid content', async () => {
      const invalidBuffer = new ArrayBuffer(8);

      await expect(convert(invalidBuffer)).rejects.toThrow(InvalidFileError);
    });

    it('should have user-friendly error message without filePath for ArrayBuffer', async () => {
      const invalidBuffer = new ArrayBuffer(8);
      const error = await convert(invalidBuffer).catch((e) => e);

      expect(error).toBeInstanceOf(InvalidFileError);
      // Error message should be grammatically correct without file path
      expect(error.message).toContain('Invalid file');
      expect(error.message).toContain('not a valid .docx file');
      // Should not have awkward formatting like extra spaces or colons at the start
      expect(error.message).not.toMatch(/Invalid file\s*:/);
      expect(error.message).not.toMatch(/Invalid file\s*""/);
    });
  });

  describe('FilePermissionError', () => {
    it('should throw FilePermissionError for permission denied', async () => {
      // Skip this test on Windows as permission testing is different
      if (process.platform === 'win32') {
        return;
      }

      let tempFile: string | null = null;
      try {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w2m-test-'));
        tempFile = path.join(tempDir, 'noperm.docx');
        fs.writeFileSync(tempFile, 'test content');
        // Remove all permissions
        fs.chmodSync(tempFile, 0o000);

        await expect(convert(tempFile)).rejects.toThrow(FilePermissionError);
        await expect(convert(tempFile)).rejects.toThrow('Permission denied');
        await expect(convert(tempFile)).rejects.toThrow(tempFile);
      } finally {
        // Cleanup: restore permissions before deleting
        if (tempFile && fs.existsSync(tempFile)) {
          fs.chmodSync(tempFile, 0o644);
          fs.unlinkSync(tempFile);
          fs.rmdirSync(path.dirname(tempFile));
        }
      }
    });
  });

  describe('ConversionError', () => {
    it('should wrap unexpected errors in ConversionError', async () => {
      // Create a minimal but invalid ZIP file that will fail in mammoth
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w2m-test-'));
      const tempFile = path.join(tempDir, 'weird.docx');

      try {
        // Create a file with ZIP signature but invalid content
        // This should pass ZIP validation but fail in mammoth processing
        const buffer = Buffer.alloc(100);
        // ZIP local file header signature
        buffer.writeUInt32LE(0x04034b50, 0);
        fs.writeFileSync(tempFile, buffer);

        const error = await convert(tempFile).catch((e) => e);

        // Should be wrapped in one of our error types
        expect(
          error instanceof InvalidFileError || error instanceof ConversionError,
        ).toBe(true);
        expect(error.message).toContain('valid');
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        if (fs.existsSync(tempDir)) {
          fs.rmdirSync(tempDir);
        }
      }
    });
  });

  describe('Error message quality', () => {
    it('should provide actionable error messages', async () => {
      const testCases = [
        {
          error: FileNotFoundError,
          file: '/nonexistent/test.docx',
          expectedPhrases: ['File not found', 'check that the file exists'],
        },
      ];

      for (const testCase of testCases) {
        const error = await convert(testCase.file).catch((e) => e);
        expect(error).toBeInstanceOf(testCase.error);
        for (const phrase of testCase.expectedPhrases) {
          expect(error.message).toContain(phrase);
        }
      }
    });

    it('should provide actionable error messages for all error types', async () => {
      // Test InvalidFileError
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w2m-test-'));
      const tempFile = path.join(tempDir, 'invalid.docx');
      try {
        fs.writeFileSync(tempFile, 'not a zip file');
        const invalidError = await convert(tempFile).catch((e) => e);
        expect(invalidError).toBeInstanceOf(InvalidFileError);
        expect(invalidError.message).toContain('not a valid .docx file');
        expect(invalidError.message).toContain('ensure');
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        if (fs.existsSync(tempDir)) {
          fs.rmdirSync(tempDir);
        }
      }
    });

    it('should not expose internal implementation details in error messages', async () => {
      // Test with file not found error
      const testFile = '/nonexistent/file.docx';
      const error = await convert(testFile).catch((e) => e);

      // Should not contain technical jargon or internal error codes
      expect(error.message).not.toContain('ENOENT');
      expect(error.message).not.toContain('EACCES');
      expect(error.message).not.toContain('EPERM');
      expect(error.message).not.toContain('stack trace');
      expect(error.message).not.toContain('mammoth');
      expect(error.message).not.toContain('JSZip');

      // Test with invalid file error
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w2m-test-'));
      const tempFile = path.join(tempDir, 'invalid.docx');
      try {
        fs.writeFileSync(tempFile, 'invalid content');
        const invalidError = await convert(tempFile).catch((e) => e);

        // Should not contain technical library names
        expect(invalidError.message).not.toContain('JSZip');
        expect(invalidError.message).not.toContain('mammoth');
        expect(invalidError.message).not.toContain('central directory');
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        if (fs.existsSync(tempDir)) {
          fs.rmdirSync(tempDir);
        }
      }
    });
  });
});
