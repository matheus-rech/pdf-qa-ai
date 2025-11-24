/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import {
    Upload,
    FileText,
    MessageCircle,
    Eye,
    ChevronLeft,
    ChevronRight,
    Loader2,
    CheckCircle,
    Brain,
    Search,
    Quote,
    Sparkles,
    FileSearch,
    History,
    X,
    Maximize2,
    Minimize2,
    Download,
    BookOpen,
    Target,
    Users,
    Beaker,
    BarChart3,
    Calendar,
    Shield,
    Ban,
    ImageIcon as ImageIconLucide,
    LampDeskIcon as TableIconLucide,
    Pencil,
    Highlighter,
    MousePointer,
    Eraser,
    ZoomIn,
    ZoomOut,
    Camera,
    Volume2, // Added for TTS
    StopCircle // Added for TTS
} from "lucide-react"
import { findAll } from "highlight-words-core"
import { marked } from "marked"

// PDF.js library type is declared in global window

// --- Text/Table Extraction Types ---
interface TextItem {
    text: string
    x: number
    y: number
    width: number
    height: number
    fontName: string
}

interface TableRegion {
    startRow: number
    rows: TextItem[][]
    columnPositions: number[]
}

interface StructuredTable {
    id: string
    pageNum: number
    headers: string[]
    rows: string[][]
    rawGrid: string[][]
    columnPositions: number[]
    boundingBox: { x: number; y: number; width: number; height: number; }
    extractionMethod: string
    title?: string
    caption?: string
    aiEnhanced?: boolean
    htmlTable?: string
    imageUrl?: string
}

const PDFQAApp = () => {
    // State management
    const [pdfDoc, setPdfDoc] = useState<any>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(0)
    const [pageTextContents, setPageTextContents] = useState<any[]>([])
    const [currentPdfName, setCurrentPdfName] = useState("")
    const [activeTab, setActiveTab] = useState("viewer")
    const [question, setQuestion] = useState("")
    const [answer, setAnswer] = useState("")
    const [sourceQuote, setSourceQuote] = useState("")
    const [summary, setSummary] = useState<React.ReactNode | string>("")
    const [history, setHistory] = useState<any[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [isAsking, setIsAsking] = useState(false)
    const [isSummarizing, setIsSummarizing] = useState(false)
    const [_statusMessage, setStatusMessage] = useState("Loading PDF.js library...")
    const [showAnswer, setShowAnswer] = useState(false)
    const [showSummary, setShowSummary] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [dragActive, setDragActive] = useState(false)
    const [aiThinking, setAiThinking] = useState("")
    const [showHistory, setShowHistory] = useState(true)
    const [pdfJsLoaded, setPdfJsLoaded] = useState(false)
    const [citations, setCitations] = useState<number[]>([])
    const [nativeCitations, setNativeCitations] = useState<Array<{
        cited_text: string
        start_page_number?: number
        end_page_number?: number
    }>>([])
    const [picottCitations, setPicottCitations] = useState<Array<{
        cited_text: string
        start_page_number?: number
        end_page_number?: number
    }>>([])
    const [highlightedText, setHighlightedText] = useState("")
    const [highlightedPage, setHighlightedPage] = useState<number | null>(null)

    // Add these new states after the existing state declarations
    const [citationMap, setCitationMap] = useState<{
        [key: number]: { pageNum: number; textIndex: number; sentence: string }
    }>({})
    const [activeCitation, setActiveCitation] = useState<number | null>(null)
    const [citationTimeout, setCitationTimeout] = useState<NodeJS.Timeout | null>(null)

    // New states for figures and tables
    const [extractedFigures, setExtractedFigures] = useState<any[]>([])
    const [extractedTables, setExtractedTables] = useState<StructuredTable[]>([]) // Use new type
    const [pdfFile, setPdfFile] = useState<File | null>(null) // Store PDF file for API calls
    const [selectedFigure, setSelectedFigure] = useState<any>(null)
    const [selectedTable, setSelectedTable] = useState<StructuredTable | null>(null) // Use new type
    const [annotations, setAnnotations] = useState<any>({})
    const [annotationTool, setAnnotationTool] = useState("highlight")
    const [annotationColor, setAnnotationColor] = useState("#FFEB3B")
    const [isDrawing, setIsDrawing] = useState(false)
    const [currentPath, setCurrentPath] = useState<any[]>([])
    const [zoom, setZoom] = useState(1)
    const [isExtractingTables, setIsExtractingTables] = useState(false)

    // New states for blob URLs
    const [pdfBlobUrl, setPdfBlobUrl] = useState("")
    const [_savedFigures, _setSavedFigures] = useState<any[]>([])

    // New states for figure extraction diagnostics
    const [extractionDiagnostics, setExtractionDiagnostics] = useState<Record<number, {
        pageNum: number
        totalOperators: number
        imageOperators: number
        extractedImages: number
        filteredImages: number
        errors: string[]
        processingTime: number
        imageDetails: { name: string; width: number; height: number; kind: number; hasAlpha: boolean; dataLength: number; colorSpace: string }[]
    }>>({})
    const [showDiagnostics, setShowDiagnostics] = useState(false)

    // New states for Gemini features
    const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([])
    const [figureExplanation, setFigureExplanation] = useState("")
    const [isExplainingFigure, setIsExplainingFigure] = useState(false)
    // New states for Table Modal
    const [tableExplanation, setTableExplanation] = useState("")
    const [isExplainingTable, setIsExplainingTable] = useState(false)
    const [rawSummaryText, setRawSummaryText] = useState("") // For TTS

    // New states for TTS
    const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
    const [isBufferingAudio, setIsBufferingAudio] = useState(false);
    const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);

    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const textLayerRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const textViewRef = useRef<HTMLDivElement>(null)
    const annotationCanvasRef = useRef<HTMLCanvasElement>(null)
    const figureCanvasRef = useRef<HTMLCanvasElement>(null)

    // ---------------------------------------------------------------------------
    // Load PDF.js in the browser – try multiple CDNs with better fallback handling
    // ---------------------------------------------------------------------------
    useEffect(() => {
        async function loadPdfJs() {
            if (typeof window === "undefined") return

            // Already loaded - check if getDocument function exists and call it to verify
            const pdfjsLib = (window as unknown as { pdfjsLib?: { getDocument?: unknown; GlobalWorkerOptions?: { workerSrc: string }; OPS?: Record<string, number> } }).pdfjsLib
            if (pdfjsLib && typeof pdfjsLib.getDocument === 'function') {
                setPdfJsLoaded(true)
                setStatusMessage("Ready to analyse your documents")
                return
            }

            // Don't inject multiple <script> tags
            if (document.getElementById("pdfjs-script")) return

            // Updated CDN list with more reliable sources and fallback versions
            const cdnList = [
                // Try latest stable version first
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
                "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
                // Fallback to well-tested version
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js",
                "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js",
                // Additional fallback
                "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js",
            ] as const

            for (const src of cdnList) {
                try {
                    setStatusMessage(
                        `Loading PDF.js from ${src.includes("cdnjs") ? "CDNJS" : src.includes("jsdelivr") ? "jsDelivr" : "unpkg"}...`,
                    )

                    await new Promise<void>((resolve, reject) => {
                        const s = document.createElement("script")
                        s.id = "pdfjs-script"
                        s.src = src
                        s.async = true
                        s.crossOrigin = "anonymous"

                        // Add timeout to prevent hanging
                        const timeout = setTimeout(() => {
                            s.remove()
                            reject(new Error(`Timeout loading ${src}`))
                        }, 10000) // 10 second timeout

                        s.onload = () => {
                            clearTimeout(timeout)
                            resolve()
                        }
                        s.onerror = () => {
                            clearTimeout(timeout)
                            s.remove()
                            reject(new Error(`Script load error for ${src}`))
                        }
                        document.body.appendChild(s)
                    })

                    // Worker path MUST match the script origin
                     
                    const loadedPdfjsLib = (window as unknown as { pdfjsLib?: any }).pdfjsLib
                    if (loadedPdfjsLib?.GlobalWorkerOptions) {
                        const base = src.replace(/\/pdf\.min\.js$/, "")
                        const workerPath = `${base}/pdf.worker.min.js`

                        try {
                            // Test if worker is accessible
                            const workerResponse = await fetch(workerPath, { method: "HEAD" })
                            if (workerResponse.ok) {
                                loadedPdfjsLib.GlobalWorkerOptions.workerSrc = workerPath
                            } else {
                                // Try alternative worker path
                                const altWorkerPath = `${base}/pdf.worker.js`
                                const altResponse = await fetch(altWorkerPath, { method: "HEAD" })
                                if (altResponse.ok) {
                                    loadedPdfjsLib.GlobalWorkerOptions.workerSrc = altWorkerPath
                                } else {
                                    console.warn("Worker files not accessible, PDF.js will use fallback mode")
                                    // Let PDF.js handle worker setup automatically
                                }
                            }
                        } catch (workerError) {
                            console.warn("Worker accessibility check failed:", workerError)
                            // Set worker path anyway, PDF.js will handle fallback
                            loadedPdfjsLib.GlobalWorkerOptions.workerSrc = workerPath
                        }
                    }

                    if (loadedPdfjsLib && typeof loadedPdfjsLib.getDocument === 'function') {
                        setPdfJsLoaded(true)
                        setStatusMessage("Ready to analyse your documents")
                        console.log(`Successfully loaded PDF.js from: ${src}`)
                        return
                    }
                } catch (err) {
                    console.warn(`Failed to load from ${src}:`, err)
                    // Continue to next CDN
                }
            }

            // If we reach here, all CDNs failed
            setStatusMessage(
                "Failed to load PDF.js from all CDNs. Please check your network connection and try refreshing the page.",
            )

            // Provide manual retry option
            setTimeout(() => {
                setStatusMessage("Click here to retry loading PDF.js")
            }, 3000)
        }

        loadPdfJs()
    }, [])

    // Anthropic AI Integration
    const callGeminiApi = useCallback(async (prompt: string, expectJson = false) => {
        const apiKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || ""
        const apiUrl = "https://api.anthropic.com/v1/messages"

        const payload = {
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            messages: [{ role: "user", content: prompt }]
        }

        try {
            let response: Response | undefined
            let retries = 0
            const maxRetries = 5
            let delay = 1000

            while (retries < maxRetries) {
                response = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": apiKey,
                        "anthropic-version": "2023-06-01",
                        "anthropic-dangerous-direct-browser-access": "true"
                    },
                    body: JSON.stringify(payload),
                })

                if (response.ok) {
                    break
                }

                if (response.status === 429 || response.status >= 500) {
                    console.warn(`Anthropic API call failed with status ${response.status}. Retrying in ${delay / 1000}s...`)
                    await new Promise(resolve => setTimeout(resolve, delay))
                    delay *= 2
                    retries++
                } else {
                    const errorData = await response.json().catch(() => ({ error: { message: `HTTP error! status: ${response?.status}` } }))
                    console.error("API Error Data:", errorData)
                    throw new Error(errorData.error?.message || `API request failed with status ${response?.status}`)
                }
            }

            if (!response || !response.ok) {
                throw new Error(`API request failed after ${maxRetries} retries.`)
            }

            const result = await response.json()

            if (!result.content || !result.content[0] || !result.content[0].text) {
                console.error("Invalid API response structure:", result)
                throw new Error("Invalid API response structure")
            }

            const textResponse = result.content[0].text

            if (expectJson) {
                try {
                    const jsonMatch = textResponse.match(/\{[\s\S]*\}/)
                    if (jsonMatch) {
                        return JSON.parse(jsonMatch[0])
                    }
                    return JSON.parse(textResponse)
                } catch (_e) {
                    console.error("Failed to parse JSON response:", textResponse)
                    throw new Error("AI returned invalid JSON.")
                }
            } else {
                return textResponse
            }

        } catch (error) {
            console.error("Anthropic API Call Error:", error)
            const message = error instanceof Error ? error.message : String(error)
            setStatusMessage(`Error communicating with AI: ${message}`)
            throw new Error(`Anthropic AI Error: ${message}`)
        }
    }, []);

    // --- TTS Functions Start ---

    // Helper: Convert Base64 to ArrayBuffer
    const base64ToArrayBuffer = (base64: string) => {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    };

    // Helper: Convert raw PCM16 data to a WAV Blob
    const pcmToWav = (pcmData: Int16Array, sampleRate: number): Blob => {
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = pcmData.length * (bitsPerSample / 8);
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // RIFF header
        view.setUint32(0, 0x52494646, false); // "RIFF"
        view.setUint32(4, 36 + dataSize, true);
        view.setUint32(8, 0x57415645, false); // "WAVE"
        // "fmt " sub-chunk
        view.setUint32(12, 0x666d7420, false); // "fmt "
        view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
        view.setUint16(20, 1, true); // Audio format (1 for PCM)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        // "data" sub-chunk
        view.setUint32(36, 0x64617461, false); // "data"
        view.setUint32(40, dataSize, true);

        // Write PCM data
        const pcmAsDataView = new DataView(pcmData.buffer);
        for (let i = 0; i < pcmData.length; i++) {
            view.setInt16(44 + i * 2, pcmAsDataView.getInt16(i * 2, true), true);
        }

        return new Blob([view], { type: "audio/wav" });
    };

    // Gemini TTS API Call
    const callElevenLabsTTS = async (textToSpeak: string) => {
        // Stop any currently playing audio
        if (audioPlayer) {
            audioPlayer.pause();
            setAudioPlayer(null);
        }

        const apiKey = ""; // Handled by environment
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{
                parts: [{ text: `Speak in a clear, informative tone: ${textToSpeak}` }]
            }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Kore" } // A clear, firm voice
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                console.error("TTS API Error:", err);
                throw new Error(`TTS API failed: ${err.error?.message || response.status}`);
            }

            const result = await response.json();
            const part = result?.candidates?.[0]?.content?.parts?.[0];
            const audioData = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;

            if (audioData && mimeType && mimeType.startsWith("audio/")) {
                const sampleRateMatch = mimeType.match(/rate=(\d+)/);
                const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000; // Default to 24kHz

                const pcmData = base64ToArrayBuffer(audioData);
                const pcm16 = new Int16Array(pcmData);
                const wavBlob = pcmToWav(pcm16, sampleRate);
                const audioUrl = URL.createObjectURL(wavBlob);

                return audioUrl; // Return the URL to be played
            } else {
                throw new Error("Invalid TTS response format or no audio data.");
            }
        } catch (error) {
            console.error("callElevenLabsTTS Error:", error);
            throw error; // Re-throw to be caught by the handler
        }
    };

    // Handler function to be called by buttons
    const handleTextToSpeech = async (text: string, id: string) => {
        // If clicking the button for the audio that is already playing, stop it.
        if (audioPlayer && currentPlayingId === id) {
            audioPlayer.pause();
            setAudioPlayer(null);
            setCurrentPlayingId(null);
            return;
        }

        // Stop any other audio that might be playing
        if (audioPlayer) {
            audioPlayer.pause();
        }

        setIsBufferingAudio(true);
        setCurrentPlayingId(id);
        setStatusMessage("✨ Generating audio...");

        try {
            const audioUrl = await callElevenLabsTTS(text);
            const newAudio = new Audio(audioUrl);

            newAudio.onplay = () => {
                setIsBufferingAudio(false);
                setStatusMessage("Playing audio...");
            };

            newAudio.onended = () => {
                setAudioPlayer(null);
                setCurrentPlayingId(null);
                setStatusMessage("Audio finished.");
                URL.revokeObjectURL(audioUrl); // Clean up blob URL
            };

            newAudio.onpause = () => {
                // This handles manual pause or stop
                setAudioPlayer(null);
                setCurrentPlayingId(null);
                setStatusMessage("Audio stopped.");
                if (newAudio.src) {
                    URL.revokeObjectURL(newAudio.src); // Clean up blob URL
                }
            };

            newAudio.play();
            setAudioPlayer(newAudio);

        } catch (error) {
            console.error("TTS Error:", error);
            const message = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error generating audio: ${message}`);
            setIsBufferingAudio(false);
            setCurrentPlayingId(null);
        }
    };

    // --- TTS Functions End ---


    // Drag and drop handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true)
        } else if (e.type === "dragleave") {
            setDragActive(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)

        if (!pdfJsLoaded) {
            setStatusMessage("PDF.js is still loading. Please wait a moment.")
            return
        }

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0]
            if (file.type === "application/pdf") {
                handleFileUpload({ target: { files: [file] } } as any)
            } else {
                setStatusMessage("Invalid file type. Please upload a PDF.")
            }
        }
    }

    // Build text layer overlay for text selection and highlighting
    const buildTextLayer = useCallback(async (page: any, viewport: any) => {
        const textLayerDiv = textLayerRef.current
        if (!textLayerDiv) return

        // Clear previous text layer
        textLayerDiv.innerHTML = ''

        try {
            const textContent = await page.getTextContent()

            // Set text layer size to match canvas
            textLayerDiv.style.width = `${viewport.width}px`
            textLayerDiv.style.height = `${viewport.height}px`
            // Set required CSS variable for PDF.js renderTextLayer
            textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale))

            // Use official PDF.js renderTextLayer API
            const pdfjsLib = (window as any).pdfjsLib
            if (pdfjsLib && pdfjsLib.renderTextLayer) {
                const textLayerRenderTask = pdfjsLib.renderTextLayer({
                    textContentSource: textContent,
                    container: textLayerDiv,
                    viewport: viewport,
                    textDivs: []
                })
                await textLayerRenderTask.promise
            } else {
                // Fallback: manual span creation if renderTextLayer not available
                const fragment = document.createDocumentFragment()

                textContent.items.forEach((item: any, index: number) => {
                    const span = document.createElement('span')
                    span.textContent = item.str
                    span.dataset.textIndex = String(index)

                    // Get transform from viewport and text item
                    const tx = viewport.transform
                    const itemTx = item.transform

                    // Compose transforms: viewport * item
                    const a = tx[0] * itemTx[0] + tx[2] * itemTx[1]
                    const b = tx[1] * itemTx[0] + tx[3] * itemTx[1]
                    const c = tx[0] * itemTx[2] + tx[2] * itemTx[3]
                    const d = tx[1] * itemTx[2] + tx[3] * itemTx[3]
                    const e = tx[0] * itemTx[4] + tx[2] * itemTx[5] + tx[4]
                    const f = tx[1] * itemTx[4] + tx[3] * itemTx[5] + tx[5]

                    // Calculate font size from transformation matrix
                    const fontSize = Math.sqrt(b * b + d * d)

                    // Use native PDF.js width/height properties (scaled by viewport)
                    const textWidth = (item.width || 0) * viewport.scale
                    const textHeight = (item.height || fontSize / viewport.scale) * viewport.scale

                    // Set explicit width and height for proper selection
                    span.style.width = `${textWidth}px`
                    span.style.height = `${textHeight}px`

                    // Apply transform and font size
                    span.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`
                    span.style.fontSize = `${fontSize}px`

                    fragment.appendChild(span)
                })

                textLayerDiv.appendChild(fragment)
            }
        } catch (error) {
            console.error("Error building text layer:", error)
        }
    }, [])

    const renderPage = useCallback(async (pdf: any, pageNum: number) => {
        const canvas = canvasRef.current
        if (!pdf || !canvas) return
        const context = canvas.getContext("2d")
        if (!context) {
            console.warn("Canvas context not ready yet, retrying...")
            // try again on next frame
            requestAnimationFrame(() => renderPage(pdf, pageNum))
            return
        }
        try {
            const page = await pdf.getPage(pageNum)
            const viewport = page.getViewport({ scale: 2.0 })
            const canvasElement = canvasRef.current
            if (!canvasElement) {
                console.error("Canvas element not found")
                return
            }
            const ctx = canvasElement.getContext("2d")

            if (!ctx) {
                console.error("Could not get canvas context")
                return
            }

            canvasElement.height = viewport.height
            canvasElement.width = viewport.width

            // Clear canvas first
            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height)

            const renderContext = {
                canvasContext: ctx,
                viewport: viewport,
            }

            await page.render(renderContext).promise

            // Build text layer after canvas render
            await buildTextLayer(page, viewport)

            setCurrentPage(pageNum)
            console.log(`Successfully rendered page ${pageNum}`)
        } catch (error) {
            console.error("Error rendering page:", error)
            const message = error instanceof Error ? error.message : String(error)
            setStatusMessage(`Error rendering page ${pageNum}: ${message}`)
        }
    }, [buildTextLayer])

    // Render first page once the PDF is set **and** the canvas is mounted
    useEffect(() => {
        if (pdfDoc && canvasRef.current) {
            renderPage(pdfDoc, 1)
        }
    }, [pdfDoc, renderPage])

    // Enhanced figure extraction with better PDF.js compatibility
    const extractFiguresFromPage = async (page: any, pageNum: number) => {
        if (!window.pdfjsLib) return []

        const diagnostics: {
            pageNum: number
            totalOperators: number
            imageOperators: number
            extractedImages: number
            filteredImages: number
            errors: string[]
            processingTime: number
            imageDetails: { name: string; width: number; height: number; kind: number; hasAlpha: boolean; dataLength: number; colorSpace: string }[]
        } = {
            pageNum,
            totalOperators: 0,
            imageOperators: 0,
            extractedImages: 0,
            filteredImages: 0,
            errors: [],
            processingTime: 0,
            imageDetails: [],
        }

        const startTime = Date.now()
         
        const figures: any[] = []

        try {
            console.log(`Starting figure extraction for page ${pageNum}`)

            // Get operator list
            const ops = await page.getOperatorList()
            diagnostics.totalOperators = ops.fnArray?.length || 0
            console.log(`Page ${pageNum}: Found ${diagnostics.totalOperators} operators`)

            if (!ops.fnArray || ops.fnArray.length === 0) {
                console.warn(`No operators found on page ${pageNum}`)
                return figures
            }

            // Try to get all objects first to see what's available
            const objKeys = Object.keys(page.objs.objs || {})
            console.log(`Page ${pageNum}: Available objects:`, objKeys)

            // Look for image operators with multiple detection methods
            const imageOperatorTypes = [
                92, // paintImageXObject
                93, // paintInlineImageXObject
                94, // paintImageMaskXObject
            ]

            // Also try to access via window.pdfjsLib.OPS if available
            if (window.pdfjsLib.OPS) {
                const opsConstants = window.pdfjsLib.OPS
                if (opsConstants.paintImageXObject) imageOperatorTypes.push(opsConstants.paintImageXObject)
                if (opsConstants.paintInlineImageXObject) imageOperatorTypes.push(opsConstants.paintInlineImageXObject)
                if (opsConstants.paintImageMaskXObject) imageOperatorTypes.push(opsConstants.paintImageMaskXObject)
            }

            console.log(`Page ${pageNum}: Looking for image operators:`, imageOperatorTypes)

            for (let i = 0; i < ops.fnArray.length; i++) {
                const opType = ops.fnArray[i]

                if (imageOperatorTypes.includes(opType)) {
                    diagnostics.imageOperators++
                    console.log(`Page ${pageNum}: Found image operator ${opType} at position ${i}`)

                    try {
                        const args = ops.argsArray[i]
                        const imageName = args?.[0]

                        if (!imageName) {
                            console.warn(`Page ${pageNum}: No image name found for operator at position ${i}`)
                            continue
                        }

                        console.log(`Page ${pageNum}: Attempting to get image: ${imageName}`)

                        // Try multiple ways to get the image object
                        let image = null

                        try {
                            image = await page.objs.get(imageName)
                        } catch (e) {
                            console.warn(`Page ${pageNum}: Failed to get image ${imageName} via objs.get:`, e)

                            // Try direct access
                            if (page.objs.objs && page.objs.objs[imageName]) {
                                image = page.objs.objs[imageName]
                                console.log(`Page ${pageNum}: Got image ${imageName} via direct access`)
                            }
                        }

                        if (!image) {
                            diagnostics.errors.push(`Could not retrieve image object: ${imageName}`)
                            continue
                        }

                        console.log(`Page ${pageNum}: Image ${imageName} properties:`, {
                            width: image.width,
                            height: image.height,
                            kind: image.kind,
                            hasData: !!image.data,
                            dataLength: image.data?.length,
                        })

                        if (image && image.width && image.height) {
                            diagnostics.extractedImages++

                            const imageDetail = {
                                name: imageName,
                                width: image.width,
                                height: image.height,
                                kind: image.kind,
                                hasAlpha: !!image.smask,
                                dataLength: image.data?.length || 0,
                                colorSpace: image.kind === 1 ? "Grayscale" : image.kind === 2 ? "RGB" : "Other",
                            }
                            diagnostics.imageDetails.push(imageDetail)

                            // More permissive filtering
                            const minSize = 50 // Even smaller minimum
                            const aspectRatio = image.width / image.height
                            const isReasonableSize = image.width >= minSize && image.height >= minSize
                            const isNotTooWide = aspectRatio <= 20 && aspectRatio >= 0.05 // More permissive

                            console.log(
                                `Page ${pageNum}: Image ${imageName} - Size: ${image.width}x${image.height}, Aspect: ${aspectRatio.toFixed(2)}, Reasonable: ${isReasonableSize}, NotTooWide: ${isNotTooWide}`,
                            )

                            if (isReasonableSize && isNotTooWide) {
                                diagnostics.filteredImages++

                                try {
                                    let dataUrl = null

                                    if (image.data) {
                                        // Create canvas and convert image data
                                        const tempCanvas = document.createElement("canvas")
                                        tempCanvas.width = image.width
                                        tempCanvas.height = image.height
                                        const ctx = tempCanvas.getContext("2d")

                                        if (ctx) {
                                            const imageData = ctx.createImageData(image.width, image.height)
                                            const data = image.data

                                            // Handle different color spaces
                                            if (image.kind === 1) {
                                                // Grayscale
                                                for (let j = 0; j < data.length; j++) {
                                                    const gray = data[j]
                                                    imageData.data[j * 4] = gray
                                                    imageData.data[j * 4 + 1] = gray
                                                    imageData.data[j * 4 + 2] = gray
                                                    imageData.data[j * 4 + 3] = 255
                                                }
                                            } else if (image.kind === 2) {
                                                // RGB
                                                if (data.length === image.width * image.height * 4) {
                                                    // RGBA
                                                    imageData.data.set(data)
                                                } else if (data.length === image.width * image.height * 3) {
                                                    // RGB
                                                    for (let j = 0, k = 0; j < data.length; j += 3, k += 4) {
                                                        imageData.data[k] = data[j]
                                                        imageData.data[k + 1] = data[j + 1]
                                                        imageData.data[k + 2] = data[j + 2]
                                                        imageData.data[k + 3] = 255
                                                    }
                                                } else {
                                                    // Fallback - try to map data
                                                    const pixelCount = image.width * image.height
                                                    const bytesPerPixel = Math.max(1, data.length / pixelCount)
                                                    for (let j = 0; j < pixelCount; j++) {
                                                        const srcIndex = Math.floor(j * bytesPerPixel)
                                                        imageData.data[j * 4] = data[srcIndex] || 0
                                                        imageData.data[j * 4 + 1] = data[srcIndex + 1] || data[srcIndex] || 0
                                                        imageData.data[j * 4 + 2] = data[srcIndex + 2] || data[srcIndex] || 0
                                                        imageData.data[j * 4 + 3] = 255
                                                    }
                                                }
                                            } else {
                                                // Other color spaces - try best effort conversion
                                                const pixelCount = image.width * image.height
                                                const bytesPerPixel = Math.max(1, Math.floor(data.length / pixelCount))

                                                for (let j = 0; j < pixelCount; j++) {
                                                    const srcIndex = j * bytesPerPixel
                                                    if (bytesPerPixel >= 3) {
                                                        imageData.data[j * 4] = data[srcIndex] || 0
                                                        imageData.data[j * 4 + 1] = data[srcIndex + 1] || 0
                                                        imageData.data[j * 4 + 2] = data[srcIndex + 2] || 0
                                                    } else {
                                                        // Grayscale fallback
                                                        const gray = data[srcIndex] || 0
                                                        imageData.data[j * 4] = gray
                                                        imageData.data[j * 4 + 1] = gray
                                                        imageData.data[j * 4 + 2] = gray
                                                        imageData.data[j * 4 + 3] = 255
                                                    }
                                                    imageData.data[j * 4 + 3] = 255
                                                }
                                            }

                                            ctx.putImageData(imageData, 0, 0)
                                            dataUrl = tempCanvas.toDataURL()
                                        }
                                    } else if (image.bitmap) {
                                        // Some PDF.js versions provide bitmap directly
                                        const tempCanvas = document.createElement("canvas")
                                        tempCanvas.width = image.width
                                        tempCanvas.height = image.height
                                        const ctx = tempCanvas.getContext("2d")
                                        if (ctx) {
                                            ctx.drawImage(image.bitmap, 0, 0)
                                            dataUrl = tempCanvas.toDataURL()
                                        }
                                    }

                                    if (dataUrl) {
                                        figures.push({
                                            id: `fig-${pageNum}-${figures.length + 1}`,
                                            pageNum: pageNum,
                                            dataUrl: dataUrl,
                                            width: image.width,
                                            height: image.height,
                                            caption: null,
                                            extractionMethod: "PDF.js Enhanced",
                                            colorSpace: imageDetail.colorSpace,
                                            hasAlpha: imageDetail.hasAlpha,
                                        })
                                        console.log(`Page ${pageNum}: Successfully extracted figure ${figures.length}`)
                                    } else {
                                        diagnostics.errors.push(`Could not convert image data to canvas: ${imageName}`)
                                    }
                                } catch (conversionError) {
                                    diagnostics.errors.push(`Error converting image ${imageName}: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`)
                                    console.error(`Page ${pageNum}: Conversion error for ${imageName}:`, conversionError)
                                }
                            } else {
                                diagnostics.errors.push(
                                    `Filtered out ${imageName}: size ${image.width}x${image.height}, aspect ratio ${aspectRatio.toFixed(2)}`,
                                )
                            }
                        } else {
                            diagnostics.errors.push(`Invalid image object for ${imageName}: missing dimensions or data`)
                        }
                    } catch (error) {
                        diagnostics.errors.push(`Error processing image operator ${i}: ${error instanceof Error ? error.message : String(error)}`)
                        console.error(`Page ${pageNum}: Error processing operator ${i}:`, error)
                    }
                }
            }

            // Alternative approach: try to extract images from resources
            try {
                const resources = await page.getAnnotations()
                console.log(`Page ${pageNum}: Found ${resources.length} annotations`)
            } catch (e) {
                console.log(`Page ${pageNum}: No annotations or error getting annotations:`, e)
            }
        } catch (error) {
            diagnostics.errors.push(`Page processing error: ${error instanceof Error ? error.message : String(error)}`)
            console.error(`Page ${pageNum}: Processing error:`, error)
        }

        diagnostics.processingTime = Date.now() - startTime
        console.log(
            `Page ${pageNum}: Extraction completed in ${diagnostics.processingTime}ms, found ${figures.length} figures`,
        )

        // Store diagnostics
        setExtractionDiagnostics((prev: typeof extractionDiagnostics) => ({
            ...prev,
            [pageNum]: diagnostics,
        }))

        return figures
    }

    const findFigureCaptions = (pageTextContents: any[], figures: any[]) => {
        figures.forEach((figure, index) => {
            const pageTexts = pageTextContents[figure.pageNum]
            if (!pageTexts) return

            const pageText = pageTexts.map((item: any) => item.str).join(" ")
            const captionPatterns = [
                /Fig(?:ure)?\s*(\d+)[:.]?\s*([^.]+(?:\.[^.]+)*)/gi,
                /Figure\s*(\d+)[:.]?\s*([^.]+(?:\.[^.]+)*)/gi,
                /FIG\s*(\d+)[:.]?\s*([^.]+(?:\.[^.]+)*)/gi,
            ]

            for (const pattern of captionPatterns) {
                const matches = [...pageText.matchAll(pattern)]
                if (matches.length > 0) {
                    const match =
                        matches.find((m) => Number.parseInt(m[1]) === (figure.figureNumberGuess || index + 1)) || matches[0]
                    if (match) {
                        figure.caption = `Figure ${match[1]}: ${match[2].trim()}`
                        figure.figureNumber = Number.parseInt(match[1])
                        break
                    }
                }
            }
            if (!figure.caption) figure.caption = `Figure ${index + 1} (auto-named)`
        })
        return figures
    }

    // --- New Geometric Table Extraction (Method A + B from guide) ---

    // Step 1: Extract Text with Coordinates
    const extractTextWithPositions = async (page: any): Promise<TextItem[]> => {
        const textContent = await page.getTextContent()
        const viewport = page.getViewport({ scale: 1.0 })

        return textContent.items.map((item: any) => ({
            text: item.str,
            x: item.transform[4],
            y: viewport.height - item.transform[5], // Flip Y axis
            width: item.width,
            height: item.height,
            fontName: item.fontName,
        }))
    }

    // Step 2: Group Items into Rows
    const groupItemsByRow = (items: TextItem[], tolerance = 5): TextItem[][] => {
        // Sort by Y coordinate
        const sorted = [...items].sort((a, b) => a.y - b.y)

        const rows: TextItem[][] = []
        let currentRow: TextItem[] = []
        let lastY = -Infinity

        sorted.forEach(item => {
            if (Math.abs(item.y - lastY) > tolerance) {
                // New row
                if (currentRow.length > 0) {
                    rows.push(currentRow.sort((a, b) => a.x - b.x)) // Sort by X
                }
                currentRow = [item]
                lastY = item.y
            } else {
                // Same row
                currentRow.push(item)
            }
        })

        if (currentRow.length > 0) {
            rows.push(currentRow.sort((a, b) => a.x - b.x))
        }

        return rows
    }

    // Step 3: Detect Column Alignment
    const detectColumnPositions = (row: TextItem[], tolerance = 10): number[] => {
        const positions = row.map(item => item.x)

        // Cluster nearby X positions
        const clusters: number[][] = []

        positions.forEach(pos => {
            const existingCluster = clusters.find(cluster =>
                cluster.some(p => Math.abs(p - pos) < tolerance)
            )

            if (existingCluster) {
                existingCluster.push(pos)
            } else {
                clusters.push([pos])
            }
        })

        // Return average of each cluster
        return clusters
            .map(cluster => cluster.reduce((sum, val) => sum + val, 0) / cluster.length)
            .sort((a, b) => a - b)
    }

    // Step 4: Find Table Regions
    const alignsWithColumns = (
        positions: number[],
        tableColumns: number[],
        tolerance = 15
    ): boolean => {
        // Check if at least 70% of positions align with existing columns
        const aligned = positions.filter(pos =>
            tableColumns.some(col => Math.abs(pos - col) < tolerance)
        )
        return aligned.length >= positions.length * 0.7
    }

    const detectTableRegions = (rows: TextItem[][]): TableRegion[] => {
        const tableRegions: TableRegion[] = []
        let currentTable: TableRegion | null = null

        rows.forEach((row, rowIndex) => {
            const columnPositions = detectColumnPositions(row)

            // Check if row is part of a table
            const hasMultipleColumns = columnPositions.length >= 3
            const alignsWithTable = currentTable &&
                alignsWithColumns(columnPositions, currentTable.columnPositions)

            if (alignsWithTable && currentTable) {
                // Continue existing table
                currentTable.rows.push(row)
            } else if (hasMultipleColumns) {
                // Start new table
                if (currentTable && currentTable.rows.length >= 2) {
                    tableRegions.push(currentTable)
                }
                currentTable = {
                    startRow: rowIndex,
                    rows: [row],
                    columnPositions: columnPositions,
                }
            } else {
                // Not a table row
                if (currentTable && currentTable.rows.length >= 2) {
                    tableRegions.push(currentTable)
                }
                currentTable = null
            }
        })

        // Don't forget the last table
        if (currentTable && (currentTable as TableRegion).rows.length >= 2) {
            tableRegions.push(currentTable as TableRegion)
        }

        return tableRegions
    }

    // Step 5: Convert to Structured Grid
    const findClosestColumn = (x: number, columns: number[]): number => {
        let minDist = Infinity
        let closestIdx = 0

        columns.forEach((col, idx) => {
            const dist = Math.abs(x - col)
            if (dist < minDist) {
                minDist = dist
                closestIdx = idx
            }
        })

        return closestIdx
    }

    const calculateBoundingBox = (items: TextItem[]) => {
        const xs = items.map(i => i.x)
        const ys = items.map(i => i.y)
        const rights = items.map(i => i.x + i.width)
        const bottoms = items.map(i => i.y + i.height)

        return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...rights) - Math.min(...xs),
            height: Math.max(...bottoms) - Math.min(...ys),
        }
    }

    const convertToStructuredTable = (tableRegion: TableRegion) => {
        const rows = tableRegion.rows
        const columnPositions = tableRegion.columnPositions

        // Create empty grid
        const grid: string[][] = []

        rows.forEach(row => {
            const gridRow: string[] = new Array(columnPositions.length).fill('')

            row.forEach((item: TextItem) => {
                // Find which column this item belongs to
                const colIndex = findClosestColumn(item.x, columnPositions)

                // Concatenate text if multiple items in same cell
                gridRow[colIndex] = (gridRow[colIndex] + ' ' + item.text).trim()
            })

            grid.push(gridRow)
        })

        // First row is typically headers
        const headers = grid[0]
        const dataRows = grid.slice(1)

        return {
            headers,
            rows: dataRows,
            rawGrid: grid,
            columnPositions,
            boundingBox: calculateBoundingBox(rows.flat()),
        }
    }

    // Complete Table Extraction Pipeline (Geometric)
    const extractTablesFromPage = async (page: any, pageNum: number): Promise<StructuredTable[]> => {
        // 1. Get text with positions
        const textItems = await extractTextWithPositions(page)

        // 2. Group into rows
        const rows = groupItemsByRow(textItems)

        // 3. Detect table regions
        const tableRegions = detectTableRegions(rows)

        // 4. Convert to structured format
        const tables = tableRegions.map((region, idx) => {
            const structured = convertToStructuredTable(region)

            return {
                id: `table-${pageNum}-${idx + 1}`,
                pageNum,
                ...structured,
                extractionMethod: 'geometric_detection',
            }
        })

        return tables
    }

    // Vision-based Table Extraction using Claude Vision API
    const extractTablesWithVision = async (page: any, pageNum: number): Promise<StructuredTable[]> => {
        const apiKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || ""
        const apiUrl = "https://api.anthropic.com/v1/messages"

        try {
            // Render page to canvas and get base64 image
            const scale = 2.0 // Higher resolution for better table detection
            const viewport = page.getViewport({ scale })

            const canvas = document.createElement('canvas')
            canvas.width = viewport.width
            canvas.height = viewport.height
            const ctx = canvas.getContext('2d')

            if (!ctx) {
                throw new Error('Could not get canvas context')
            }

            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise

            // Convert to base64 (remove data URL prefix)
            const dataUrl = canvas.toDataURL('image/png')
            const base64ImageData = dataUrl.replace(/^data:image\/png;base64,/, '')

            // Call Claude Vision API
            const payload = {
                model: "claude-sonnet-4-20250514",
                max_tokens: 8192,
                messages: [{
                    role: "user",
                    content: [
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: "image/png",
                                data: base64ImageData
                            }
                        },
                        {
                            type: "text",
                            text: `Analyze this PDF page and extract ALL tables you can find. For each table:
1. Extract the complete structure with headers and all data rows
2. Preserve the exact text content in each cell
3. Identify the table title/caption if visible

Return a JSON object with this exact structure:
{
  "tables": [
    {
      "title": "Table title or description",
      "caption": "Full caption text if visible, or null",
      "headers": ["Column 1", "Column 2", "Column 3"],
      "rows": [
        ["row1_col1", "row1_col2", "row1_col3"],
        ["row2_col1", "row2_col2", "row2_col3"]
      ]
    }
  ]
}

If no tables are found, return: {"tables": []}

Important:
- Include ALL rows, not just a sample
- Preserve numbers, symbols, and special characters exactly as shown
- If a cell is empty, use an empty string ""
- Detect merged cells and handle appropriately`
                        }
                    ]
                }]
            }

            let response: Response | undefined
            let retries = 0
            const maxRetries = 3
            let delay = 1000

            while (retries < maxRetries) {
                response = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": apiKey,
                        "anthropic-version": "2023-06-01",
                        "anthropic-dangerous-direct-browser-access": "true"
                    },
                    body: JSON.stringify(payload),
                })

                if (response.ok) {
                    break
                }

                if (response.status === 429 || response.status >= 500) {
                    console.warn(`Vision API call failed with status ${response.status}. Retrying in ${delay / 1000}s...`)
                    await new Promise(resolve => setTimeout(resolve, delay))
                    delay *= 2
                    retries++
                } else {
                    const errorData = await response.json().catch(() => ({ error: { message: `HTTP error! status: ${response?.status}` } }))
                    throw new Error(errorData.error?.message || `Vision API request failed with status ${response?.status}`)
                }
            }

            if (!response || !response.ok) {
                throw new Error(`Vision API request failed after ${maxRetries} retries.`)
            }

            const result = await response.json()

            if (!result.content || !result.content[0] || !result.content[0].text) {
                throw new Error("Invalid Vision API response structure")
            }

            const textResponse = result.content[0].text

            // Parse JSON response
            let parsedResult
            try {
                const jsonMatch = textResponse.match(/\{[\s\S]*\}/)
                if (jsonMatch) {
                    parsedResult = JSON.parse(jsonMatch[0])
                } else {
                    parsedResult = JSON.parse(textResponse)
                }
            } catch (_e) {
                console.error("Failed to parse Vision API JSON response:", textResponse)
                return []
            }

            // Convert to StructuredTable format
            const tables: StructuredTable[] = (parsedResult.tables || []).map((table: any, idx: number) => ({
                id: `table-${pageNum}-${idx + 1}`,
                pageNum,
                headers: table.headers || [],
                rows: table.rows || [],
                rawGrid: [table.headers || [], ...(table.rows || [])],
                columnPositions: [], // Not applicable for vision extraction
                boundingBox: { x: 0, y: 0, width: viewport.width, height: viewport.height },
                extractionMethod: 'claude_vision',
                title: table.title || `Table ${idx + 1}`,
                caption: table.caption,
                aiEnhanced: true
            }))

            return tables

        } catch (error) {
            console.error(`Vision table extraction failed for page ${pageNum}:`, error)
            return []
        }
    }

    // AI Enhancement (Method B) - Legacy geometric approach
    const enhanceTableWithAI = async (table: StructuredTable, pageText: string) => {
        const prompt = `This table has ${table.rows.length} rows and ${table.headers.length} columns.
Headers: ${table.headers.join(', ')}
First 2 rows: ${JSON.stringify(table.rows.slice(0, 2))}
Page context (first 1000 chars):
${pageText.substring(0, 1000)}

Provide:
1. A descriptive title
2. Caption if visible near the table
3. Corrected headers if they seem incomplete

Respond with JSON only: {
  "title": "Table description",
  "caption": "Full caption or null",
  "correctedHeaders": ["col1", "col2", ...] or null
}`

        try {
            const response = await callGeminiApi(prompt, true)

            return {
                ...table,
                title: response.title || `Table ${table.id}`,
                caption: response.caption,
                headers: response.correctedHeaders || table.headers,
                aiEnhanced: true,
            }
        } catch (error) {
            console.warn('AI enhancement failed:', error)
            return {
                ...table,
                title: `Table ${table.id}`, // Provide a fallback title
                aiEnhanced: false
            }
        }
    }

    // New Table Generation (Method C)
    const generateHTMLTable = (table: StructuredTable) => {
        let html = '<table class="extracted-table">'

        // Headers
        if (table.headers && table.headers.length > 0) {
            html += '<thead><tr>'
            table.headers.forEach((header: string) => {
                html += `<th>${header}</th>`
            })
            html += '</tr></thead>'
        }

        // Body
        html += '<tbody>'
        table.rows.forEach((row: string[]) => {
            html += '<tr>'
            row.forEach((cell: string) => {
                html += `<td>${cell}</td>`
            })
            html += '</tr>'
        })
        html += '</tbody></table>'

        return html
    }

    // New main extraction orchestrator - Uses Claude Vision for accurate table extraction
    const extractTablesFromDocument = useCallback(
        async (pdfDoc: any, _allPageTexts: any[]) => {
            setIsExtractingTables(true)
            const allTables: StructuredTable[] = []

            try {
                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    setStatusMessage(`Extracting tables from page ${i} using Claude Vision...`)
                    const page = await pdfDoc.getPage(i)

                    // Use Claude Vision API for accurate table extraction
                    const visionTables = await extractTablesWithVision(page, i)

                    // Generate HTML for each table
                    for (const table of visionTables) {
                        allTables.push({
                            ...table,
                            htmlTable: generateHTMLTable(table)
                        })
                    }

                    // Small delay between pages to avoid rate limiting
                    if (i < pdfDoc.numPages) {
                        await new Promise(resolve => setTimeout(resolve, 500))
                    }
                }
            } catch (error) {
                console.error("Error extracting tables:", error)
                setStatusMessage("Error extracting tables.")
            } finally {
                setIsExtractingTables(false)
            }
            return allTables
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [], // Dependencies - extractTablesWithVision is stable
    )

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement> | { target: { files: File[] } }) => {
        const file = event.target.files?.[0]
        if (!file || file.type !== "application/pdf") {
            setStatusMessage("Please select a valid PDF file.")
            return
        }

        if (!window.pdfjsLib || !window.pdfjsLib.getDocument) {
            setStatusMessage("PDF.js is still loading. Please try again in a moment.")
            return
        }

        // Stop any playing audio
        if (audioPlayer) {
            audioPlayer.pause();
            setAudioPlayer(null);
            setCurrentPlayingId(null);
        }

        setCurrentPdfName(file.name)
        setPdfFile(file) // Store file for API calls
        setIsProcessing(true)
        setStatusMessage("Uploading PDF to cloud storage...")
        setPdfDoc(null)
        setPageTextContents([])
        setExtractedFigures([])
        setExtractedTables([])
        setHistory([])
        setAnswer("")
        setSummary("")
        setShowAnswer(false)
        setShowSummary(false)

        // Removed the /api/upload-pdf block as it was causing 404 errors.
        // We will proceed directly with local processing.
        setStatusMessage("Processing PDF locally...")

        try {
            // Continue with existing PDF processing logic...
            const arrayBuffer = await file.arrayBuffer()
            const pdfData = new Uint8Array(arrayBuffer)
            const loadedPdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise

            setPdfDoc(loadedPdf)
            setTotalPages(loadedPdf.numPages)
            setCurrentPage(1)

            const allPageTexts: any[] = [null] // 1-indexed
            const allFigures: any[] = []

            setStatusMessage("Extracting text and figures...")
            for (let i = 1; i <= loadedPdf.numPages; i++) {
                const page = await loadedPdf.getPage(i)
                const textContent = await page.getTextContent()
                allPageTexts[i] = textContent.items

                const pageFigures = await extractFiguresFromPage(page, i)
                allFigures.push(...pageFigures)
                setStatusMessage(`Processing page ${i} of ${loadedPdf.numPages}...`)
            }

            const figuresWithCaptions = findFigureCaptions(allPageTexts, allFigures)
            setPageTextContents(allPageTexts)
            setExtractedFigures(figuresWithCaptions)

            setStatusMessage(`PDF processed! Found ${figuresWithCaptions.length} figures. Extracting tables with AI...`)

            // Extract tables using pdf-parse API with Claude vision validation
            if (file) {
                try {
                    // Render pages to images for Claude vision
                    const pageImages: string[] = []
                    for (let i = 1; i <= loadedPdf.numPages; i++) {
                        const page = await loadedPdf.getPage(i)
                        const viewport = page.getViewport({ scale: 1.0 })
                        const canvas = document.createElement('canvas')
                        const context = canvas.getContext('2d')
                        canvas.width = viewport.width
                        canvas.height = viewport.height
                        if (context) {
                            await page.render({ canvasContext: context, viewport }).promise
                            pageImages.push(canvas.toDataURL('image/png'))
                        }
                    }

                    // Call API
                    const formData = new FormData()
                    formData.append('pdf', file)
                    formData.append('pageImages', JSON.stringify(pageImages))

                    const response = await fetch('/api/extract-tables', {
                        method: 'POST',
                        body: formData
                    })

                    if (response.ok) {
                        const data = await response.json()
                        // Convert API response to StructuredTable format with cropped images
                        const tables: StructuredTable[] = await Promise.all(data.tables.map(async (t: any) => {
                            let imageUrl: string | undefined = undefined

                            // Crop table image from page if bounding box is provided
                            if (t.boundingBox && pageImages[t.pageNum - 1]) {
                                try {
                                    const pageImage = pageImages[t.pageNum - 1]
                                    const img = new Image()
                                    await new Promise((resolve, reject) => {
                                        img.onload = resolve
                                        img.onerror = reject
                                        img.src = pageImage
                                    })

                                    // Convert percentage-based bounding box to pixels
                                    const x = (t.boundingBox.x / 100) * img.width
                                    const y = (t.boundingBox.y / 100) * img.height
                                    const width = (t.boundingBox.width / 100) * img.width
                                    const height = (t.boundingBox.height / 100) * img.height

                                    // Create canvas and crop
                                    const cropCanvas = document.createElement('canvas')
                                    cropCanvas.width = width
                                    cropCanvas.height = height
                                    const ctx = cropCanvas.getContext('2d')
                                    if (ctx) {
                                        ctx.drawImage(img, x, y, width, height, 0, 0, width, height)
                                        imageUrl = cropCanvas.toDataURL('image/png')
                                    }
                                } catch (err) {
                                    console.error('Error cropping table image:', err)
                                }
                            }

                            return {
                                id: t.id,
                                pageNum: t.pageNum,
                                headers: t.headers,
                                rows: t.rows,
                                rawGrid: [t.headers, ...t.rows],
                                columnPositions: [],
                                boundingBox: t.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
                                extractionMethod: t.aiValidated ? 'pdf-parse + Claude Vision' : 'pdf-parse',
                                title: t.title,
                                aiEnhanced: t.aiValidated,
                                imageUrl
                            }
                        }))
                        setExtractedTables(tables)
                        setStatusMessage(`PDF processed! Found ${figuresWithCaptions.length} figures and ${tables.length} AI-validated tables.`)
                    } else {
                        // Fallback to old method
                        const tables = await extractTablesFromDocument(loadedPdf, allPageTexts)
                        setExtractedTables(tables)
                        setStatusMessage(`PDF processed! Found ${figuresWithCaptions.length} figures and ${tables.length} tables.`)
                    }
                } catch (error) {
                    console.error('Table extraction API error:', error)
                    // Fallback to old method
                    const tables = await extractTablesFromDocument(loadedPdf, allPageTexts)
                    setExtractedTables(tables)
                    setStatusMessage(`PDF processed! Found ${figuresWithCaptions.length} figures and ${tables.length} tables.`)
                }
            } else {
                // Fallback if no file
                const tables = await extractTablesFromDocument(loadedPdf, allPageTexts)
                setExtractedTables(tables)
                setStatusMessage(`PDF processed! Found ${figuresWithCaptions.length} figures and ${tables.length} tables.`)
            }
        } catch (error: any) {
            console.error("PDF processing error:", error)
            setStatusMessage(`Error: ${error.message || "Failed to process PDF"}`)
            setPdfDoc(null)
            setCurrentPdfName("")
            setPageTextContents([])
            setExtractedFigures([])
            setExtractedTables([])
            setPdfBlobUrl("")
        } finally {
            setIsProcessing(false)
        }
    }

    const openFigureViewer = (figure: any) => {
        setSelectedFigure(figure)
        setZoom(1)
        const figureAnnotations = annotations[figure.id] || { drawings: [], notes: [] }
        setAnnotations({ ...annotations, [figure.id]: figureAnnotations })
    }

    const closeFigureViewer = () => {
        setSelectedFigure(null)
        setIsDrawing(false)
        setCurrentPath([])
        setFigureExplanation("") // Reset explanation on close
        setIsExplainingFigure(false) // Reset loading state on close
    }

    // New functions for Table Viewer Modal
    const openTableViewer = (table: StructuredTable) => {
        setSelectedTable(table)
    }

    const closeTableViewer = () => {
        setSelectedTable(null)
        setTableExplanation("")
        setIsExplainingTable(false)
    }

    const handleAnnotationStart = (e: React.MouseEvent) => {
        if (annotationTool === "select" || !annotationCanvasRef.current) return
        setIsDrawing(true)
        const rect = annotationCanvasRef.current.getBoundingClientRect()
        const x = (e.clientX - rect.left) / zoom
        const y = (e.clientY - rect.top) / zoom
        setCurrentPath([{ x, y, tool: annotationTool, color: annotationColor }])
    }

    const handleAnnotationMove = (e: React.MouseEvent) => {
        if (!isDrawing || annotationTool === "select" || !annotationCanvasRef.current || currentPath.length === 0) return

        const rect = annotationCanvasRef.current.getBoundingClientRect()
        let x = (e.clientX - rect.left) / zoom
        if (!isDrawing || annotationTool === "select" || !annotationCanvasRef.current || currentPath.length === 0) return

        const rect2 = annotationCanvasRef.current.getBoundingClientRect()
        x = (e.clientX - rect2.left) / zoom
        const y = (e.clientY - rect2.top) / zoom

        const newPathSegment = { x, y }
        setCurrentPath((prev) => [...prev, newPathSegment]) // Keep previous segments for redraw

        const ctx = annotationCanvasRef.current.getContext("2d")
        if (!ctx) return

        // Redraw the entire current path for smooth drawing
        ctx.clearRect(0, 0, annotationCanvasRef.current.width, annotationCanvasRef.current.height)
        redrawAnnotations() // Redraw saved annotations first

        // Draw the current in-progress path
        ctx.beginPath()
        ctx.moveTo(currentPath[0].x * zoom, currentPath[0].y * zoom)

        const tool = currentPath[0].tool
        const color = currentPath[0].color

        if (tool === "highlight") {
            ctx.globalAlpha = 0.3
            ctx.strokeStyle = color
            ctx.lineWidth = 20 * zoom
        } else if (tool === "pen") {
            ctx.globalAlpha = 1
            ctx.strokeStyle = color
            ctx.lineWidth = 2 * zoom
        } else if (tool === "eraser") {
            // Eraser is handled differently, usually by clearing parts of existing drawings
            // For live preview, it might draw with a background color or use destination-out
            ctx.globalCompositeOperation = "destination-out"
            ctx.strokeStyle = "rgba(0,0,0,1)" // Color doesn't matter for destination-out
            ctx.lineWidth = 20 * zoom
        }

        for (let i = 1; i < currentPath.length; i++) {
            ctx.lineTo(currentPath[i].x * zoom, currentPath[i].y * zoom)
        }
        ctx.lineTo(x * zoom, y * zoom) // Add current mouse position
        ctx.stroke()

        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = "source-over" // Reset composite operation
    }

    const handleAnnotationEnd = () => {
        if (!isDrawing) return
        setIsDrawing(false)
        if (selectedFigure && currentPath.length > 1) {
            const figureId = selectedFigure.id
            const currentAnnotations = annotations[figureId] || { drawings: [], notes: [] }
            setAnnotations({
                ...annotations,
                [figureId]: {
                    ...currentAnnotations,
                    drawings: [...currentAnnotations.drawings, currentPath],
                },
            })
        }
        setCurrentPath([])
    }

    const redrawAnnotations = useCallback(() => {
        if (!annotationCanvasRef.current || !selectedFigure) return
        const ctx = annotationCanvasRef.current.getContext("2d")
        if (!ctx) return
        ctx.clearRect(0, 0, annotationCanvasRef.current.width, annotationCanvasRef.current.height)

        const figureAnnotations = annotations[selectedFigure.id]
        if (!figureAnnotations || !figureAnnotations.drawings) return

        figureAnnotations.drawings.forEach((path: any[]) => {
            if (path.length < 2) return
            ctx.beginPath()
            ctx.moveTo(path[0].x * zoom, path[0].y * zoom)
            const tool = path[0].tool
            const color = path[0].color

            if (tool === "highlight") {
                ctx.globalAlpha = 0.3
                ctx.strokeStyle = color
                ctx.lineWidth = 20 * zoom
            } else if (tool === "pen") {
                ctx.globalAlpha = 1
                ctx.strokeStyle = color
                ctx.lineWidth = 2 * zoom
            } else if (tool === "eraser") {
                // Eraser paths should be handled by not drawing them or drawing clearRects
                // For simplicity, we might just skip drawing them or apply clearRect logic if needed
                // This example will just skip drawing them for simplicity in redraw
                return
            }

            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x * zoom, path[i].y * zoom)
            }
            ctx.stroke()
            ctx.globalAlpha = 1
        })
    }, [annotations, selectedFigure, zoom])

    useEffect(() => {
        if (selectedFigure && annotationCanvasRef.current && figureCanvasRef.current) {
            // Set canvas dimensions based on figure and zoom
            const canvasWidth = selectedFigure.width * zoom
            const canvasHeight = selectedFigure.height * zoom

            // Ensure figure canvas has the base image (if not using background-image)
            const figCtx = figureCanvasRef.current.getContext("2d")
            if (figCtx) {
                figureCanvasRef.current.width = selectedFigure.width // Store at 1x zoom
                figureCanvasRef.current.height = selectedFigure.height
                const img = new Image()
                img.onload = () => {
                    figCtx.drawImage(img, 0, 0, selectedFigure.width, selectedFigure.height)
                    // Now that base image is drawn, redraw annotations()
                    redrawAnnotations()
                }
                img.src = selectedFigure.dataUrl
            }

            // Annotation canvas should match the display size
            annotationCanvasRef.current.width = canvasWidth
            annotationCanvasRef.current.height = canvasHeight
            redrawAnnotations()
        }
    }, [zoom, selectedFigure, redrawAnnotations])

    const saveAnnotatedFigure = async () => {
        if (!selectedFigure || !figureCanvasRef.current || !annotationCanvasRef.current) return

        const combinedCanvas = document.createElement("canvas")
        combinedCanvas.width = selectedFigure.width
        combinedCanvas.height = selectedFigure.height
        const ctx = combinedCanvas.getContext("2d")
        if (!ctx) return

        // Draw original figure
        ctx.drawImage(figureCanvasRef.current, 0, 0)

        // Draw annotations
        const figureAnnotations = annotations[selectedFigure.id]
        if (figureAnnotations && figureAnnotations.drawings) {
            figureAnnotations.drawings.forEach((path: any[]) => {
                if (path.length < 2) return
                ctx.beginPath()
                ctx.moveTo(path[0].x, path[0].y)
                const tool = path[0].tool
                const color = path[0].color

                if (tool === "highlight") {
                    ctx.globalAlpha = 0.3
                    ctx.strokeStyle = color
                    ctx.lineWidth = 20
                } else if (tool === "pen") {
                    ctx.globalAlpha = 1
                    ctx.strokeStyle = color
                    ctx.lineWidth = 2
                }
                for (let i = 1; i < path.length; i++) {
                    ctx.lineTo(path[i].x, path[i].y)
                }
                ctx.stroke()
                ctx.globalAlpha = 1
            })
        }

        // Removed the /api/save-figure block as it was causing 404 errors.
        // We will proceed directly with the local download fallback.
        try {
            const imageData = combinedCanvas.toDataURL("image/png")
            const filename = `annotated-${selectedFigure.id}.png`

            // Fallback to local download only
            const link = document.createElement("a")
            link.download = filename
            link.href = imageData
            link.click()
            setStatusMessage("Figure saved locally.")

        } catch (error) {
            console.error("Save error:", error)
            setStatusMessage("Failed to save figure locally.")
        }
    }

    const addNote = () => {
        const noteText = prompt("Add a note:")
        if (!noteText || !selectedFigure) return
        const figureId = selectedFigure.id
        const currentAnnotations = annotations[figureId] || { drawings: [], notes: [] }
        setAnnotations({
            ...annotations,
            [figureId]: {
                ...currentAnnotations,
                notes: [
                    ...currentAnnotations.notes,
                    { id: Date.now(), text: noteText, timestamp: new Date().toLocaleString() },
                ],
            },
        })
    }

    const scrollToHighlight = useCallback(() => {
        if (!textViewRef.current) return

        // Look for citation highlights first, then regular highlights
        const citationElements = textViewRef.current.querySelectorAll(".citation-highlight")
        const highlightElements = textViewRef.current.querySelectorAll(".highlight-target")

        const targetElements = citationElements.length > 0 ? citationElements : highlightElements

        if (targetElements.length > 0) {
            targetElements[0].scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
            })
        }
    }, [])

    // Refactored to use native Anthropic Citations API
    const handleAskQuestion = async (questionToAsk?: string) => {
        const currentQuestion = questionToAsk || question;
        if (!currentQuestion.trim() || !pdfFile) return

        setIsAsking(true)
        setShowAnswer(false)
        setFollowUpQuestions([])
        setAiThinking("🔍 Converting PDF for analysis...")
        setStatusMessage("Claude is analyzing your question with native citations...")

        try {
            // Convert PDF to base64
            const arrayBuffer = await pdfFile.arrayBuffer()
            const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            )

            setAiThinking("💭 Analyzing document with native citations...")

            const response = await fetch('/api/qa-with-citations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pdfBase64: base64,
                    question: currentQuestion,
                    documentTitle: currentPdfName
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.details || 'Failed to get answer')
            }

            const data = await response.json()

            // Parse content blocks to build answer with inline citations
            let answerText = ''
            const citationsFound: Array<{
                cited_text: string
                start_page_number?: number
                end_page_number?: number
            }> = []

            // New format: citations are embedded in text blocks
            // Claude already includes [N] markers in the text when citing
            for (const block of data.rawContent) {
                if (block.type === 'text') {
                    answerText += block.text
                    // Extract citations from embedded array
                    if (block.citations && Array.isArray(block.citations)) {
                        for (const cite of block.citations) {
                            citationsFound.push({
                                cited_text: cite.cited_text,
                                start_page_number: cite.start_page_number,
                                end_page_number: cite.end_page_number
                            })
                        }
                    }
                }
            }

            setNativeCitations(citationsFound)
            setAnswer(answerText)
            setCitations([]) // Clear old-style citations

            // Set first citation as highlighted
            if (citationsFound.length > 0) {
                const firstCitation = citationsFound[0]
                setSourceQuote(firstCitation.cited_text)
                setHighlightedText(firstCitation.cited_text)
                setHighlightedPage(firstCitation.start_page_number || 1)

                // Navigate to first citation page
                if (pdfDoc && firstCitation.start_page_number && firstCitation.start_page_number !== currentPage) {
                    await renderPage(pdfDoc, firstCitation.start_page_number)
                }
            }

            setShowAnswer(true)
            setAiThinking("")
            setActiveTab("viewer")

            const pageImage = canvasRef.current?.toDataURL("image/jpeg", 0.4)
            const historyEntry = {
                id: Date.now(),
                pdfName: currentPdfName,
                question: currentQuestion,
                answer: answerText,
                sourceQuote: citationsFound[0]?.cited_text || '',
                pageNumber: citationsFound[0]?.start_page_number || 1,
                pageImage,
                timestamp: new Date().toLocaleString(),
                citations: [],
                referencedFigures: [],
                referencedTables: [],
                nativeCitations: citationsFound,
            }
            setHistory((prev) => [historyEntry, ...prev])
            setTimeout(scrollToHighlight, 100)
            setStatusMessage(`Answer found with ${citationsFound.length} citations!`)
        } catch (error: any) {
            console.error("Q&A Error:", error)
            setAnswer(`Error: ${error.message}`)
            setShowAnswer(true)
            setStatusMessage("Error processing question.")
            setAiThinking("")
        } finally {
            setIsAsking(false)
        }
    }

    // New Gemini Feature: Explain Figure
    const handleExplainFigure = async () => {
        if (!selectedFigure || !pageTextContents[selectedFigure.pageNum]) return;

        setIsExplainingFigure(true);
        setFigureExplanation("");

        try {
            const figure = selectedFigure;
            const pageText = pageTextContents[figure.pageNum]?.map((item: any) => item.str).join(" ") || "";

            const prompt = `Here is the caption for a figure from a research paper: 
      "${figure.caption}"
      
      Here is the text from the page (page ${figure.pageNum}) where the figure appears (truncated):
      "${pageText.substring(0, 3000)}..."
      
      Please provide a concise, one-paragraph explanation of what this figure likely shows and its importance in the context of the paper, based on both the caption and the page text. 
      Start your explanation directly (e.g., "This figure shows...") and keep it simple.`;

            const explanation = await callGeminiApi(prompt, false);
            setFigureExplanation(explanation);

        } catch (error: any) {
            console.error("Figure Explanation Error:", error);
            setFigureExplanation(`Error: ${error.message}`);
        } finally {
            setIsExplainingFigure(false);
        }
    }

    // New Gemini Feature: Explain Table
    const handleExplainTable = async () => {
        if (!selectedTable || !pageTextContents[selectedTable.pageNum]) return;

        setIsExplainingTable(true);
        setTableExplanation("");

        try {
            const table = selectedTable;
            const pageText = pageTextContents[table.pageNum]?.map((item: any) => item.str).join(" ") || "";

            const prompt = `Here is the title/caption for a table from a research paper: 
      Title: "${table.title}"
      Caption: "${table.caption || 'N/A'}"
      
      Here is the text from the page (page ${table.pageNum}) where the table appears (truncated):
      "${pageText.substring(0, 3000)}..."
      
      Please provide a concise, one-paragraph explanation of what this table shows and its key findings or importance in the context of the paper, based on its title, caption, and the page text. 
      Start your explanation directly (e.g., "This table shows...") and keep it simple.`;

            const explanation = await callGeminiApi(prompt, false);
            setTableExplanation(explanation);

        } catch (error: any) {
            console.error("Table Explanation Error:", error);
            setTableExplanation(`Error: ${error.message}`);
        } finally {
            setIsExplainingTable(false);
        }
    }

    // New Function: Download Table as CSV (Method C)
    const generateCSV = (table: StructuredTable) => {
        const escapeCSV = (cell: any) => {
            if (cell == null) return '""'
            const str = String(cell)
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`
            }
            return `"${str}"`
        }

        let csv = ''

        // Headers
        if (table.headers) {
            csv += table.headers.map(escapeCSV).join(',') + '\r\n'
        }

        // Rows
        table.rows.forEach((row: string[]) => {
            csv += row.map(escapeCSV).join(',') + '\r\n'
        })

        return csv
    }

    const downloadTableAsCSV = (table: StructuredTable) => {
        if (!table) return;
        const csv = generateCSV(table)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8,' })
        const url = URL.createObjectURL(blob)

        const link = document.createElement('a')
        link.href = url
        const fileName = (table.title || table.id).replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        link.download = `${fileName}.csv`
        document.body.appendChild(link)
        link.click()

        document.body.removeChild(link);
        URL.revokeObjectURL(url)
        setStatusMessage("Table downloaded as CSV.")
    }


    const formatPicottSummary = (data: any) => {
        const fields: { [key: string]: any } = {
            population: { name: "Population/Problem", icon: <Users className="w-5 h-5" />, color: "blue" },
            intervention: { name: "Intervention", icon: <Beaker className="w-5 h-5" />, color: "green" },
            comparison: { name: "Comparison", icon: <BarChart3 className="w-5 h-5" />, color: "purple" },
            outcome: { name: "Outcome", icon: <Target className="w-5 h-5" />, color: "red" },
            time: { name: "Time", icon: <Calendar className="w-5 h-5" />, color: "orange" },
            type_of_study: { name: "Type of Study", icon: <BookOpen className="w-5 h-5" />, color: "indigo" },
            inclusion_criteria: { name: "Inclusion Criteria", icon: <Shield className="w-5 h-5" />, color: "emerald" },
            exclusion_criteria: { name: "Exclusion Criteria", icon: <Ban className="w-5 h-5" />, color: "rose" },
        }

        return (
            <div className="space-y-4">
                {Object.entries(fields).map(([key, field]) => {
                    if (data[key] && data[key].text && data[key].text !== "Not found") {
                        return (
                            <div key={key} className="group hover:scale-[1.02] transition-all duration-300">
                                <div className="bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-xl p-5 shadow-sm hover:shadow-lg transition-all">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className={`p-2 rounded-lg bg-${field.color}-100/80 text-${field.color}-600`}>
                                            {field.icon}
                                        </div>
                                        <h4 className="font-bold text-gray-800 text-lg">{field.name}</h4>
                                    </div>
                                    <p className="text-gray-700 mb-4 leading-relaxed">{data[key].text}</p>
                                    {data[key].quote && data[key].quote !== "Not found" && (
                                        <div
                                            className="mt-3 p-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 rounded-lg border-l-4 border-blue-400 cursor-pointer hover:bg-blue-50 transition-colors"
                                            onClick={() => {
                                                setHighlightedText(data[key].quote)
                                                setHighlightedPage(data[key].page_number)
                                                setActiveTab("viewer")
                                                if (pdfDoc && data[key].page_number !== currentPage) renderPage(pdfDoc, data[key].page_number)
                                                setTimeout(scrollToHighlight, 100)
                                            }}
                                        >
                                            <p className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-2">
                                                <Quote className="w-3 h-3" /> Source (Page {data[key].page_number}) - Click to view
                                            </p>
                                            <p className="text-sm text-gray-600 italic">&quot;{data[key].quote}&quot;</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    }
                    return null
                })}
            </div>
        )
    }

    const handleSummarize = async () => {
        if (!pdfFile) return

        setIsSummarizing(true)
        setShowSummary(false)
        setPicottCitations([])
        setAiThinking("📚 Converting PDF for analysis...")
        setStatusMessage("Generating PICOTT summary with Claude...")

        try {
            // Convert PDF to base64
            const arrayBuffer = await pdfFile.arrayBuffer()
            const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            )

            setAiThinking("🔬 Extracting research components with citations...")

            const response = await fetch('/api/picott-with-citations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pdfBase64: base64,
                    documentTitle: currentPdfName
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.details || 'Failed to generate PICOTT summary')
            }

            const data = await response.json()

            // Store citations for click handling
            setPicottCitations(data.citations || [])

            // Format the summary text with citation markers
            setRawSummaryText(data.summary)

            // Create formatted HTML summary with clickable citations
            const formattedSummary = data.summary
                .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-purple-300">$1</strong>')
                .replace(/\n/g, '<br/>')
                .replace(/\[(\d+)\]/g, '<button class="picott-citation px-1 py-0.5 mx-0.5 rounded text-xs bg-blue-500/20 text-blue-300 hover:bg-blue-500/30" data-citation="$1">[$1]</button>')

            setSummary(`<div class="prose prose-invert max-w-none">${formattedSummary}</div>`)
            setShowSummary(true)
            setAiThinking("")
            setStatusMessage(`PICOTT summary generated with ${data.citations?.length || 0} citations!`)
        } catch (error: any) {
            console.error("Summary Error:", error)
            setSummary(`<div class="text-center p-6 text-gray-500">⚠️ Could not generate summary: ${error.message}</div>`)
            setShowSummary(true)
            setAiThinking("")
            setStatusMessage("Could not generate structured summary.")
        } finally {
            setIsSummarizing(false)
        }
    }

    // Handler for PICOTT citation clicks
    const handlePicottCitationClick = async (citationIndex: number) => {
        const citation = picottCitations[citationIndex - 1] // Citations are 1-indexed in display
        if (!citation) {
            console.warn(`PICOTT citation ${citationIndex} not found`)
            return
        }

        setActiveTab("viewer")

        const pageNum = citation.start_page_number || 1
        if (pageNum !== currentPage && pdfDoc) {
            await renderPage(pdfDoc, pageNum)
        }

        setHighlightedText(citation.cited_text)
        setHighlightedPage(pageNum)

        requestAnimationFrame(() => {
            highlightTextInLayer(citation.cited_text)
            setStatusMessage(`Jumped to PICOTT citation [${citationIndex}] on page ${pageNum}`)
        })
    }

    const goToPreviousPage = useCallback(() => {
        console.log(`goToPreviousPage: currentPage=${currentPage}, pdfDoc=${!!pdfDoc}`)
        if (currentPage > 1 && pdfDoc) {
            const newPage = currentPage - 1
            console.log(`Navigating to page ${newPage}`)
            renderPage(pdfDoc, newPage)
        }
    }, [currentPage, pdfDoc, renderPage])

    const goToNextPage = useCallback(() => {
        console.log(`goToNextPage: currentPage=${currentPage}, totalPages=${totalPages}, pdfDoc=${!!pdfDoc}`)
        if (currentPage < totalPages && pdfDoc) {
            const newPage = currentPage + 1
            console.log(`Navigating to page ${newPage}`)
            renderPage(pdfDoc, newPage)
        }
    }, [currentPage, totalPages, pdfDoc, renderPage])

    const handleHistoryClick = async (entry: any) => {
        if (currentPdfName !== entry.pdfName) {
            alert(`Please upload the correct PDF: ${entry.pdfName}`)
            return
        }

        // Restore citation map from history entry
        if (entry.citationMap) {
            setCitationMap(entry.citationMap)
        }

        setAnswer(entry.answer)
        setSourceQuote(entry.sourceQuote)
        setCitations(entry.citations || [])
        setHighlightedText(entry.sourceQuote)
        setHighlightedPage(entry.pageNumber)
        setShowAnswer(true)
        setStatusMessage(`Viewing Q&A from page ${entry.pageNumber}`)
        setActiveTab("viewer")
        if (pdfDoc && entry.pageNumber !== currentPage) await renderPage(pdfDoc, entry.pageNumber)
        setTimeout(scrollToHighlight, 100)
    }

    const getPlainTextWithHighlight = () => {
        const pageText = pageTextContents[currentPage]?.map((item: any) => item.str).join(" ") || ""

        if (!highlightedText || highlightedPage !== currentPage) {
            // No highlight, but check for active citation
            if (activeCitation !== null && citationMap[activeCitation]?.pageNum === currentPage) {
                const citationSentence = citationMap[activeCitation].sentence
                const escapedCitation = citationSentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                const citationRegex = new RegExp(`(${escapedCitation})`, "gi")
                return pageText
                    .split(citationRegex)
                    .map((part: string, i: number) =>
                        part.toLowerCase() === citationSentence.toLowerCase()
                            ? `<span key="${i}" class="citation-highlight bg-yellow-400/40 text-gray-900 px-2 py-1 rounded-md font-semibold border-2 border-yellow-500/60 animate-pulse">${part}</span>`
                            : part,
                    )
                    .join("")
            }
            return pageText
        }

        const escapedText = highlightedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const regex = new RegExp(`(${escapedText})`, "gi")
        return pageText
            .split(regex)
            .map((part: string, i: number) =>
                part.toLowerCase() === highlightedText.toLowerCase()
                    ? `<span key="${i}" class="highlight-target bg-yellow-300/50 text-gray-900 px-1 py-0.5 rounded font-semibold animate-pulse">${part}</span>`
                    : part,
            )
            .join("")
    }

    const clearHighlight = () => {
        setHighlightedText("")
        setHighlightedPage(null)
    }

    const sampleQuestions = [
        "What is the main objective of this study?",
        "What were the key findings?",
        "What methodology was used?",
        "What are the limitations of this research?",
        "What are the future recommendations?",
    ]

    const annotationTools = [
        { id: "select", icon: <MousePointer className="w-4 h-4" />, name: "Select" },
        { id: "highlight", icon: <Highlighter className="w-4 h-4" />, name: "Highlight" },
        { id: "pen", icon: <Pencil className="w-4 h-4" />, name: "Pen" },
        { id: "eraser", icon: <Eraser className="w-4 h-4" />, name: "Eraser" },
    ]
    const annotationColors = ["#FFEB3B", "#FF5252", "#448AFF", "#69F0AE", "#FF6E40", "#E040FB"]

    // Highlight text in the text layer by searching for matching content
    const highlightTextInLayer = useCallback((searchText: string) => {
        const textLayerDiv = textLayerRef.current
        if (!textLayerDiv || !searchText) return

        // Clear previous highlights
        textLayerDiv.querySelectorAll('.highlighted-active').forEach(el => {
            el.classList.remove('highlighted-active')
        })

        // Get all spans and build full text with position mapping
        const spans = Array.from(textLayerDiv.querySelectorAll('span'))
        if (spans.length === 0) {
            console.warn('No spans found in text layer for highlighting')
            return
        }

        // Normalize whitespace function
        const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim()

        // Build the full text and track span positions
        let fullText = ''
        const spanPositions: { span: Element; start: number; end: number }[] = []

        spans.forEach(span => {
            const text = span.textContent || ''
            const start = fullText.length
            fullText += text + ' '
            spanPositions.push({ span, start, end: start + text.length })
        })

        // Normalize both texts for better matching
        const normalizedFullText = normalizeText(fullText)
        const normalizedSearchText = normalizeText(searchText)

        // Use highlight-words-core to find matching chunks
        let chunks = findAll({
            searchWords: [normalizedSearchText],
            textToHighlight: normalizedFullText,
            caseSensitive: false,
            autoEscape: true
        })

        // If no match found, try with first 100 chars of search text
        if (!chunks.some((c: { highlight: boolean }) => c.highlight) && normalizedSearchText.length > 100) {
            const shorterSearch = normalizedSearchText.substring(0, 100)
            chunks = findAll({
                searchWords: [shorterSearch],
                textToHighlight: normalizedFullText,
                caseSensitive: false,
                autoEscape: true
            })
            if (chunks.some((c: { highlight: boolean }) => c.highlight)) {
                console.log('Found match using shortened search text')
            }
        }

        if (!chunks.some((c: { highlight: boolean }) => c.highlight)) {
            console.warn('No matching text found for highlighting:', normalizedSearchText.substring(0, 50) + '...')
            return
        }

        // Map normalized positions back to original positions
        // Build position mapping between original and normalized text
        let origIdx = 0
        let normIdx = 0
        const normToOrigMap: number[] = []

        while (origIdx < fullText.length && normIdx < normalizedFullText.length) {
            if (/\s/.test(fullText[origIdx])) {
                if (/\s/.test(normalizedFullText[normIdx])) {
                    normToOrigMap[normIdx] = origIdx
                    normIdx++
                    // Skip all whitespace in original
                    while (origIdx < fullText.length && /\s/.test(fullText[origIdx])) {
                        origIdx++
                    }
                } else {
                    origIdx++
                }
            } else {
                normToOrigMap[normIdx] = origIdx
                normIdx++
                origIdx++
            }
        }

        // Find spans that overlap with highlighted chunks
        let foundFirst = false
        chunks.forEach(chunk => {
            if (!chunk.highlight) return

            // Map normalized positions back to original
            const origStart = normToOrigMap[chunk.start] || chunk.start
            const origEnd = normToOrigMap[chunk.end - 1] ? normToOrigMap[chunk.end - 1] + 1 : chunk.end

            spanPositions.forEach(({ span, start, end }) => {
                // Check if span overlaps with the highlighted chunk
                if (start < origEnd && end > origStart) {
                    span.classList.add('highlighted-active')
                    if (!foundFirst) {
                        span.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        foundFirst = true
                    }
                }
            })
        })

        if (foundFirst) {
            console.log('Successfully highlighted text in PDF')
        }
    }, [])

    const handleCitationClick = async (citationIndex: number) => {
        const citation = citationMap[citationIndex]
        if (!citation) {
            console.warn(`Citation ${citationIndex} not found in citation map`)
            return
        }

        // Clear any existing timeout
        if (citationTimeout) {
            clearTimeout(citationTimeout)
        }

        // Set active citation for highlighting
        setActiveCitation(citationIndex)

        // Switch to viewer tab to show the PDF with highlights
        setActiveTab("viewer")

        // Navigate to the page and render (which builds text layer)
        if (citation.pageNum !== currentPage && pdfDoc) {
            await renderPage(pdfDoc, citation.pageNum)
        }

        // Set highlight state
        setHighlightedText(citation.sentence)
        setHighlightedPage(citation.pageNum)

        // Highlight text in the text layer after DOM updates
        requestAnimationFrame(() => {
            highlightTextInLayer(citation.sentence)
            setStatusMessage(`Jumped to citation [${citationIndex}] on page ${citation.pageNum}`)
        })

        // Clear active citation after 3 seconds
        const timeout = setTimeout(() => {
            setActiveCitation(null)
            // Clear highlights
            textLayerRef.current?.querySelectorAll('.highlighted-active').forEach(el => {
                el.classList.remove('highlighted-active')
            })
        }, 3000)
        setCitationTimeout(timeout)
    }

    // Handler for native Anthropic citations
    const handleNativeCitationClick = async (citationIndex: number) => {
        const citation = nativeCitations[citationIndex]
        if (!citation) {
            console.warn(`Native citation ${citationIndex} not found`)
            return
        }

        // Clear any existing timeout
        if (citationTimeout) {
            clearTimeout(citationTimeout)
        }

        // Set active citation for highlighting
        setActiveCitation(citationIndex)

        // Switch to viewer tab to show the PDF with highlights
        setActiveTab("viewer")

        // Navigate to the page and render
        const pageNum = citation.start_page_number || 1
        if (pageNum !== currentPage && pdfDoc) {
            await renderPage(pdfDoc, pageNum)
        }

        // Set highlight state
        setHighlightedText(citation.cited_text)
        setHighlightedPage(pageNum)

        // Highlight text in the text layer after DOM updates
        requestAnimationFrame(() => {
            highlightTextInLayer(citation.cited_text)
            setStatusMessage(`Jumped to citation [${citationIndex + 1}] on page ${pageNum}`)
        })

        // Clear active citation after 3 seconds
        const timeout = setTimeout(() => {
            setActiveCitation(null)
            textLayerRef.current?.querySelectorAll('.highlighted-active').forEach(el => {
                el.classList.remove('highlighted-active')
            })
        }, 3000)
        setCitationTimeout(timeout)
    }

    // Clean up the citation highlight timeout on unmount
    useEffect(() => {
        return () => {
            if (citationTimeout) {
                clearTimeout(citationTimeout)
            }
        }
    }, [citationTimeout])

    return (
        <>
            <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .prose { color: inherit; } 
        .prose h3 { color: inherit; }
        .prose strong { color: inherit; }
        .prose blockquote { border-left-color: inherit; color: inherit; }
        .prose a { color: inherit; }
        .prose p { margin-top: 0.5em; margin-bottom: 0.5em; }
        .extracted-table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; background-color: #fff; color: #333; }
        .extracted-table th, .extracted-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .extracted-table th { background-color: #f2f2f2; font-weight: bold; }
        .extracted-table tr:nth-child(even) { background-color: #f9f9f9; }
      `}</style>
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-gray-200">
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                    <div
                        className="absolute top-0 -right-4 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
                        style={{ animationDelay: "2s" }}
                    ></div>
                    <div
                        className="absolute -bottom-8 left-20 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
                        style={{ animationDelay: "4s" }}
                    ></div>
                </div>

                <div className="relative z-10 p-4">
                    <div className="max-w-7xl mx-auto mb-8">
                        <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-8 text-center border border-white/10 hover:bg-white/10 transition-all duration-500">
                            <div className="flex items-center justify-center gap-4 mb-4">
                                <div className="p-3 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl shadow-lg">
                                    <Brain className="w-10 h-10 text-white" />
                                </div>
                                <h1 className="text-5xl md:text-6xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">
                                    PDF Intelligence Hub
                                </h1>
                            </div>
                            <p className="text-lg text-gray-300 font-medium flex items-center justify-center gap-2">
                                <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
                                Powered by AI • Smart figure extraction & table transcription
                                <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
                            </p>
                        </div>
                    </div>

                    <div className="max-w-7xl mx-auto">
                        {!pdfDoc ? (
                            <div
                                className={`bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-12 text-center border-2 border-dashed ${dragActive ? "border-purple-400 bg-white/10" : "border-white/20"} max-w-3xl mx-auto transition-all duration-300`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                            >
                                <div className="mb-8">
                                    <div className="relative">
                                        <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/10 shadow-2xl">
                                            <FileText className="w-16 h-16 text-purple-400" />
                                        </div>
                                        <div className="absolute inset-0 w-32 h-32 mx-auto bg-gradient-to-br from-purple-600 to-pink-600 rounded-full animate-ping opacity-20"></div>
                                    </div>
                                    <h3 className="text-3xl font-bold text-white mb-3">Upload Your PDF</h3>
                                    <p className="text-gray-400 text-lg">
                                        {!pdfJsLoaded ? "Initializing PDF reader..." : "Drag and drop or click to select your document"}
                                    </p>
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isProcessing || !pdfJsLoaded}
                                    className="group relative inline-flex items-center px-10 py-5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-2xl text-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                                    <div className="relative flex items-center gap-3">
                                        {isProcessing || !pdfJsLoaded ? (
                                            <Loader2 className="w-6 h-6 animate-spin" />
                                        ) : (
                                            <Upload className="w-6 h-6 group-hover:animate-bounce" />
                                        )}
                                        {isProcessing ? "Processing..." : !pdfJsLoaded ? "Loading PDF.js..." : "Choose PDF File"}
                                    </div>
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="application/pdf"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                {currentPdfName && (
                                    <div className="mt-6 space-y-2">
                                        <p
                                            className="text-purple-400 font-medium text-lg flex items-center gap-2"
                                            style={{ animation: "fadeIn 0.5s ease-out" }}
                                        >
                                            📄 {currentPdfName}
                                        </p>
                                        {pdfBlobUrl && (
                                            <p className="text-green-400 text-sm flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4" /> Stored in cloud
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                                <div className="xl:col-span-2 space-y-6">
                                    <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 border border-white/10">
                                        <div className="flex items-center justify-between mb-6">
                                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                                <div className="p-2 bg-purple-600/20 rounded-xl backdrop-blur-sm">
                                                    <Eye className="w-6 h-6 text-purple-400" />
                                                </div>{" "}
                                                Document Viewer
                                            </h2>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setIsFullscreen(!isFullscreen)}
                                                    className="p-2 hover:bg-white/10 rounded-lg transition-all"
                                                >
                                                    {isFullscreen ? (
                                                        <Minimize2 className="w-5 h-5 text-gray-400" />
                                                    ) : (
                                                        <Maximize2 className="w-5 h-5 text-gray-400" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 mb-6 bg-white/5 p-1 rounded-2xl">
                                            {["viewer", "figures", "tables"].map((tabName) => (
                                                <button
                                                    key={tabName}
                                                    onClick={() => {
                                                        setActiveTab(tabName)
                                                        if (tabName === "viewer") clearHighlight()
                                                    }}
                                                    className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === tabName ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg scale-105" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
                                                >
                                                    {tabName === "viewer" && <Eye className="w-4 h-4" />}
                                                    {tabName === "figures" && <ImageIconLucide className="w-4 h-4" />}
                                                    {tabName === "tables" && <TableIconLucide className="w-4 h-4" />}
                                                    {tabName.charAt(0).toUpperCase() + tabName.slice(1)}
                                                    {tabName === "figures" && extractedFigures.length > 0 && (
                                                        <span className="ml-2 px-2 py-0.5 bg-purple-400/20 text-purple-300 rounded-full text-xs">
                                                            {extractedFigures.length}
                                                        </span>
                                                    )}
                                                    {tabName === "tables" && extractedTables.length > 0 && (
                                                        <span className="ml-2 px-2 py-0.5 bg-indigo-400/20 text-indigo-300 rounded-full text-xs">
                                                            {extractedTables.length}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>

                                        {activeTab === "viewer" ? (
                                            <div>
                                                <div className="flex items-center justify-between bg-white/5 backdrop-blur-sm p-4 rounded-2xl mb-6 border border-white/10">
                                                    <button
                                                        onClick={goToPreviousPage}
                                                        disabled={currentPage <= 1}
                                                        className="group flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm rounded-xl hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-white"
                                                    >
                                                        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Previous
                                                    </button>
                                                    <span className="font-semibold text-white bg-white/10 backdrop-blur-sm px-6 py-2.5 rounded-xl shadow-sm border border-white/10">
                                                        Page {currentPage} of {totalPages}
                                                    </span>
                                                    <button
                                                        onClick={goToNextPage}
                                                        disabled={currentPage >= totalPages}
                                                        className="group flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm rounded-xl hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-white"
                                                    >
                                                        Next <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                                    </button>
                                                </div>
                                                <div
                                                    ref={containerRef}
                                                    className={`relative border-2 border-white/10 rounded-2xl overflow-auto bg-black/20 backdrop-blur-sm shadow-inner ${isFullscreen ? "h-[800px]" : "h-[600px]"} transition-all duration-500`}
                                                >
                                                    <div className="pdfPageContainer">
                                                        <canvas ref={canvasRef} className="block rounded-xl" />
                                                        <div ref={textLayerRef} className="textLayer" />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : activeTab === "figures" ? (
                                            // Enhanced figures tab with diagnostics
                                            <div>
                                                <div className="mb-6 p-4 bg-purple-600/10 rounded-2xl border border-purple-500/30">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-purple-300 font-medium flex items-center gap-2">
                                                            <Camera className="w-5 h-5" /> Found {extractedFigures.length} figures in the document
                                                        </p>
                                                        <button
                                                            onClick={() => setShowDiagnostics(!showDiagnostics)}
                                                            className="text-xs px-3 py-1 bg-purple-600/20 text-purple-300 rounded-full hover:bg-purple-600/30 transition-colors border border-purple-500/30"
                                                        >
                                                            {showDiagnostics ? "Hide" : "Show"} Diagnostics
                                                        </button>
                                                    </div>

                                                    {showDiagnostics && (
                                                        <div className="mt-4 space-y-3">
                                                            <div className="text-xs text-purple-200">
                                                                <p className="font-semibold mb-2">PDF.js Extraction Report:</p>
                                                                {Object.entries(extractionDiagnostics).map(([pageKey, diag]: [string, any]) => (
                                                                    <div key={pageKey} className="bg-black/20 rounded-lg p-3 mb-2">
                                                                        <p className="font-medium text-purple-300">Page {diag.pageNum}:</p>
                                                                        <div className="grid grid-cols-2 gap-2 mt-1 text-gray-300">
                                                                            <span>Total operators: {diag.totalOperators}</span>
                                                                            <span>Image operators: {diag.imageOperators}</span>
                                                                            <span>Extracted: {diag.extractedImages}</span>
                                                                            <span>Filtered: {diag.filteredImages}</span>
                                                                            <span>Processing time: {diag.processingTime}ms</span>
                                                                        </div>
                                                                        {diag.errors.length > 0 && (
                                                                            <div className="mt-2">
                                                                                <p className="text-red-400 font-medium">Errors:</p>
                                                                                <ul className="list-disc list-inside pl-2">
                                                                                    {diag.errors.map((error: string, index: number) => (
                                                                                        <li key={index} className="text-red-300">
                                                                                            {error}
                                                                                        </li>
                                                                                    ))}
                                                                                </ul>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                                    {extractedFigures.map((figure) => (
                                                        <div
                                                            key={figure.id}
                                                            className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 group"
                                                        >
                                                            <div className="relative overflow-hidden cursor-pointer" onClick={() => openFigureViewer(figure)}>
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={figure.dataUrl || "/placeholder.svg"}
                                                                    alt={figure.caption || "Figure"}
                                                                    className="block w-full h-48 object-contain group-hover:scale-110 transition-transform duration-300"
                                                                />
                                                                {figure.savedUrl && (
                                                                    <a
                                                                        href={figure.savedUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="absolute top-2 right-2 bg-green-500/80 text-white text-xs font-medium px-2 py-1 rounded-full hover:bg-green-500 shadow-md transition-colors"
                                                                    >
                                                                        Saved <Download className="w-3 h-3 inline-block ml-1" />
                                                                    </a>
                                                                )}
                                                            </div>
                                                            <div className="p-4">
                                                                <h4 className="text-lg font-semibold text-gray-300 mb-2 cursor-pointer" onClick={() => openFigureViewer(figure)}>
                                                                    {figure.caption || figure.id}
                                                                </h4>
                                                                <p className="text-sm text-gray-400">Page: {figure.pageNum}</p>
                                                                <button
                                                                    onClick={() => {
                                                                        setQuestion(`Regarding ${figure.caption || figure.id}, `);
                                                                        (document.querySelector('input[placeholder="Ask anything about the document..."]') as HTMLElement)?.focus();
                                                                    }}
                                                                    className="mt-2 text-xs px-3 py-1 bg-purple-600/20 text-purple-300 rounded-full hover:bg-purple-600/30 transition-colors border border-purple-500/30"
                                                                >
                                                                    ✨ Ask about this figure
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : activeTab === "tables" ? (
                                            <div>
                                                {isExtractingTables ? (
                                                    <div className="text-center p-6 text-gray-500">
                                                        <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
                                                        Extracting tables...
                                                    </div>
                                                ) : extractedTables.length === 0 ? (
                                                    <div className="text-center p-6 text-gray-500">No tables found in this document.</div>
                                                ) : (
                                                    <div className="space-y-6">
                                                        {extractedTables.map((table) => (
                                                            <div
                                                                key={table.id}
                                                                className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 group cursor-pointer"
                                                                onClick={() => openTableViewer(table)}
                                                            >
                                                                {table.imageUrl && (
                                                                    <div className="relative overflow-hidden">
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img
                                                                            src={table.imageUrl}
                                                                            alt={table.title || table.id}
                                                                            className="block w-full h-48 object-contain bg-white group-hover:scale-105 transition-transform duration-300"
                                                                        />
                                                                    </div>
                                                                )}
                                                                <div className="p-4">
                                                                    <h4 className="text-lg font-semibold text-gray-300 mb-2">
                                                                        {table.title || table.id}
                                                                    </h4>
                                                                    <p className="text-sm text-gray-400 mb-3">Page: {table.pageNum}</p>
                                                                    {!table.imageUrl && (
                                                                        <div
                                                                            className="overflow-x-auto bg-white rounded-lg p-2 max-h-60 overflow-y-auto"
                                                                            dangerouslySetInnerHTML={{ __html: table.htmlTable || "" }}
                                                                        />
                                                                    )}
                                                                    {table.caption && (
                                                                        <p className="text-sm text-gray-400 mt-3 italic">Caption: {table.caption}</p>
                                                                    )}
                                                                    <div className="text-right mt-2">
                                                                        <span
                                                                            className="text-xs px-3 py-1 bg-purple-600/20 text-purple-300 rounded-full group-hover:bg-purple-600/30 transition-colors border border-purple-500/30"
                                                                        >
                                                                            Click to view details & download CSV
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 border border-white/10">
                                        <h2 className="text-2xl font-bold text-white flex items-center gap-3 mb-6">
                                            <div className="p-2 bg-purple-600/20 rounded-xl backdrop-blur-sm">
                                                <MessageCircle className="w-6 h-6 text-purple-400" />
                                            </div>
                                            Ask a Question
                                        </h2>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="text"
                                                    placeholder="Ask anything about the document..."
                                                    value={question}
                                                    onChange={(e) => setQuestion(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                                                    className="flex-1 px-6 py-3 rounded-2xl bg-black/20 backdrop-blur-sm border border-white/10 text-white font-medium focus:border-purple-400 focus:outline-none transition-colors"
                                                />
                                                <button
                                                    onClick={() => handleAskQuestion()}
                                                    disabled={isAsking}
                                                    className="group relative inline-flex items-center px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-2xl text-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                                                >
                                                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                                                    <div className="relative flex items-center gap-3">
                                                        {isAsking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                                                        Ask AI
                                                    </div>
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {sampleQuestions.map((q, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            setQuestion(q);
                                                            handleAskQuestion(q);
                                                        }}
                                                        className="px-4 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 text-gray-300 font-medium text-sm hover:bg-white/10 transition-colors"
                                                    >
                                                        {q}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 border border-white/10">
                                        <h2 className="text-2xl font-bold text-white flex items-center gap-3 mb-6">
                                            <div className="p-2 bg-purple-600/20 rounded-xl backdrop-blur-sm">
                                                <Sparkles className="w-6 h-6 text-purple-400" />
                                            </div>
                                            Summarize Document
                                        </h2>
                                        <button
                                            onClick={handleSummarize}
                                            disabled={isSummarizing}
                                            className="group relative inline-flex items-center px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-2xl text-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 w-full"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                                            <div className="relative flex items-center gap-3 justify-center">
                                                {isSummarizing ? (
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                ) : (
                                                    <FileSearch className="w-5 h-5" />
                                                )}
                                                ✨ Generate PICOTT Summary
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {aiThinking && (
                                        <div className="bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 p-4 text-gray-400 text-sm italic flex items-center gap-2 animate-pulse">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {aiThinking}
                                        </div>
                                    )}

                                    {showAnswer && (
                                        <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 border border-white/10">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-xl font-bold text-white">Answer</h3>
                                                <button
                                                    onClick={() => handleTextToSpeech(answer, 'main-answer')}
                                                    disabled={isBufferingAudio && currentPlayingId !== 'main-answer'}
                                                    className="group relative inline-flex items-center px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-xl hover:bg-blue-500/30 transition-all text-sm font-medium"
                                                >
                                                    {isBufferingAudio && currentPlayingId === 'main-answer' ? (
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    ) : (audioPlayer && currentPlayingId === 'main-answer') ? (
                                                        <StopCircle className="w-4 h-4 mr-2" />
                                                    ) : (
                                                        <Volume2 className="w-4 h-4 mr-2" />
                                                    )}
                                                    {audioPlayer && currentPlayingId === 'main-answer' ? 'Stop' : '✨ Listen'}
                                                </button>
                                            </div>
                                            <div className="prose prose-invert max-w-none mb-4 [&>h2]:text-lg [&>h2]:font-bold [&>h2]:mt-4 [&>h2]:mb-2 [&>h3]:text-base [&>h3]:font-semibold [&>h3]:mt-3 [&>h3]:mb-1 [&>p]:mb-2 [&>ul]:ml-4 [&>ul]:mb-2 [&>ol]:ml-4 [&>ol]:mb-2 [&>li]:mb-1">
                                                <div
                                                    dangerouslySetInnerHTML={{
                                                        __html: (() => {
                                                            // First convert markdown to HTML
                                                            const htmlContent = marked.parse(answer, { async: false }) as string
                                                            // Then replace [N] markers with clickable buttons
                                                            return htmlContent.replace(
                                                                /\[(\d+)\]/g,
                                                                (_match, num) => {
                                                                    const citationIdx = parseInt(num) - 1
                                                                    const citation = nativeCitations[citationIdx]
                                                                    const pageNum = citation?.start_page_number || '?'
                                                                    return `<button class="qa-citation inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 hover:text-blue-200 transition-all cursor-pointer" data-citation="${num}">[${num}] p.${pageNum}</button>`
                                                                }
                                                            )
                                                        })()
                                                    }}
                                                    onClick={(e) => {
                                                        const target = e.target as HTMLElement
                                                        if (target.classList.contains('qa-citation')) {
                                                            const citationNum = target.getAttribute('data-citation')
                                                            if (citationNum) {
                                                                handleNativeCitationClick(parseInt(citationNum) - 1)
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>
                                            {sourceQuote && (
                                                <div
                                                    className="mt-3 p-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 rounded-lg border-l-4 border-blue-400 cursor-pointer hover:bg-blue-50 transition-colors"
                                                    onClick={() => {
                                                        setHighlightedText(sourceQuote)
                                                        setHighlightedPage(highlightedPage)
                                                        setActiveTab("viewer")
                                                        if (pdfDoc && highlightedPage !== null && highlightedPage !== currentPage) renderPage(pdfDoc, highlightedPage)
                                                        requestAnimationFrame(() => highlightTextInLayer(sourceQuote))
                                                    }}
                                                >
                                                    <p className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-2">
                                                        <Quote className="w-3 h-3" /> Source (Page {highlightedPage}) - Click to view
                                                    </p>
                                                    <p className="text-sm text-gray-600 italic">&quot;{sourceQuote}&quot;</p>
                                                </div>
                                            )}
                                            {nativeCitations.length > 0 && (
                                                <div className="mt-4 p-4 bg-gray-800/30 rounded-lg border border-gray-600/30">
                                                    <p className="text-gray-300 text-sm mb-2 font-medium">Supporting Citations:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {nativeCitations.map((citation, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    handleNativeCitationClick(idx)
                                                                }}
                                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${activeCitation === idx
                                                                    ? "bg-yellow-500/30 text-yellow-200 ring-2 ring-yellow-400/50 animate-pulse"
                                                                    : "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 hover:text-blue-200"
                                                                    }`}
                                                                title={citation.cited_text.substring(0, 100) + "..."}
                                                            >
                                                                [{idx + 1}] p.{citation.start_page_number || '?'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-2 italic">
                                                        Click any citation to navigate and highlight in the PDF
                                                    </p>
                                                </div>
                                            )}
                                            {citations.length > 0 && nativeCitations.length === 0 && (
                                                <div className="mt-4 p-4 bg-gray-800/30 rounded-lg border border-gray-600/30">
                                                    <p className="text-gray-300 text-sm mb-2 font-medium">Supporting Citations:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {citations.map((citationIndex) => (
                                                            <button
                                                                key={citationIndex}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    handleCitationClick(citationIndex)
                                                                }}
                                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${activeCitation === citationIndex
                                                                    ? "bg-yellow-500/30 text-yellow-200 ring-2 ring-yellow-400/50 animate-pulse"
                                                                    : "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 hover:text-blue-200"
                                                                    }`}
                                                                title={citationMap[citationIndex]?.sentence.substring(0, 100) + "..."}
                                                            >
                                                                [{citationIndex + 1}]
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-2 italic">
                                                        Click any citation number to navigate to that section in the text
                                                    </p>
                                                </div>
                                            )}
                                            {followUpQuestions.length > 0 && (
                                                <div className="mt-4 p-4 bg-gray-800/30 rounded-lg border border-gray-600/30">
                                                    <p className="text-gray-300 text-sm mb-2 font-medium">✨ Suggested Follow-ups:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {followUpQuestions.map((q, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => {
                                                                    setQuestion(q); // Set question in the input box
                                                                    handleAskQuestion(q); // Immediately ask the new question
                                                                }}
                                                                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 hover:text-indigo-200"
                                                            >
                                                                {q}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {showSummary && (
                                        <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 border border-white/10">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-xl font-bold text-white">PICOTT Summary</h3>
                                                {rawSummaryText && (
                                                    <button
                                                        onClick={() => handleTextToSpeech(rawSummaryText, 'picott-summary')}
                                                        disabled={isBufferingAudio && currentPlayingId !== 'picott-summary'}
                                                        className="group relative inline-flex items-center px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-xl hover:bg-blue-500/30 transition-all text-sm font-medium"
                                                    >
                                                        {isBufferingAudio && currentPlayingId === 'picott-summary' ? (
                                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                        ) : (audioPlayer && currentPlayingId === 'picott-summary') ? (
                                                            <StopCircle className="w-4 h-4 mr-2" />
                                                        ) : (
                                                            <Volume2 className="w-4 h-4 mr-2" />
                                                        )}
                                                        {audioPlayer && currentPlayingId === 'picott-summary' ? 'Stop' : '✨ Listen'}
                                                    </button>
                                                )}
                                            </div>
                                            <div
                                                dangerouslySetInnerHTML={{ __html: summary }}
                                                onClick={(e) => {
                                                    const target = e.target as HTMLElement
                                                    if (target.classList.contains('picott-citation')) {
                                                        const citationNum = target.getAttribute('data-citation')
                                                        if (citationNum) {
                                                            handlePicottCitationClick(parseInt(citationNum))
                                                        }
                                                    }
                                                }}
                                            />
                                            {picottCitations.length > 0 && (
                                                <div className="mt-4 p-4 bg-gray-800/30 rounded-lg border border-gray-600/30">
                                                    <p className="text-gray-300 text-sm mb-2 font-medium">Citations ({picottCitations.length}):</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {picottCitations.map((citation, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => handlePicottCitationClick(idx + 1)}
                                                                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 hover:text-blue-200"
                                                                title={citation.cited_text.substring(0, 100) + "..."}
                                                            >
                                                                [{idx + 1}] p.{citation.start_page_number || '?'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-2 italic">
                                                        Click any citation to navigate and highlight in the PDF
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 border border-white/10">
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                                <div className="p-2 bg-purple-600/20 rounded-xl backdrop-blur-sm">
                                                    <History className="w-6 h-6 text-purple-400" />
                                                </div>
                                                History
                                            </h2>
                                            <button
                                                onClick={() => setShowHistory(!showHistory)}
                                                className="text-gray-400 hover:text-white transition-colors"
                                            >
                                                {showHistory ? "Hide" : "Show"}
                                            </button>
                                        </div>
                                        {showHistory ? (
                                            <div className="max-h-96 overflow-y-auto space-y-3">
                                                {history.map((entry) => (
                                                    <div
                                                        key={entry.id}
                                                        className="bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 p-4 cursor-pointer hover:bg-black/30 transition-colors"
                                                        onClick={() => handleHistoryClick(entry)}
                                                    >
                                                        <p className="text-gray-400 text-sm mb-2">{entry.timestamp}</p>
                                                        <p className="text-white font-medium">{entry.question}</p>
                                                        <p className="text-gray-400 text-sm italic">Page {entry.pageNumber}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-center text-gray-500">History hidden</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Figure Viewer Modal */}
            {selectedFigure && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
                    <div className="relative w-full max-w-5xl max-h-[90vh] overflow-auto bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 p-8">
                        <div className="absolute top-4 right-4 flex items-center gap-3">
                            <button
                                onClick={saveAnnotatedFigure}
                                className="px-4 py-2 bg-green-500/20 text-green-300 rounded-xl hover:bg-green-500/30 transition-all flex items-center gap-2 text-sm font-medium"
                            >
                                <Download className="w-4 h-4" /> Save Figure
                            </button>
                            <button onClick={closeFigureViewer} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <h2 className="text-3xl font-bold text-white mb-6">{selectedFigure.caption || selectedFigure.id}</h2>

                        <div className="flex items-start gap-8">
                            <div className="w-2/3 relative">
                                <div
                                    className="absolute top-0 left-0 w-full h-full"
                                    style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                                >
                                    <canvas ref={figureCanvasRef} style={{ imageRendering: "pixelated" }} />
                                    <canvas
                                        ref={annotationCanvasRef}
                                        style={{ position: "absolute", top: 0, left: 0, imageRendering: "pixelated" }}
                                        onMouseDown={handleAnnotationStart}
                                        onMouseMove={handleAnnotationMove}
                                        onMouseUp={handleAnnotationEnd}
                                        onMouseLeave={handleAnnotationEnd}
                                    />
                                </div>
                                <div className="absolute top-2 left-2 flex items-center gap-2">
                                    <button
                                        onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
                                        className="p-2 hover:bg-white/10 rounded-lg transition-all"
                                    >
                                        <ZoomOut className="w-5 h-5 text-gray-400" />
                                    </button>
                                    <span className="font-semibold text-white bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-sm border border-white/10">
                                        {zoom * 100}%
                                    </span>
                                    <button
                                        onClick={() => setZoom(Math.min(4, zoom + 0.25))}
                                        className="p-2 hover:bg-white/10 rounded-lg transition-all"
                                    >
                                        <ZoomIn className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>
                            </div>

                            <div className="w-1/3 space-y-4">
                                <div className="bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-lg font-semibold text-gray-300">✨ AI Explanation</h4>
                                        {figureExplanation && !isExplainingFigure && (
                                            <button
                                                onClick={() => handleTextToSpeech(figureExplanation, `figure-exp-${selectedFigure.id}`)}
                                                disabled={isBufferingAudio && currentPlayingId !== `figure-exp-${selectedFigure.id}`}
                                                className="group relative inline-flex items-center px-2 py-1 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all text-xs font-medium"
                                            >
                                                {isBufferingAudio && currentPlayingId === `figure-exp-${selectedFigure.id}` ? (
                                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                ) : (audioPlayer && currentPlayingId === `figure-exp-${selectedFigure.id}`) ? (
                                                    <StopCircle className="w-3 h-3 mr-1" />
                                                ) : (
                                                    <Volume2 className="w-3 h-3 mr-1" />
                                                )}
                                                {audioPlayer && currentPlayingId === `figure-exp-${selectedFigure.id}` ? 'Stop' : 'Listen'}
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleExplainFigure}
                                        disabled={isExplainingFigure}
                                        className="w-full px-4 py-2 rounded-xl bg-purple-600/50 backdrop-blur-sm border border-white/10 text-white font-medium text-sm hover:bg-purple-600/70 transition-colors disabled:opacity-50"
                                    >
                                        {isExplainingFigure ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                                            </span>
                                        ) : (
                                            "Explain this Figure"
                                        )}
                                    </button>
                                    {figureExplanation && (
                                        <div className="mt-3 text-gray-300 text-sm prose prose-invert max-w-none">
                                            <p>{figureExplanation}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
                                    <h4 className="text-lg font-semibold text-gray-300 mb-3">Annotation Tools</h4>
                                    <div className="flex items-center gap-2 mb-3">
                                        {annotationTools.map((tool) => (
                                            <button
                                                key={tool.id}
                                                onClick={() => setAnnotationTool(tool.id)}
                                                className={`p-2 rounded-lg hover:bg-white/10 transition-all ${annotationTool === tool.id ? "bg-white/20" : "text-gray-400"}`}
                                                title={tool.name}
                                            >
                                                {tool.icon}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {annotationColors.map((color) => (
                                            <button
                                                key={color}
                                                onClick={() => setAnnotationColor(color)}
                                                className={`w-6 h-6 rounded-full transition-all ${annotationColor === color ? "ring-2 ring-white" : ""}`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
                                    <h4 className="text-lg font-semibold text-gray-300 mb-3">Notes</h4>
                                    <div className="space-y-2">
                                        {(annotations[selectedFigure.id]?.notes || []).map((note: any) => (
                                            <div key={note.id} className="bg-white/5 backdrop-blur-sm rounded-lg p-3 text-gray-400 text-sm">
                                                <p className="mb-1">{note.text}</p>
                                                <p className="text-xs italic">{note.timestamp}</p>
                                            </div>
                                        ))}
                                        <button
                                            onClick={addNote}
                                            className="w-full px-4 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 text-gray-300 font-medium text-sm hover:bg-white/10 transition-colors"
                                        >
                                            Add Note
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Table Viewer Modal */}
            {selectedTable && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
                    <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 p-8">
                        <div className="absolute top-4 right-4 flex items-center gap-3">
                            <button
                                onClick={() => downloadTableAsCSV(selectedTable)}
                                className="px-4 py-2 bg-green-500/20 text-green-300 rounded-xl hover:bg-green-500/30 transition-all flex items-center gap-2 text-sm font-medium"
                            >
                                <Download className="w-4 h-4" /> Download as CSV
                            </button>
                            <button onClick={closeTableViewer} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <h2 className="text-3xl font-bold text-white mb-6 flex-shrink-0">{selectedTable.title || selectedTable.id}</h2>

                        <div className="flex-grow flex items-start gap-8 overflow-hidden">
                            {/* Table Content */}
                            <div className="w-2/3 h-full flex flex-col space-y-4">
                                <div className="flex-grow overflow-auto bg-white rounded-lg p-4">
                                    <div
                                        className="overflow-x-auto"
                                        dangerouslySetInnerHTML={{ __html: selectedTable.htmlTable || "" }}
                                    />
                                </div>
                                {selectedTable.caption && (
                                    <div className="flex-shrink-0 bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4">
                                        <p className="text-sm text-gray-300 italic">Caption: {selectedTable.caption}</p>
                                    </div>
                                )}
                            </div>

                            {/* AI & Notes */}
                            <div className="w-1/3 h-full flex flex-col space-y-4 overflow-y-auto">
                                <div className="bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-lg font-semibold text-gray-300">✨ AI Explanation</h4>
                                        {tableExplanation && !isExplainingTable && (
                                            <button
                                                onClick={() => handleTextToSpeech(tableExplanation, `table-exp-${selectedTable.id}`)}
                                                disabled={isBufferingAudio && currentPlayingId !== `table-exp-${selectedTable.id}`}
                                                className="group relative inline-flex items-center px-2 py-1 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all text-xs font-medium"
                                            >
                                                {isBufferingAudio && currentPlayingId === `table-exp-${selectedTable.id}` ? (
                                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                ) : (audioPlayer && currentPlayingId === `table-exp-${selectedTable.id}`) ? (
                                                    <StopCircle className="w-3 h-3 mr-1" />
                                                ) : (
                                                    <Volume2 className="w-3 h-3 mr-1" />
                                                )}
                                                {audioPlayer && currentPlayingId === `table-exp-${selectedTable.id}` ? 'Stop' : 'Listen'}
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleExplainTable}
                                        disabled={isExplainingTable}
                                        className="w-full px-4 py-2 rounded-xl bg-purple-600/50 backdrop-blur-sm border border-white/10 text-white font-medium text-sm hover:bg-purple-600/70 transition-colors disabled:opacity-50"
                                    >
                                        {isExplainingTable ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                                            </span>
                                        ) : (
                                            "Explain this Table"
                                        )}
                                    </button>
                                    {tableExplanation && (
                                        <div className="mt-3 text-gray-300 text-sm prose prose-invert max-w-none">
                                            <p>{tableExplanation}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
                                    <h4 className="text-lg font-semibold text-gray-300 mb-3">Quick Actions</h4>
                                    <button
                                        onClick={() => {
                                            closeTableViewer();
                                            setQuestion(`Regarding ${selectedTable.title || selectedTable.id}, `);
                                            (document.querySelector('input[placeholder="Ask anything about the document..."]') as HTMLElement)?.focus();
                                        }}
                                        className="w-full px-4 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 text-gray-300 font-medium text-sm hover:bg-white/10 transition-colors"
                                    >
                                        Ask about this table
                                    </button>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default PDFQAApp