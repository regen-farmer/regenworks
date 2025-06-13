

# RegenWorks Backend

Express.js backend server powered by Vite for fast development and optimized builds.

## Development Setup

### Environment Variables
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

## Scripts

### Development
- `pnpm run dev` - Start development server with hot reload using vite-node
- `pnpm run dev:debug` - Start with Node.js inspector for debugging
- `pnpm run dev:hmr` - Alternative dev server using nodemon

### Production
- `pnpm run build` - Build for production using Vite
- `pnpm run build:watch` - Build in watch mode
- `pnpm run start` - Run the built application
- `pnpm run preview` - Same as start (alias)

### Utilities
- `pnpm run lint` - Lint code with Biome
- `pnpm run format` - Format code with Biome
- `pnpm run clean` - Remove build directory

## Features

- **Fast Development**: Hot reload with vite-node
- **Optimized Builds**: Vite bundling with proper externalization
- **TypeScript Support**: Full TypeScript support with fast transpilation
- **Modern ES Modules**: Uses ES2022 modules throughout
- **Node.js Compatibility**: Proper handling of Node.js built-ins and dependencies