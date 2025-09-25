# Your privacy

## Information collected

_TL;DR:_ This application is entirely client-side when using the web interface. No information ever leaves your computer or is sent to any server during document conversion through the web interface.

### Information you provide

**Web Interface:** When you upload a document through the web interface, it is processed entirely within your browser using JavaScript. The document contents are never transmitted to any server or third party. All conversion happens locally on your device.

**HTTP API Server:** When using the optional HTTP API server (for programmatic access), documents are temporarily processed on the server you choose to run. The server does not store files permanently - they are processed and immediately discarded. When using the hosted version on word2md.com, no document contents or personal information are logged.

### Information collected automatically

- **On word2md.com:** This site uses privacy-centric [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) to collect anonymous usage statistics. Cloudflare Analytics is privacy-first and does not track individual users or use cookies.
- **When self-hosted:** No analytics or tracking of any kind are included when you run the application locally or self-host it.
- **Hosted API usage:** When using the hosted version on word2md.com, no document contents, personal information, or sensitive data are logged. Only basic request metadata (like response times) may be logged for system health monitoring.

### How information is used

- **Web Interface:** Documents you upload are converted to Markdown entirely on your device and never leave your computer.
- **HTTP API Server:** Documents are processed temporarily for conversion and immediately discarded without permanent storage.
- Anonymous usage statistics (when using word2md.com) help understand general site usage patterns without identifying individual users.

### How information is shared

**Web Interface:** Your documents and personal information are never shared because they never leave your device. **HTTP API Server:** Documents are processed temporarily and discarded immediately without sharing. Only anonymous, aggregated usage statistics are collected when using word2md.com.

### A note on security

This application runs entirely in your browser for maximum privacy and security when using the web interface. All document processing happens locally on your device using JavaScript. When using the HTTP API, processing happens on your chosen server. If you'd like to understand exactly what's happening, you can [view the complete source code](https://github.com/benbalter/word-to-markdown-js). For additional privacy, you can always [run the application locally](https://github.com/benbalter/word-to-markdown-js#running-locally) or [self-host it](https://github.com/benbalter/word-to-markdown-js#self-hosting) without any analytics.