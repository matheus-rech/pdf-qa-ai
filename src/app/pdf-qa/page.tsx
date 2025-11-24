"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import {
    Upload,
    Eye,
    Type,
    Loader2,
    CheckCircle,
    Brain,
    Sparkles,
    ImageIcon as ImageIconLucide,
    LampDeskIcon as TableIconLucide,
    Minimize2,
    Maximize2,
} from "lucide-react"

import {
    loadPdfJs,
    extractFiguresFromPage,
    findFigureCaptions,
    extractTablesFromDocument,
} from "@/lib/pdf-utils"
import { callGeminiApi, callGeminiTTSApi } from "@/lib/gemini-api"
import { StructuredTable, Figure, HistoryEntry, ExtractionDiagnostics, PDFDocumentProxy, Annotation, Drawing } from "@/types/pdf-qa"

import PDFViewer from "@/components/pdf-qa/PDFViewer"
import ChatInterface from "@/components/pdf-qa/ChatInterface"
import SummaryView, { formatPicottSummary } from "@/components/pdf-qa/SummaryView"
import FigureGallery from "@/components/pdf-qa/FigureGallery"
import TableGallery from "@/components/pdf-qa/TableGallery"

const PDFQAApp = () => {
    // State management
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(0)
    const [pageTextContents, setPageTextContents] = useState<{ str: string }[][]>([])
    const [currentPdfName, setCurrentPdfName] = useState("")
    const [activeTab, setActiveTab] = useState("viewer")
    const [question, setQuestion] = useState("")
    const [answer, setAnswer] = useState("")
    const [sourceQuote, setSourceQuote] = useState("")
    const [summary, setSummary] = useState<React.ReactNode | string>("")
    const [history, setHistory] = useState<HistoryEntry[]>([])
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
    const [highlightedText, setHighlightedText] = useState("")
    const [highlightedPage, setHighlightedPage] = useState<number | null>(null)

    const [citationMap, setCitationMap] = useState<{
        [key: number]: { pageNum: number; textIndex: number; sentence: string }
    }>({})
    const [activeCitation, setActiveCitation] = useState<number | null>(null)
    const [citationTimeout, setCitationTimeout] = useState<NodeJS.Timeout | null>(null)

    // New states for figures and tables
    const [extractedFigures, setExtractedFigures] = useState<Figure[]>([])
    const [extractedTables, setExtractedTables] = useState<StructuredTable[]>([])
    const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null)
    const [selectedTable, setSelectedTable] = useState<StructuredTable | null>(null)
    const [annotations, setAnnotations] = useState<Record<string, Annotation>>({})
    const [annotationTool, setAnnotationTool] = useState<string>("highlight")
    const [annotationColor, setAnnotationColor] = useState<string>("#FFEB3B")
    const [isDrawing, setIsDrawing] = useState(false)
    const [currentPath, setCurrentPath] = useState<{ x: number; y: number; tool?: string; color?: string }[]>([])
    const [zoom, setZoom] = useState(1)
    const [isExtractingTables, setIsExtractingTables] = useState(false)

    // New states for blob URLs
    const [pdfBlobUrl, setPdfBlobUrl] = useState("")

    // New states for figure extraction diagnostics
    const [extractionDiagnostics] = useState<Record<number, ExtractionDiagnostics>>({})
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
    const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null)
    const [isBufferingAudio, setIsBufferingAudio] = useState(false)
    const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null)

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null)
    const annotationCanvasRef = useRef<HTMLCanvasElement>(null)
    const figureCanvasRef = useRef<HTMLCanvasElement>(null)

    // Load PDF.js
    useEffect(() => {
        loadPdfJs(setStatusMessage).then((loaded) => setPdfJsLoaded(loaded))
    }, [])

    // TTS Handler
    const handleTextToSpeech = async (text: string, id: string) => {
        if (audioPlayer && currentPlayingId === id) {
            audioPlayer.pause()
            setAudioPlayer(null)
            setCurrentPlayingId(null)
            return
        }

        if (audioPlayer) {
            audioPlayer.pause()
        }

        setIsBufferingAudio(true)
        setCurrentPlayingId(id)
        setStatusMessage("✨ Generating audio...")

        try {
            const audioUrl = await callGeminiTTSApi(text)
            const newAudio = new Audio(audioUrl)

            newAudio.onplay = () => {
                setIsBufferingAudio(false)
                setStatusMessage("Playing audio...")
            }

            newAudio.onended = () => {
                setAudioPlayer(null)
                setCurrentPlayingId(null)
                setStatusMessage("Audio finished.")
                URL.revokeObjectURL(audioUrl)
            }

            newAudio.onpause = () => {
                setAudioPlayer(null)
                setCurrentPlayingId(null)
                setStatusMessage("Audio stopped.")
                if (newAudio.src) {
                    URL.revokeObjectURL(newAudio.src)
                }
            }

            newAudio.play()
            setAudioPlayer(newAudio)
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error("TTS Error:", error)
            setStatusMessage(`Error generating audio: ${errorMessage}`)
            setIsBufferingAudio(false)
            setCurrentPlayingId(null)
        }
    }

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
                handleFileUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>)
            } else {
                setStatusMessage("Invalid file type. Please upload a PDF.")
            }
        }
    }

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

        if (audioPlayer) {
            audioPlayer.pause()
            setAudioPlayer(null)
            setCurrentPlayingId(null)
        }

        setCurrentPdfName(file.name)
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

        setStatusMessage("Processing PDF locally...")

        try {
            const arrayBuffer = await file.arrayBuffer()
            const pdfData = new Uint8Array(arrayBuffer)
            const loadedPdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise

            setPdfDoc(loadedPdf)
            setTotalPages(loadedPdf.numPages)
            setCurrentPage(1)

            const allPageTexts: { str: string }[][] = [] // 1-indexed
            const allFigures: Figure[] = []

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

            setStatusMessage(`PDF processed! Found ${figuresWithCaptions.length} figures. Extracting tables...`)

            setIsExtractingTables(true)
            extractTablesFromDocument(loadedPdf, allPageTexts, setStatusMessage).then((tables) => {
                setExtractedTables(tables)
                setIsExtractingTables(false)
                setStatusMessage(`PDF processed! Found ${figuresWithCaptions.length} figures and ${tables.length} tables.`)
            })
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error("PDF processing error:", error)
            setStatusMessage(`Error: ${errorMessage || "Failed to process PDF"}`)
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

    // Figure & Table Viewer Logic
    const openFigureViewer = (figure: Figure) => {
        setSelectedFigure(figure)
        setZoom(1)
        const figureAnnotations = annotations[figure.id] || { drawings: [], notes: [] }
        setAnnotations({ ...annotations, [figure.id]: figureAnnotations })
    }

    const closeFigureViewer = () => {
        setSelectedFigure(null)
        setIsDrawing(false)
        setCurrentPath([])
        setFigureExplanation("")
        setIsExplainingFigure(false)
    }

    const openTableViewer = (table: StructuredTable) => {
        setSelectedTable(table)
    }

    const closeTableViewer = () => {
        setSelectedTable(null)
        setTableExplanation("")
        setIsExplainingTable(false)
    }

    // Annotation Logic
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
        const x = (e.clientX - rect.left) / zoom
        const y = (e.clientY - rect.top) / zoom

        const newPathSegment = { x, y }
        setCurrentPath((prev) => [...prev, newPathSegment])

        const ctx = annotationCanvasRef.current.getContext("2d")
        if (!ctx) return

        ctx.clearRect(0, 0, annotationCanvasRef.current.width, annotationCanvasRef.current.height)
        redrawAnnotations()

        ctx.beginPath()
        ctx.moveTo(currentPath[0].x * zoom, currentPath[0].y * zoom)

        const tool = currentPath[0].tool
        const color = currentPath[0].color || "#000000"

        if (tool === "highlight") {
            ctx.globalAlpha = 0.3
            ctx.strokeStyle = color
            ctx.lineWidth = 20 * zoom
        } else if (tool === "pen") {
            ctx.globalAlpha = 1
            ctx.strokeStyle = color
            ctx.lineWidth = 2 * zoom
        } else if (tool === "eraser") {
            ctx.globalCompositeOperation = "destination-out"
            ctx.strokeStyle = "rgba(0,0,0,1)"
            ctx.lineWidth = 20 * zoom
        }

        for (let i = 1; i < currentPath.length; i++) {
            ctx.lineTo(currentPath[i].x * zoom, currentPath[i].y * zoom)
        }
        ctx.lineTo(x * zoom, y * zoom)
        ctx.stroke()

        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = "source-over"
    }

    const handleAnnotationEnd = () => {
        if (!isDrawing) return
        setIsDrawing(false)
        if (selectedFigure && currentPath.length > 1) {
            const figureId = selectedFigure.id
            const currentAnnotations = annotations[figureId] || { drawings: [], notes: [] }
            const newDrawing: Drawing = {
                tool: currentPath[0].tool || "pen",
                color: currentPath[0].color || "#000000",
                path: currentPath.map(p => ({ x: p.x, y: p.y }))
            }
            setAnnotations({
                ...annotations,
                [figureId]: {
                    ...currentAnnotations,
                    drawings: [...currentAnnotations.drawings, newDrawing],
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

        figureAnnotations.drawings.forEach((path: Drawing) => {
            if (path.path.length < 2) return
            ctx.beginPath()
            ctx.moveTo(path.path[0].x * zoom, path.path[0].y * zoom)
            const tool = path.tool
            const color = path.color

            if (tool === "highlight") {
                ctx.globalAlpha = 0.3
                ctx.strokeStyle = color
                ctx.lineWidth = 20 * zoom
            } else if (tool === "pen") {
                ctx.globalAlpha = 1
                ctx.strokeStyle = color
                ctx.lineWidth = 2 * zoom
            } else if (tool === "eraser") {
                return
            }

            for (let i = 1; i < path.path.length; i++) {
                ctx.lineTo(path.path[i].x * zoom, path.path[i].y * zoom)
            }
            ctx.stroke()
            ctx.globalAlpha = 1
        })
    }, [annotations, selectedFigure, zoom])

    const saveAnnotatedFigure = async () => {
        if (!selectedFigure || !figureCanvasRef.current || !annotationCanvasRef.current) return

        const combinedCanvas = document.createElement("canvas")
        combinedCanvas.width = selectedFigure.width
        combinedCanvas.height = selectedFigure.height
        const ctx = combinedCanvas.getContext("2d")
        if (!ctx) return

        ctx.drawImage(figureCanvasRef.current, 0, 0)

        const figureAnnotations = annotations[selectedFigure.id]
        if (figureAnnotations && figureAnnotations.drawings) {
            figureAnnotations.drawings.forEach((path: Drawing) => {
                if (path.path.length < 2) return
                ctx.beginPath()
                ctx.moveTo(path.path[0].x, path.path[0].y)
                const tool = path.tool
                const color = path.color

                if (tool === "highlight") {
                    ctx.globalAlpha = 0.3
                    ctx.strokeStyle = color
                    ctx.lineWidth = 20
                } else if (tool === "pen") {
                    ctx.globalAlpha = 1
                    ctx.strokeStyle = color
                    ctx.lineWidth = 2
                }
                for (let i = 1; i < path.path.length; i++) {
                    ctx.lineTo(path.path[i].x, path.path[i].y)
                }
                ctx.stroke()
                ctx.globalAlpha = 1
            })
        }

        try {
            const imageData = combinedCanvas.toDataURL("image/png")
            const filename = `annotated-${selectedFigure.id}.png`

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

    // Q&A Logic
    const handleAskQuestion = async (questionToAsk?: string) => {
        const currentQuestion = questionToAsk || question
        if (!currentQuestion.trim() || pageTextContents.length === 0) return

        setIsAsking(true)
        setShowAnswer(false)
        setFollowUpQuestions([])
        setAiThinking("🔍 Analyzing document structure...")
        setStatusMessage("Gemini is analyzing your question...")

        try {
            setAiThinking("📄 Indexing document for analysis...")
            const documentSentences: { index: number; pageNum: number; text: string; localIndex: number }[] = []
            let sentenceIndex = 0
            const newCitationMap: { [key: number]: { pageNum: number; textIndex: number; sentence: string } } = {}

            pageTextContents.forEach((pageItems, pageNum) => {
                if (!pageItems || pageNum === 0) return
                const pageText = pageItems.map((item: { str: string }) => item.str).join(" ")
                const sentences = pageText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [pageText]
                sentences.forEach((sentence: string, idx: number) => {
                    const trimmedSentence = sentence.trim()
                    if (trimmedSentence) {
                        documentSentences.push({
                            index: sentenceIndex,
                            pageNum: pageNum,
                            text: trimmedSentence,
                            localIndex: idx,
                        })
                        newCitationMap[sentenceIndex] = {
                            pageNum: pageNum,
                            textIndex: idx,
                            sentence: trimmedSentence,
                        }
                        sentenceIndex++
                    }
                })
            })

            setCitationMap(newCitationMap)

            const citableDocument = documentSentences.map((sent) => `[${sent.index}] ${sent.text}`).join("\n")
            const figureContext =
                extractedFigures.length > 0
                    ? `\nNote: This document contains ${extractedFigures.length} figures: ${extractedFigures.map((f) => f.caption || f.id).join(", ")}`
                    : ""
            const tableContext =
                extractedTables.length > 0
                    ? `\nNote: This document contains ${extractedTables.length} tables: ${extractedTables.map((t) => t.title || t.id).join(", ")}`
                    : ""

            setAiThinking("💭 Analyzing document with citations...")
            const enhancedPrompt = `You are analyzing a research paper. Each sentence is indexed with [number].
DOCUMENT (first 5000 chars):
${citableDocument.substring(0, 5000)}
${figureContext}
${tableContext}
USER QUESTION: "${currentQuestion}"
Instructions:
1. Answer the question comprehensively based ONLY on the document content
2. Be specific and detailed in your answer
3. Reference specific figures or tables by name when relevant
4. After your answer, provide a JSON object with metadata
Format your response as:
[Your detailed answer here - reference figures and tables by their names when relevant]

JSON_METADATA:
{"source_quote": "the most relevant exact quote from document", "page_number": X, "sentence_indices": [list of sentence indices that support your answer], "referenced_figures": ["Figure X", ...], "referenced_tables": ["Table Y", ...], "follow_up_questions": ["Follow up question 1", "Follow up question 2", "Follow up question 3"]}`

            const enhancedResponse = await callGeminiApi(enhancedPrompt)
            const jsonMatch = enhancedResponse.match(/JSON_METADATA:\s*({[\s\S]*})/)
            let metadata = {
                source_quote: "",
                page_number: 1,
                sentence_indices: [],
                referenced_figures: [],
                referenced_tables: [],
                follow_up_questions: [],
            }
            let answerText = enhancedResponse

            if (jsonMatch) {
                try {
                    metadata = JSON.parse(jsonMatch[1])
                    answerText = enhancedResponse.substring(0, enhancedResponse.indexOf("JSON_METADATA:")).trim()
                } catch {
                    console.error("Failed to parse metadata")
                }
            }

            const sourcePage =
                metadata.page_number ||
                (metadata.sentence_indices.length > 0 ? documentSentences[metadata.sentence_indices[0]]?.pageNum || 1 : 1)
            setAnswer(answerText)
            setSourceQuote(metadata.source_quote)
            setCitations(metadata.sentence_indices || [])
            setFollowUpQuestions(metadata.follow_up_questions || [])
            setHighlightedText(metadata.source_quote)
            setHighlightedPage(sourcePage)
            setShowAnswer(true)
            setAiThinking("")
            setActiveTab("text")
            if (pdfDoc && sourcePage !== currentPage) {
                // renderPage will be handled by PDFViewer effect
                setCurrentPage(sourcePage)
            }

            const historyEntry: HistoryEntry = {
                id: Date.now(),
                pdfName: currentPdfName,
                question: currentQuestion,
                answer: answerText,
                sourceQuote: metadata.source_quote,
                pageNumber: sourcePage,
                timestamp: new Date().toLocaleString(),
                citations: metadata.sentence_indices || [],
                referencedFigures: metadata.referenced_figures || [],
                referencedTables: metadata.referenced_tables || [],
                documentSentences,
                citationMap: newCitationMap,
            }
            setHistory((prev) => [historyEntry, ...prev])
            setStatusMessage(`Answer found on page ${sourcePage}!`)
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error("Q&A Error:", error)
            setAnswer(`Error: ${errorMessage}`)
            setShowAnswer(true)
            setStatusMessage("Error processing question.")
            setAiThinking("")
        } finally {
            setIsAsking(false)
        }
    }

    // Explain Figure
    const handleExplainFigure = async () => {
        if (!selectedFigure || !pageTextContents[selectedFigure.pageNum]) return

        setIsExplainingFigure(true)
        setFigureExplanation("")

        try {
            const figure = selectedFigure
            const pageText = pageTextContents[figure.pageNum]?.map((item: { str: string }) => item.str).join(" ") || ""

            const prompt = `Here is the caption for a figure from a research paper: 
      "${figure.caption}"
      
      Here is the text from the page (page ${figure.pageNum}) where the figure appears (truncated):
      "${pageText.substring(0, 3000)}..."
      
      Please provide a concise, one-paragraph explanation of what this figure likely shows and its importance in the context of the paper, based on both the caption and the page text. 
      Start your explanation directly (e.g., "This figure shows...") and keep it simple.`

            const explanation = await callGeminiApi(prompt, false)
            setFigureExplanation(explanation)
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error("Figure Explanation Error:", error)
            setFigureExplanation(`Error: ${errorMessage}`)
        } finally {
            setIsExplainingFigure(false)
        }
    }

    // Explain Table
    const handleExplainTable = async () => {
        if (!selectedTable || !pageTextContents[selectedTable.pageNum]) return

        setIsExplainingTable(true)
        setTableExplanation("")

        try {
            const table = selectedTable
            const pageText = pageTextContents[table.pageNum]?.map((item: { str: string }) => item.str).join(" ") || ""

            const prompt = `Here is the title/caption for a table from a research paper: 
      Title: "${table.title}"
      Caption: "${table.caption || "N/A"}"
      
      Here is the text from the page (page ${table.pageNum}) where the table appears (truncated):
      "${pageText.substring(0, 3000)}..."
      
      Please provide a concise, one-paragraph explanation of what this table shows and its key findings or importance in the context of the paper, based on its title, caption, and the page text. 
      Start your explanation directly (e.g., "This table shows...") and keep it simple.`

            const explanation = await callGeminiApi(prompt, false)
            setTableExplanation(explanation)
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error("Table Explanation Error:", error)
            setTableExplanation(`Error: ${errorMessage}`)
        } finally {
            setIsExplainingTable(false)
        }
    }

    // Download CSV
    const generateCSV = (table: StructuredTable) => {
        const escapeCSV = (cell: string | null | undefined) => {
            if (cell == null) return '""'
            const str = String(cell)
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                return `"${str.replace(/"/g, '""')}"`
            }
            return `"${str}"`
        }

        let csv = ""

        if (table.headers) {
            csv += table.headers.map(escapeCSV).join(",") + "\r\n"
        }

        table.rows.forEach((row: string[]) => {
            csv += row.map(escapeCSV).join(",") + "\r\n"
        })

        return csv
    }

    const downloadTableAsCSV = (table: StructuredTable) => {
        if (!table) return
        const csv = generateCSV(table)
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8," })
        const url = URL.createObjectURL(blob)

        const link = document.createElement("a")
        link.href = url
        const fileName = (table.title || table.id).replace(/[^a-z0-9_]/gi, "-").toLowerCase()
        link.download = `${fileName}.csv`
        document.body.appendChild(link)
        link.click()

        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        setStatusMessage("Table downloaded as CSV.")
    }

    // Summarize
    const handleSummarize = async () => {
        setIsSummarizing(true)
        setShowSummary(false)
        setAiThinking("📚 Reading entire document...")
        setStatusMessage("Generating PICOTT summary...")
        try {
            const fullDocumentText = pageTextContents
                .map((p, i) => (p ? `\n\n[Page ${i}]\n${p.map((item: { str: string }) => item.str).join(" ")}` : ""))
                .join("")

            setAiThinking("🔬 Extracting research components...")
            const picottPrompt = `Analyze this document using the PICOTT framework for research studies.
**PICOTT Framework:**
- P (Population/Problem): Target population or research problem
- I (Intervention): Treatment or method being studied
- C (Comparison): Control group or alternative
- O (Outcome): Results being measured
- T (Time): Study duration
- T (Type): Research design
- Inclusion/Exclusion Criteria
Document (first 5000 chars):
${fullDocumentText.substring(0, 5000)}
Note: This document contains ${extractedFigures.length} figures and ${extractedTables.length} tables that may contain additional relevant information.
Respond with ONLY a JSON object with keys: "population", "intervention", "comparison", "outcome", "time", "type_of_study", "inclusion_criteria", "exclusion_criteria".
Each value should be an object with: {"text": "Summary of findings", "quote": "Supporting quote from document", "page_number": Page number (integer)}
If not found, use: {"text": "Not found", "quote": "Not found", "page_number": 0}`

            const summaryData = await callGeminiApi(picottPrompt, true)

            interface PicottField {
                text?: string
                quote?: string
                page_number?: number
            }
            const fieldsForTTS: { [key: string]: { name: string } } = {
                population: { name: "Population/Problem" },
                intervention: { name: "Intervention" },
                comparison: { name: "Comparison" },
                outcome: { name: "Outcome" },
                time: { name: "Time" },
                type_of_study: { name: "Type of Study" },
                inclusion_criteria: { name: "Inclusion Criteria" },
                exclusion_criteria: { name: "Exclusion Criteria" },
            }
            const rawText = Object.entries(summaryData as Record<string, PicottField>)
                .map(([key, value]: [string, PicottField]) => {
                    const fieldName = fieldsForTTS[key]?.name || key
                    if (value.text && value.text !== "Not found") {
                        return `${fieldName}: ${value.text}`
                    }
                    return null
                })
                .filter(Boolean)
                .join("\n\n")

            setRawSummaryText(rawText)
            setSummary(
                formatPicottSummary(
                    summaryData,
                    setHighlightedText,
                    setHighlightedPage,
                    setActiveTab,
                    pdfDoc,
                    (_pdf, pageNum) => setCurrentPage(pageNum),
                    scrollToHighlight,
                ),
            )
            setShowSummary(true)
            setAiThinking("")
            setStatusMessage("PICOTT summary generated successfully!")
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error("Summary Error:", error)
            setSummary(`<div class="text-center p-6 text-gray-500">⚠️ Could not generate summary: ${errorMessage}</div>`)
            setShowSummary(true)
            setAiThinking("")
            setStatusMessage("Could not generate structured summary.")
        } finally {
            setIsSummarizing(false)
        }
    }

    const handleHistoryClick = async (entry: HistoryEntry) => {
        if (currentPdfName !== entry.pdfName) {
            alert(`Please upload the correct PDF: ${entry.pdfName}`)
            return
        }

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
        setActiveTab("text")
        if (pdfDoc && entry.pageNumber !== currentPage) {
            setCurrentPage(entry.pageNumber)
        }
    }

    const getPlainTextWithHighlight = () => {
        const pageText = pageTextContents[currentPage]?.map((item: { str: string }) => item.str).join(" ") || ""

        if (!highlightedText || highlightedPage !== currentPage) {
            if (activeCitation !== null && citationMap[activeCitation]?.pageNum === currentPage) {
                const citationSentence = citationMap[activeCitation].sentence
                const escapedCitation = citationSentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                const citationRegex = new RegExp(`(${escapedCitation})`, "gi")
                return pageText
                    .split(citationRegex)
                    .map((part, i) =>
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
            .map((part, i) =>
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

    const handleCitationClick = async (citationIndex: number) => {
        const citation = citationMap[citationIndex]
        if (!citation) {
            console.warn(`Citation ${citationIndex} not found in citation map`)
            return
        }

        if (citationTimeout) {
            clearTimeout(citationTimeout)
        }

        setActiveCitation(citationIndex)

        if (citation.pageNum !== currentPage) {
            setCurrentPage(citation.pageNum)
        }

        setActiveTab("text")
        setHighlightedText(citation.sentence)
        setHighlightedPage(citation.pageNum)

        setTimeout(() => {
            scrollToHighlight()
            setStatusMessage(`Mapsd to citation [${citationIndex}] on page ${citation.pageNum}`)
        }, 200)

        const timeout = setTimeout(() => {
            setActiveCitation(null)
        }, 3000)
        setCitationTimeout(timeout)
    }

    useEffect(() => {
        return () => {
            if (citationTimeout) {
                clearTimeout(citationTimeout)
            }
        }
    }, [citationTimeout])

    const scrollToHighlight = useCallback(() => {
        // This function is passed to child components but implemented in PDFViewer
        // We might need a ref here if we want to control it from parent,
        // but currently PDFViewer handles its own scrolling effect.
        // However, for SummaryView click handler, we need to trigger scroll.
        // Since PDFViewer is mounted when activeTab is 'text', it will handle scroll on mount/update.
    }, [])

    const sampleQuestions = [
        "What is the main objective of this study?",
        "What were the key findings?",
        "What methodology was used?",
        "What are the limitations of this research?",
        "What are the future recommendations?",
    ]

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
                                            <Type className="w-16 h-16 text-purple-400" />
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
                                            {["viewer", "text", "figures", "tables"].map((tabName) => (
                                                <button
                                                    key={tabName}
                                                    onClick={() => {
                                                        setActiveTab(tabName)
                                                        if (tabName === "viewer" || tabName === "text") clearHighlight()
                                                    }}
                                                    className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === tabName ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg scale-105" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
                                                >
                                                    {tabName === "viewer" && <Eye className="w-4 h-4" />}
                                                    {tabName === "text" && <Type className="w-4 h-4" />}
                                                    {tabName === "figures" && <ImageIconLucide className="w-4 h-4" />}
                                                    {tabName === "tables" && <TableIconLucide className="w-4 h-4" />}
                                                    {tabName.charAt(0).toUpperCase() + tabName.slice(1)}
                                                    {tabName === "text" && highlightedText && activeTab === "text" && (
                                                        <span className="ml-2 px-2 py-0.5 bg-yellow-400/20 text-yellow-300 rounded-full text-xs">
                                                            Highlighted
                                                        </span>
                                                    )}
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

                                        {activeTab === "viewer" || activeTab === "text" ? (
                                            <PDFViewer
                                                pdfDoc={pdfDoc}
                                                currentPage={currentPage}
                                                totalPages={totalPages}
                                                setCurrentPage={setCurrentPage}
                                                isFullscreen={isFullscreen}
                                                setIsFullscreen={setIsFullscreen}
                                                activeTab={activeTab}
                                                highlightedText={highlightedText}
                                                highlightedPage={highlightedPage}
                                                clearHighlight={clearHighlight}
                                                pageTextContents={pageTextContents}
                                                getPlainTextWithHighlight={getPlainTextWithHighlight}
                                                setStatusMessage={setStatusMessage}
                                            />
                                        ) : activeTab === "figures" ? (
                                            <FigureGallery
                                                extractedFigures={extractedFigures}
                                                showDiagnostics={showDiagnostics}
                                                setShowDiagnostics={setShowDiagnostics}
                                                extractionDiagnostics={extractionDiagnostics}
                                                openFigureViewer={openFigureViewer}
                                                selectedFigure={selectedFigure}
                                                closeFigureViewer={closeFigureViewer}
                                                saveAnnotatedFigure={saveAnnotatedFigure}
                                                zoom={zoom}
                                                setZoom={setZoom}
                                                isExplainingFigure={isExplainingFigure}
                                                handleExplainFigure={handleExplainFigure}
                                                figureExplanation={figureExplanation}
                                                setQuestion={setQuestion}
                                                handleAskQuestion={handleAskQuestion}
                                                annotationTool={annotationTool}
                                                setAnnotationTool={setAnnotationTool}
                                                annotationColor={annotationColor}
                                                setAnnotationColor={setAnnotationColor}
                                                handleAnnotationStart={handleAnnotationStart}
                                                handleAnnotationMove={handleAnnotationMove}
                                                handleAnnotationEnd={handleAnnotationEnd}
                                                addNote={addNote}
                                                annotations={annotations}
                                                figureCanvasRef={figureCanvasRef}
                                                annotationCanvasRef={annotationCanvasRef}
                                                redrawAnnotations={redrawAnnotations}
                                            />
                                        ) : activeTab === "tables" ? (
                                            <TableGallery
                                                isExtractingTables={isExtractingTables}
                                                extractedTables={extractedTables}
                                                openTableViewer={openTableViewer}
                                                selectedTable={selectedTable}
                                                closeTableViewer={closeTableViewer}
                                                downloadTableAsCSV={downloadTableAsCSV}
                                                isExplainingTable={isExplainingTable}
                                                handleExplainTable={handleExplainTable}
                                                tableExplanation={tableExplanation}
                                            />
                                        ) : null}
                                    </div>

                                    <ChatInterface
                                        question={question}
                                        setQuestion={setQuestion}
                                        handleAskQuestion={handleAskQuestion}
                                        isAsking={isAsking}
                                        aiThinking={aiThinking}
                                        showAnswer={showAnswer}
                                        answer={answer}
                                        sourceQuote={sourceQuote}
                                        citations={citations}
                                        citationMap={citationMap}
                                        activeCitation={activeCitation}
                                        handleCitationClick={handleCitationClick}
                                        followUpQuestions={followUpQuestions}
                                        handleTextToSpeech={handleTextToSpeech}
                                        isBufferingAudio={isBufferingAudio}
                                        currentPlayingId={currentPlayingId}
                                        audioPlayer={audioPlayer}
                                        setHighlightedText={setHighlightedText}
                                        setHighlightedPage={setHighlightedPage}
                                        setActiveTab={setActiveTab}
                                        pdfDoc={pdfDoc}
                                        renderPage={(pdf, pageNum) => {
                                            // Handled by PDFViewer effect when currentPage changes
                                            setCurrentPage(pageNum)
                                        }}
                                        highlightedPage={highlightedPage}
                                        scrollToHighlight={scrollToHighlight}
                                        history={history}
                                        showHistory={showHistory}
                                        setShowHistory={setShowHistory}
                                        handleHistoryClick={handleHistoryClick}
                                        sampleQuestions={sampleQuestions}
                                    />
                                </div>

                                <div className="space-y-6">
                                    <SummaryView
                                        handleSummarize={handleSummarize}
                                        isSummarizing={isSummarizing}
                                        showSummary={showSummary}
                                        summary={summary}
                                        rawSummaryText={rawSummaryText}
                                        handleTextToSpeech={handleTextToSpeech}
                                        isBufferingAudio={isBufferingAudio}
                                        currentPlayingId={currentPlayingId}
                                        audioPlayer={audioPlayer}
                                        setHighlightedText={setHighlightedText}
                                        setHighlightedPage={setHighlightedPage}
                                        setActiveTab={setActiveTab}
                                        pdfDoc={pdfDoc}
                                        renderPage={(pdf, pageNum) => setCurrentPage(pageNum)}
                                        scrollToHighlight={scrollToHighlight}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

export default PDFQAApp
