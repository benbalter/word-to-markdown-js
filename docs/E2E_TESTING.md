# End-to-End Testing with Playwright

This project includes comprehensive end-to-end tests using [Playwright](https://playwright.dev/) to test both the web interface and server API functionality.

## Overview

The E2E tests cover:

- **Web Interface Testing**: File upload, document conversion, results display, error handling
- **Server API Testing**: HTTP endpoints for document conversion and health checks
- **Cross-browser Testing**: Currently configured for Chrome (headless)
- **Responsive Design**: Mobile viewport testing

## Test Structure

```
src/__tests__/e2e/
├── web-interface.spec.ts    # Web UI functionality tests
├── server-api.spec.ts       # HTTP API endpoint tests
├── simple-web.spec.ts       # Basic web interface tests (debugging)
└── test-server.js          # Static file server for web testing
```

## Configuration

- **`playwright.config.ts`**: Main Playwright configuration
- Uses system Chrome browser (channel: 'chrome')
- Runs two web servers automatically:
  - Port 8080: Static file server for web interface
  - Port 3000: Express API server

## Running Tests

### All E2E Tests

```bash
npm run test:e2e
```

### Run with Browser UI (Headed Mode)

```bash
npm run test:e2e:headed
```

### Debug Mode (Interactive)

```bash
npm run test:e2e:debug
```

### Run Specific Test Files

```bash
npx playwright test src/__tests__/e2e/web-interface.spec.ts
npx playwright test src/__tests__/e2e/server-api.spec.ts
```

## Test Categories

### Web Interface Tests (`web-interface.spec.ts`)

1. **Page Loading**: Verifies HTML structure and JavaScript loading
2. **File Upload**: Tests document upload via file input
3. **Document Conversion**:
   - Simple documents (h1.docx)
   - Complex documents (multiple-headings.docx, table.docx)
   - Text formatting (bold, italic)
4. **Error Handling**: Unsupported file types (.doc files)
5. **UI Functionality**: Copy to clipboard, navigation links
6. **Responsive Design**: Mobile viewport testing

### Server API Tests (`server-api.spec.ts`)

1. **Health Check**: `GET /_healthcheck` endpoint
2. **Document Conversion**: `POST /raw` endpoint with various document types
3. **Error Responses**: Invalid files, missing files, unsupported formats
4. **Response Validation**: Content-type headers, response structure
5. **Edge Cases**: Files with spaces, complex documents

## Prerequisites

### System Requirements

- Node.js 20.x
- Chrome browser (installed automatically in most environments)
- Linux environment (for CI/headless testing)

### Installation

```bash
# Install dependencies (includes Playwright)
npm install

# Install browser dependencies (if needed)
npx playwright install-deps chromium
```

## Test Data

Tests use Word document fixtures from `src/__fixtures__/`:

- `h1.docx`: Simple heading document
- `multiple-headings.docx`: Document with H1, H2, H3 headings
- `table.docx`: Document with table structure
- `strong.docx`, `em.docx`: Text formatting examples
- `p.docx`: Simple paragraph text
- Other specialized test documents

## Common Issues & Troubleshooting

### Browser Installation

If Chrome is not available, the tests will attempt to use system Chrome:

```bash
# Install Chrome on Ubuntu/Debian
sudo apt-get install google-chrome-stable
```

### Headless Mode

Tests run in headless mode by default. To see the browser:

```bash
npm run test:e2e:headed
```

### Port Conflicts

If ports 3000 or 8080 are in use:

```bash
# Check for running processes
lsof -i :3000
lsof -i :8080

# Kill processes if needed
pkill -f "node.*server"
```

### Debug Mode

For step-by-step debugging:

```bash
npm run test:e2e:debug
```

## CI/CD Integration

The E2E tests are designed to run in CI environments:

```yaml
# Example GitHub Actions configuration
- name: Run E2E Tests
  run: |
    npm install
    npm run build
    npm run test:e2e
```

## Test Reports

Playwright generates HTML reports in `playwright-report/` (excluded from git):

```bash
# View test report
npx playwright show-report
```

## Writing New Tests

### Web Interface Tests

```typescript
test('should test new feature', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Test interactions
  await page.locator('#some-element').click();

  // Assertions
  await expect(page.locator('#result')).toBeVisible();
});
```

### API Tests

```typescript
test('should test API endpoint', async ({ request }) => {
  const response = await request.get('http://localhost:3000/api/test');
  expect(response.status()).toBe(200);

  const data = await response.json();
  expect(data).toHaveProperty('success', true);
});
```

## Best Practices

1. **Wait for Content**: Use `await expect().toBeVisible()` and timeouts
2. **Isolate Tests**: Each test should be independent
3. **Use Fixtures**: Test with real Word documents from `__fixtures__`
4. **Error Testing**: Include both success and failure scenarios
5. **Mobile Testing**: Test responsive design with viewport changes

## Performance

- Tests typically run in under 15 seconds total
- Individual tests timeout after 30 seconds by default
- File uploads are tested with small fixture documents
- Server startup is automated and shared across tests
