# Development Container Configuration

This directory contains the configuration for using this project with GitHub Codespaces and VS Code Dev Containers.

## What's Included

- **Node.js 24**: The development environment uses Node.js 24, matching the version pinned in `.nvmrc`
- **Pre-configured Extensions**: Essential VS Code extensions for TypeScript, ESLint, Prettier, and debugging
- **Port Forwarding**: Automatic forwarding of ports 4321 (Astro dev server) and 8080 (preview server used by the E2E tests)
- **Auto-setup**: Dependencies are automatically installed when the container starts

## Usage

### GitHub Codespaces

1. Click the "Code" button on the GitHub repository
2. Select "Codespaces" tab
3. Click "Create codespace on main"
4. Wait for the environment to set up automatically

### VS Code Dev Containers

1. Install the "Dev Containers" extension in VS Code
2. Open the project folder in VS Code
3. Click "Reopen in Container" when prompted (or use Command Palette > "Dev Containers: Reopen in Container")

## Development Workflow

Once the container is running:

- **Run tests**: `npm test`
- **Start the site**: `npm run dev` (accessible on port 4321)
- **Run E2E tests**: `npm run test:e2e` (serves the built site on port 8080)
- **Build project**: `npm run build`
- **Lint code**: `npm run lint`

The development environment is pre-configured with:

- Automatic code formatting on save
- ESLint integration
- TypeScript language support
- Debug configurations
