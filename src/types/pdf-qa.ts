export interface TextItem {
    text: string
    x: number
    y: number
    width: number
    height: number
    fontName: string
}

export interface Drawing {
    tool: string
    color: string
    path: { x: number; y: number }[]
}

export interface ImageDetail {
    name: string
    width: number
    height: number
    kind: number
    hasAlpha: boolean
    dataLength: number
    colorSpace: string
}

export interface TableRegion {
    startRow: number
    rows: TextItem[][]
    columnPositions: number[]
}

export interface StructuredTable {
    id: string
    pageNum: number
    headers: string[]
    rows: string[][]
    rawGrid: string[][]
    columnPositions: number[]
    boundingBox: { x: number; y: number; width: number; height: number }
    extractionMethod: string
    title?: string
    caption?: string
    aiEnhanced?: boolean
    htmlTable?: string
}

export interface Figure {
    id: string
    pageNum: number
    dataUrl: string
    width: number
    height: number
    caption?: string | null
    extractionMethod: string
    colorSpace?: string
    hasAlpha?: boolean
    savedUrl?: string
    figureNumber?: number
    figureNumberGuess?: number
}

export interface DocumentSentence {
    index: number
    pageNum: number
    text: string
    localIndex: number
}

export interface HistoryEntry {
    id: number
    pdfName: string
    question: string
    answer: string
    sourceQuote: string
    pageNumber: number
    pageImage?: string
    timestamp: string
    citations: number[]
    referencedFigures: string[]
    referencedTables: string[]
    documentSentences?: DocumentSentence[]
    citationMap?: { [key: number]: { pageNum: number; textIndex: number; sentence: string } }
}

export interface Annotation {
    drawings: Drawing[]
    notes: { id: number; text: string; timestamp: string }[]
}

export interface ExtractionDiagnostics {
    pageNum: number
    totalOperators: number
    imageOperators: number
    extractedImages: number
    filteredImages: number
    errors: string[]
    processingTime: number
    imageDetails: ImageDetail[]
}

// PDF.js Types - defining minimal interfaces to avoid 'any'
export interface PDFRenderParams {
    canvasContext: CanvasRenderingContext2D
    viewport: PDFViewport
}

export interface PDFViewport {
    width: number
    height: number
    scale: number
}

export interface PDFTextContent {
    items: { str: string; transform: number[]; width: number; height: number; fontName: string }[]
}

export interface PDFOperatorList {
    fnArray: number[]
    argsArray: unknown[][]
}

export interface PDFPageProxy {
    render: (params: PDFRenderParams) => { promise: Promise<void> }
    getViewport: (params: { scale: number }) => PDFViewport
    getTextContent: () => Promise<PDFTextContent>
    getOperatorList: () => Promise<PDFOperatorList>
    commonObjs: { get: (name: string) => Promise<unknown> }
    objs: { get: (name: string) => Promise<unknown>; objs?: Record<string, unknown> }
    view: number[]
    rotate: number
    _pageIndex: number
}

export interface PDFDocumentProxy {
    getPage: (num: number) => Promise<PDFPageProxy>
    numPages: number
}
