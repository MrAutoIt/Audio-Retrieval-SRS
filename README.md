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
- FFmpeg (for audio segmentation) - [Download FFmpeg](https://ffmpeg.org/download.html) and ensure it's in your PATH
- OpenAI API key (for Whisper transcription)

### Installation

```bash
pnpm install
```

### Environment Setup

Create a `.env.local` file in the `apps/web` directory:

```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```

**Note:** The OpenAI API key is required for the Whisper transcription feature. Get your API key from [OpenAI](https://platform.openai.com/api-keys).

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
- **OpenAI Whisper Integration**: Upload audio files to automatically transcribe and translate into sentence pairs
- **Multi-language Support**: Study multiple languages with separate data storage per language
- **Time-aligned Audio Segments**: Extract individual sentence audio clips from longer recordings
- **Duplicate Detection**: Fuzzy matching to identify similar sentences before adding
- **Sentence Validation**: Automatic filtering to ensure only complete sentences are saved

## License

MIT
