# Development Container Configuration

This directory contains the configuration for using this project with GitHub Codespaces and VS Code Dev Containers.

## What's Included

- **Node.js 20**: The development environment uses Node.js 20, matching the project requirements
- **Pre-configured Extensions**: Essential VS Code extensions for TypeScript, ESLint, Prettier, and debugging
- **Port Forwarding**: Automatic forwarding of ports 3000 (API server) and 8080 (web dev server)
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
- **Start API server**: `npm run server` (accessible on port 3000)  
- **Start web dev server**: `npm run server:web` (accessible on port 8080)
- **Build project**: `npm run build`
- **Lint code**: `npm run lint`

The development environment is pre-configured with:
- Automatic code formatting on save
- ESLint integration
- TypeScript language support
- Debug configurations