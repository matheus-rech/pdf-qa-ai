# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDF Q&A application built with Next.js 16 that allows users to upload PDFs, ask questions about the content, and get AI-powered answers with citations. Uses Google Gemini API for Q&A, summarization, and text-to-speech features.

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
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
```

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS v4
- **Icons**: lucide-react
- **PDF Rendering**: PDF.js (loaded via CDN at runtime)
- **AI**: Google Gemini API (gemini-2.5-flash-preview)

### Key Components

**Main Application** (`src/app/page.tsx`)
- Single-page client component containing the entire PDF viewer and Q&A interface
- Manages PDF rendering, text extraction, figure/table detection, and AI interactions
- Large file (~150KB) with all UI and logic combined

**API Layer** (`src/lib/gemini-api.ts`)
- `callGeminiApi()` - Text generation with exponential backoff retry logic
- `callGeminiTTSApi()` - Text-to-speech using Gemini TTS model, converts PCM to WAV

**PDF Utilities** (`src/lib/pdf-utils.ts`)
- PDF text extraction and processing functions
- Table and figure detection algorithms

**Types** (`src/types/pdf-qa.ts`)
- TypeScript interfaces for PDF.js objects, tables, figures, annotations, and history entries

### Data Flow
1. User uploads PDF → PDF.js renders pages and extracts text content
2. User asks question → Text sent to Gemini API with document context
3. Response includes answer with citation indices mapping to source sentences
4. Figures/tables extracted from PDF operators and displayed in modal viewers
