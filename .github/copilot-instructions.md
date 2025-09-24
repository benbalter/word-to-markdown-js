# Copilot Instructions for word-to-markdown-js

## Project Overview

This is a TypeScript/JavaScript project that converts Word documents to beautiful Markdown. It's a complete rewrite of the original [word-to-markdown](https://github.com/benbalter/word-to-markdown) Ruby gem, now using modern JavaScript tools and libraries.

### Core Conversion Process

The project uses a three-step conversion pipeline:
1. **Mammoth.js** - Converts Word documents (.docx) to HTML
2. **Turndown** - Converts HTML to Markdown with GitHub-flavored Markdown support
3. **Markdownlint** - Cleans up and standardizes the generated Markdown

## Project Structure

```
src/
├── main.ts           # Core conversion logic and pipeline
├── cli.ts           # Command-line interface (w2m command)
├── server.ts        # HTTP API server
├── index.ts         # Web interface frontend
└── __tests__/       # Jest test files with .docx fixtures
```

### Key Files
- `src/main.ts` - The heart of the conversion process with `convert()` function
- `src/cli.ts` - Command-line tool using Commander.js
- `src/server.ts` - Express.js HTTP API server
- `src/index.ts` - Browser-based file upload interface
- `package.json` - Contains npm scripts and dependencies

## Development Environment

### Requirements
- **Node.js**: 20.x (specified in engines and volta)
- **TypeScript**: ~5.3 (compiles to JavaScript)
- **Testing**: Jest with ts-jest for TypeScript support
- **Linting**: ESLint with TypeScript support
- **Building**: TypeScript compiler + Webpack for web bundle

### Available npm Scripts
- `npm test` - Run Jest tests with coverage
- `npm run lint` - Run ESLint on TypeScript files
- `npm run build` - Compile TypeScript to JavaScript
- `npm run build:web` - Build web bundle with Webpack  
- `npm run server:web` - Start development web server
- `npm run server` - Start HTTP API server
- `npm run all` - Run lint, test, and build (CI pipeline)
- `npm run fix` - Auto-fix ESLint and Prettier issues

### Testing
- Uses Jest with TypeScript support (`ts-jest`)
- Test files in `src/__tests__/` directory
- Fixtures are Word documents in `src/__fixtures__/`
- Tests verify conversion output matches expected Markdown
- Run `npm test` for tests with coverage report

## Key Dependencies

### Core Libraries
- `mammoth` - Converts .docx files to HTML
- `@joplin/turndown` + `@joplin/turndown-plugin-gfm` - HTML to Markdown conversion
- `markdownlint` + `markdownlint-rule-helpers` - Markdown cleanup and standardization
- `node-html-parser` - HTML manipulation for table headers

### CLI & Server
- `commander` - CLI argument parsing
- `express` - HTTP server framework
- `multer` - File upload handling
- `helmet` - Security middleware

### Frontend
- `bootstrap` - UI styling
- `clipboard` - Copy-to-clipboard functionality
- Unified/remark/rehype pipeline for Markdown preview

## Code Style & Conventions

### TypeScript Guidelines
- Use strict TypeScript configuration
- Define interfaces for options objects (e.g., `convertOptions`, `turndownOptions`)
- Prefer `async/await` over Promises for readability
- Use ES modules (`import/export`) syntax
- Type function parameters and return values

### Code Organization
- Keep conversion logic pure and testable in `main.ts`
- Separate concerns: CLI, server, and web interface in different files
- Use meaningful function names that describe the transformation
- Add JSDoc comments for complex conversion functions

### Error Handling
- Use async/await with proper error handling
- Provide meaningful error messages for file processing issues
- Handle both file path and ArrayBuffer inputs in convert function

## Testing Guidelines

### Writing Tests
- Add test cases to `src/__tests__/main.test.ts`
- Create Word document fixtures in `src/__fixtures__/` for new features
- Test both successful conversions and edge cases
- Use descriptive test names: `should convert the "feature-name" fixture to Markdown`

### Test Structure
```typescript
describe('main', () => {
  it('should convert feature X to Markdown', async () => {
    const path = `src/__fixtures__/feature-x.docx`;
    const md = await convert(path);
    expect(md).toEqual(expectedMarkdown);
  });
});
```

## Build & Deployment

### CI/CD Pipeline (`.github/workflows/ci.yml`)
1. Install dependencies (`npm install`)
2. Run tests (`npm run test`)
3. Run linting (`npm run lint`)
4. Build TypeScript (`npm run build`)
5. Build web bundle (`npm run build:web`)

### Output Directories
- `build/` - Compiled TypeScript files for Node.js
- `dist/` - Webpack bundle for web deployment
- Both directories are in `.gitignore` but needed for deployment

## Common Development Tasks

### Adding New Conversion Features
1. Modify conversion logic in `src/main.ts`
2. Add test fixture Word document to `src/__fixtures__/`
3. Add test case to `src/__tests__/main.test.ts`
4. Run tests to verify: `npm test`

### Debugging Conversion Issues
- Check intermediate HTML output from Mammoth.js
- Verify Turndown options for Markdown generation
- Use markdownlint to understand cleanup rules
- Test with various Word document structures

### Performance Considerations
- The conversion is CPU-intensive for large documents
- File processing happens in memory (no disk I/O for content)
- Web interface processes files client-side for privacy

## Security Notes

- Files are processed locally (no data sent to external services)
- Web interface uses `rehype-sanitize` for safe HTML rendering
- HTTP server uses `helmet` middleware for security headers
- File uploads are limited by `multer` configuration

## Contributing Guidelines

- Follow existing code style and TypeScript conventions
- Add tests for new features using Word document fixtures
- Ensure all npm scripts pass: `npm run all`
- Keep PRs focused on single features or bug fixes
- Update documentation for new conversion capabilities