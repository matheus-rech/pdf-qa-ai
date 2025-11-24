# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDF Q&A application built with Next.js 16 that allows users to upload PDFs, ask questions about the content, and get AI-powered answers with native citations. Uses Anthropic Claude API for Q&A with citations, PICOTT analysis, and table extraction; Google Gemini API for text-to-speech.

## Commands

```bash
# Development
npm run dev          # Start dev server at http://localhost:3000

# Build & Production
npm run build        # Build for production
npm run start        # Start production server

# Linting
npm run lint         # Run ESLint
```

## Environment Variables

Create `.env.local` with:
```
NEXT_PUBLIC_ANTHROPIC_API_KEY=your_anthropic_api_key
NEXT_PUBLIC_ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS v4
- **Icons**: lucide-react
- **PDF Rendering**: PDF.js (loaded via CDN at runtime)
- **AI - Citations**: Anthropic Claude API (claude-sonnet-4-20250514) with native citations
- **AI - TTS**: ElevenLabs API

### API Routes

**Q&A with Citations** (`src/app/api/qa-with-citations/route.ts`)
- POST endpoint for asking questions about PDF content
- Uses Anthropic document citations API with `citations: { enabled: true }`
- Returns text with embedded `[N]` markers and citations array with page locations

**PICOTT Analysis** (`src/app/api/picott-with-citations/route.ts`)
- POST endpoint for PICOTT framework analysis (Population, Intervention, Comparison, Outcome, Time, Type)
- Extracts structured research data with citations from Methods/Results/Discussion sections

**Table Extraction** (`src/app/api/extract-tables/route.ts`)
- POST endpoint for extracting tables from PDFs
- Uses pdf-parse for text extraction and Claude vision for validation
- Returns tables with bounding box coordinates for screenshots

### Key Components

**Main Application** (`src/app/page.tsx`)
- Single-page client component (~150KB) containing PDF viewer and Q&A interface
- Manages PDF rendering, text extraction, figure/table detection, and AI interactions
- Uses `highlight-words-core` for text highlighting in PDF text layer

**API Utilities** (`src/lib/gemini-api.ts`)
- `callGeminiApi()` - Anthropic Claude text generation with exponential backoff retry
- `callElevenLabsTTS()` - ElevenLabs text-to-speech

**PDF Utilities** (`src/lib/pdf-utils.ts`)
- PDF text extraction and processing functions
- Table and figure detection algorithms

**Types** (`src/types/pdf-qa.ts`)
- TypeScript interfaces for PDF.js objects, tables, figures, annotations

### Data Flow

1. User uploads PDF → PDF.js renders pages and extracts text content
2. User asks question → PDF sent as base64 to Anthropic API with document citations enabled
3. Response includes answer text with `[N]` markers and citations array containing `cited_text`, `start_page_number`
4. Frontend converts `[N]` markers to clickable buttons that navigate to source page and highlight text
5. Text highlighting uses normalized whitespace matching against PDF text layer spans

### Citation Format

Anthropic API returns citations embedded in text blocks:
```typescript
{
  type: 'text',
  text: 'Answer with [1] citations',
  citations: [{
    type: 'page_location',
    cited_text: 'source text',
    start_page_number: 1,
    end_page_number: 1
  }]
}
```
