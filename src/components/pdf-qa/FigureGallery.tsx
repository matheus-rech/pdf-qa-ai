import React, { useEffect } from "react"
import { Camera, Download, ZoomOut, ZoomIn, X, MousePointer, Highlighter, Pencil, Eraser } from "lucide-react"
import type { Figure, ExtractionDiagnostics, Annotation } from "@/types/pdf-qa"

interface FigureGalleryProps {
    extractedFigures: Figure[]
    showDiagnostics: boolean
    setShowDiagnostics: (show: boolean) => void
    extractionDiagnostics: Record<string, ExtractionDiagnostics>
    openFigureViewer: (figure: Figure) => void
    selectedFigure: Figure | null
    closeFigureViewer: () => void
    saveAnnotatedFigure: () => void
    zoom: number
    setZoom: (z: number) => void
    isExplainingFigure: boolean
    handleExplainFigure: () => void
    figureExplanation: string
    setQuestion: (q: string) => void
    handleAskQuestion: (q?: string) => void
    annotationTool: string
    setAnnotationTool: (tool: string) => void
    annotationColor: string
    setAnnotationColor: (color: string) => void
    handleAnnotationStart: (e: React.MouseEvent) => void
    handleAnnotationMove: (e: React.MouseEvent) => void
    handleAnnotationEnd: () => void
    addNote: () => void
    annotations: Record<string, Annotation>
    figureCanvasRef: React.RefObject<HTMLCanvasElement | null>
    annotationCanvasRef: React.RefObject<HTMLCanvasElement | null>
    redrawAnnotations: () => void
}

const FigureGallery: React.FC<FigureGalleryProps> = ({
    extractedFigures,
    showDiagnostics,
    setShowDiagnostics,
    extractionDiagnostics,
    openFigureViewer,
    selectedFigure,
    closeFigureViewer,
    saveAnnotatedFigure,
    zoom,
    setZoom,
    isExplainingFigure,
    handleExplainFigure,
    figureExplanation,
    setQuestion,
    // handleAskQuestion is passed but used indirectly through setQuestion
    annotationTool,
    setAnnotationTool,
    annotationColor,
    setAnnotationColor,
    handleAnnotationStart,
    handleAnnotationMove,
    handleAnnotationEnd,
    addNote,
    annotations,
    figureCanvasRef,
    annotationCanvasRef,
    redrawAnnotations,
}) => {
    const annotationTools = [
        { id: "select", icon: <MousePointer className="w-4 h-4" />, name: "Select" },
        { id: "highlight", icon: <Highlighter className="w-4 h-4" />, name: "Highlight" },
        { id: "pen", icon: <Pencil className="w-4 h-4" />, name: "Pen" },
        { id: "eraser", icon: <Eraser className="w-4 h-4" />, name: "Eraser" },
    ]
    const annotationColors = ["#FFEB3B", "#FF5252", "#448AFF", "#69F0AE", "#FF6E40", "#E040FB"]

    useEffect(() => {
        if (selectedFigure && annotationCanvasRef.current && figureCanvasRef.current) {
            // Set canvas dimensions based on figure and zoom
            const canvasWidth = selectedFigure.width * zoom
            const canvasHeight = selectedFigure.height * zoom

            // Ensure figure canvas has the base image
            const figCtx = figureCanvasRef.current.getContext("2d")
            if (figCtx) {
                figureCanvasRef.current.width = selectedFigure.width // Store at 1x zoom
                figureCanvasRef.current.height = selectedFigure.height
                const img = new Image()
                img.onload = () => {
                    figCtx.drawImage(img, 0, 0, selectedFigure.width, selectedFigure.height)
                    redrawAnnotations()
                }
                img.src = selectedFigure.dataUrl
            }

            // Annotation canvas should match the display size
            annotationCanvasRef.current.width = canvasWidth
            annotationCanvasRef.current.height = canvasHeight
            redrawAnnotations()
        }
    }, [zoom, selectedFigure, redrawAnnotations, annotationCanvasRef, figureCanvasRef])

    return (
        <div>
            <div className="mb-6 p-4 bg-purple-600/10 rounded-2xl border border-purple-500/30">
                <div className="flex items-center justify-between">
                    <p className="text-purple-300 font-medium flex items-center gap-2">
                        <Camera className="w-5 h-5" /> &apos;Select&apos; tool to highlight the area you want to extract.
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
                            {Object.entries(extractionDiagnostics).map(([pageKey, diag]) => (
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
                            <h4
                                className="text-lg font-semibold text-gray-300 mb-2 cursor-pointer"
                                onClick={() => openFigureViewer(figure)}
                            >
                                {figure.caption || figure.id}
                            </h4>
                            <p className="text-sm text-gray-400">Page: {figure.pageNum}</p>
                            <button
                                onClick={() => {
                                    setQuestion(`Regarding ${figure.caption || figure.id}, `)
                                    const inputEl = document.querySelector('input[placeholder="Ask anything about the document..."]')
                                    if (inputEl) (inputEl as HTMLElement).focus()
                                }}
                                className="mt-2 text-xs px-3 py-1 bg-purple-600/20 text-purple-300 rounded-full hover:bg-purple-600/30 transition-colors border border-purple-500/30"
                            >
                                ✨ Ask about this figure
                            </button>
                        </div>
                    </div>
                ))}
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
                                    <span className="text-sm font-medium bg-black/50 px-2 py-1 rounded text-white">
                                        {Math.round(zoom * 100)}%
                                    </span>
                                    <button
                                        onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                                        className="p-2 hover:bg-white/10 rounded-lg transition-all"
                                    >
                                        <ZoomIn className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>
                            </div>

                            <div className="w-1/3 space-y-6">
                                <div className="bg-black/20 rounded-2xl p-6 border border-white/10">
                                    <h3 className="text-xl font-bold text-white mb-4">AI Analysis</h3>
                                    <p className="text-gray-300 text-sm mb-4">
                                        Get an instant explanation of this figure based on the paper&apos;s context.
                                    </p>
                                    <button
                                        onClick={handleExplainFigure}
                                        disabled={isExplainingFigure}
                                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-bold text-white transition-all disabled:opacity-50"
                                    >
                                        {isExplainingFigure ? "Analyzing..." : "✨ Explain Figure"}
                                    </button>
                                    {figureExplanation && (
                                        <div className="mt-4 p-4 bg-purple-900/20 rounded-xl border border-purple-500/30">
                                            <p className="text-purple-200 text-sm leading-relaxed">{figureExplanation}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-black/20 rounded-2xl p-6 border border-white/10">
                                    <h3 className="text-xl font-bold text-white mb-4">Annotation Tools</h3>
                                    <div className="flex gap-2 mb-4">
                                        {annotationTools.map((tool) => (
                                            <button
                                                key={tool.id}
                                                onClick={() => setAnnotationTool(tool.id)}
                                                className={`p-3 rounded-xl transition-all ${annotationTool === tool.id ? "bg-purple-600 text-white" : "bg-white/10 text-gray-400"
                                                    }`}
                                                title={tool.name}
                                            >
                                                {tool.icon}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 mb-6">
                                        {annotationColors.map((color) => (
                                            <button
                                                key={color}
                                                onClick={() => setAnnotationColor(color)}
                                                className={`w-8 h-8 rounded-full border-2 transition-all ${annotationColor === color ? "border-white scale-110" : "border-transparent"
                                                    }`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                    <button
                                        onClick={addNote}
                                        className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-white transition-all"
                                    >
                                        Add Note
                                    </button>
                                </div>

                                <div className="bg-black/20 rounded-2xl p-6 border border-white/10 max-h-60 overflow-y-auto">
                                    <h3 className="text-xl font-bold text-white mb-4">Notes</h3>
                                    {annotations[selectedFigure.id]?.notes?.length > 0 ? (
                                        <div className="space-y-3">
                                            {annotations[selectedFigure.id].notes.map((note) => (
                                                <div key={note.id} className="bg-white/5 p-3 rounded-xl border border-white/5">
                                                    <p className="text-gray-300 text-sm mb-1">{note.text}</p>
                                                    <p className="text-xs text-gray-500">{note.timestamp}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-gray-500 text-sm text-center">No notes yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default FigureGallery
