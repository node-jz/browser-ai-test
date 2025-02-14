# Fam Travel Search

A tool for Fam team to search for travel accommodations. This project consists of a SvelteKit (Svelte 3x) frontend and a NestJS backend, with real-time communication capabilities using WebSockets and automated browsing using Playwright.

## Tech Stack

### Frontend

- SvelteKit
- TailwindCSS
- Socket.io Client
- Google Places API

### Backend

- NestJS
- Playwright (for browser automation)
- WebSockets
- Event Emitter

## Prerequisites

- Node.js (Latest LTS version recommended)
- pnpm (Package manager)
- Git

## Getting Started

1. Clone the repository:

```bash
git clone [repository-url]
cd FAM-travel-search
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

For the backend (api):

```bash
cd apps/api
cp .env.sample .env
# Edit .env with your configuration
```

For the frontend (ui):

```bash
cd apps/frontend
cp .env.example .env
# Add your VITE_GOOGLE_API_KEY for Google Places integration
```

## Development

You can run the frontend and backend separately:

### Frontend Development

```bash
pnpm start:ui
```

This will start the Svelte development server.

### Backend Development

Normal development:

```bash
pnpm start:api
```

With debugger support (for breakpoints):

```bash
pnpm start:debug
```

### Running Both Together

```bash
pnpm start
```

## Project Structure

```
├── apps/
│   ├── frontend/        # Svelte frontend application
│   └── api/            # NestJS backend application
├── package.json
└── pnpm-workspace.yaml
```

## Code Quality

This project uses several tools to maintain code quality:

- ESLint for code linting
- Prettier for code formatting
- Husky for pre-commit hooks
- Conventional Commits for commit message formatting

The pre-commit hooks will automatically run linting and formatting checks before each commit.

## Testing

To run tests across all packages:

```bash
pnpm test
```

## Deployment

This project is currently hosted on Render. Make sure to set up the following:

1. Environment variables in Render dashboard
2. Build commands and start commands according to the platform requirements
3. Proper service configuration for both frontend and backend

## WebSocket Communication

The backend uses WebSockets to communicate real-time updates to the frontend as browsers run their searches. This is implemented using Socket.io, with the NestJS backend acting as the WebSocket server and the Svelte frontend as the client.

## Contributing

1. Ensure you have Husky hooks installed:

```bash
pnpm prepare
```

2. Create a new branch for your feature
3. Make your changes
4. Commit using conventional commit format
5. Create a pull request

## Troubleshooting

If you encounter any issues:

1. Ensure all environment variables are properly set
2. Check that you're using the correct Node.js version
3. Clear pnpm cache if you encounter package-related issues:

```bash
pnpm store prune
```
