import convert, {
  UnsupportedFileError,
  validateFileExtension,
} from '../main.js';

describe('DOC file validation', () => {
  describe('validateFileExtension', () => {
    it('should throw UnsupportedFileError for .doc files', () => {
      expect(() => validateFileExtension('document.doc')).toThrow(
        UnsupportedFileError,
      );
      expect(() => validateFileExtension('DOCUMENT.DOC')).toThrow(
        UnsupportedFileError,
      );
      expect(() => validateFileExtension('/path/to/file.doc')).toThrow(
        UnsupportedFileError,
      );
      expect(() => validateFileExtension('C:\\Documents\\file.doc')).toThrow(
        UnsupportedFileError,
      );
    });

    it('should not throw for .docx files', () => {
      expect(() => validateFileExtension('document.docx')).not.toThrow();
      expect(() => validateFileExtension('DOCUMENT.DOCX')).not.toThrow();
      expect(() => validateFileExtension('/path/to/file.docx')).not.toThrow();
      expect(() =>
        validateFileExtension('C:\\Documents\\file.docx'),
      ).not.toThrow();
    });

    it('should not throw for other file extensions', () => {
      expect(() => validateFileExtension('file.txt')).not.toThrow();
      expect(() => validateFileExtension('file.pdf')).not.toThrow();
      expect(() => validateFileExtension('file')).not.toThrow();
    });

    it('should handle filenames without extensions', () => {
      expect(() =>
        validateFileExtension('filename_without_extension'),
      ).not.toThrow();
      expect(() => validateFileExtension('doc')).not.toThrow();
      expect(() => validateFileExtension('docx')).not.toThrow();
    });

    it('should NOT throw for files containing "doc" but with .docx extension', () => {
      expect(() => validateFileExtension('mydocument.docx')).not.toThrow();
      expect(() => validateFileExtension('document_doc.docx')).not.toThrow();
      expect(() => validateFileExtension('doc-file.docx')).not.toThrow();
      expect(() => validateFileExtension('adocument.docx')).not.toThrow();
    });

    it('should provide helpful error message', () => {
      expect(() => validateFileExtension('document.doc')).toThrow(
        'This tool only supports .docx files, not .doc files. Please save your document as a .docx file and try again.',
      );
    });
  });

  describe('convert function with .doc files', () => {
    it('should reject .doc files with helpful error message', async () => {
      await expect(convert('document.doc')).rejects.toThrow(
        UnsupportedFileError,
      );
      await expect(convert('document.doc')).rejects.toThrow(
        'This tool only supports .docx files, not .doc files. Please save your document as a .docx file and try again.',
      );
    });

    it('should reject .doc files regardless of case', async () => {
      await expect(convert('DOCUMENT.DOC')).rejects.toThrow(
        UnsupportedFileError,
      );
      await expect(convert('Document.Doc')).rejects.toThrow(
        UnsupportedFileError,
      );
    });

    it('should reject .doc files with full paths', async () => {
      await expect(convert('/path/to/document.doc')).rejects.toThrow(
        UnsupportedFileError,
      );
      await expect(convert('C:\\Documents\\document.doc')).rejects.toThrow(
        UnsupportedFileError,
      );
    });

    it('should throw UnsupportedFileError for invalid ArrayBuffer inputs', async () => {
      // ArrayBuffer inputs that are not valid .docx files should throw UnsupportedFileError
      const buffer = new ArrayBuffer(8);

      await expect(convert(buffer)).rejects.toThrow(UnsupportedFileError);
      await expect(convert(buffer)).rejects.toThrow(
        'The uploaded file is not a valid Word document (.docx). Please make sure you are uploading a .docx file.',
      );
    });

    it('should throw UnsupportedFileError for text file content in ArrayBuffer', async () => {
      // Create an ArrayBuffer containing text file content (not a zip/docx)
      const textContent = 'This is just a text file, not a Word document';
      const encoder = new TextEncoder();
      const buffer = encoder.encode(textContent).buffer;

      await expect(convert(buffer)).rejects.toThrow(UnsupportedFileError);
      await expect(convert(buffer)).rejects.toThrow(
        'The uploaded file is not a valid Word document (.docx)',
      );
    });
  });

  describe('UnsupportedFileError', () => {
    it('should be an instance of Error', () => {
      const error = new UnsupportedFileError('test message');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('UnsupportedFileError');
      expect(error.message).toBe('test message');
    });
  });
});
