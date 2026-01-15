# Audio Retrieval SRS

Audio-first spaced repetition system for language learning with hands-free practice sessions.

## Architecture

Monorepo structure:
- `packages/core` - Shared TypeScript domain models and scheduling engine
- `packages/storage` - Storage adapters (IndexedDB for web, SQLite for mobile)
- `apps/web` - Next.js web application
- `apps/mobile` - Expo React Native iOS application

## Setup

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
pnpm install
```

### Development

#### Web App
```bash
pnpm dev:web
```

#### Mobile App
```bash
pnpm dev:mobile
```

### Build

```bash
pnpm build:core
pnpm build:web
```

### Testing

```bash
pnpm test:core
```

## Features

- Audio-first practice sessions
- Leitner-like spaced repetition scheduling
- Hands-free operation (speech recognition for ratings)
- Background audio support on iOS
- Local storage with export/import
- Session persistence and recovery

## License

MIT
