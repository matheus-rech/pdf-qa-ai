import React, { useRef, useEffect } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { renderPage } from "@/lib/pdf-utils"
import type { PDFDocumentProxy } from "@/types/pdf-qa"

interface PDFViewerProps {
    pdfDoc: PDFDocumentProxy | null
    currentPage: number
    totalPages: number
    setCurrentPage: (page: number) => void
    isFullscreen: boolean
    setIsFullscreen: (full: boolean) => void
    activeTab: string
    highlightedText: string
    highlightedPage: number | null
    clearHighlight: () => void
    pageTextContents: unknown[]
    getPlainTextWithHighlight: () => string
    setStatusMessage: (msg: string) => void
}

const PDFViewer: React.FC<PDFViewerProps> = ({
    pdfDoc,
    currentPage,
    totalPages,
    setCurrentPage,
    isFullscreen,
    setIsFullscreen: _setIsFullscreen,
    activeTab,
    highlightedText,
    highlightedPage,
    clearHighlight,
    getPlainTextWithHighlight,
    setStatusMessage,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const textViewRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (pdfDoc && canvasRef.current && activeTab === "viewer") {
            renderPage(pdfDoc, currentPage, canvasRef.current, setStatusMessage)
        }
    }, [pdfDoc, currentPage, activeTab, setStatusMessage])

    const goToPreviousPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1)
    }

    const goToNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1)
    }

    const scrollToHighlight = () => {
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
    }

    useEffect(() => {
        if (activeTab === "text" && highlightedText) {
            setTimeout(scrollToHighlight, 100)
        }
    }, [activeTab, highlightedText, currentPage])

    return (
        <div>
            <div className="flex items-center justify-between bg-white/5 backdrop-blur-sm p-4 rounded-2xl mb-6 border border-white/10">
                <button
                    onClick={goToPreviousPage}
                    disabled={currentPage <= 1}
                    className="group flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm rounded-xl hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-white"
                >
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Previous
                </button>
                <div className="flex items-center gap-4">
                    <span className="font-semibold text-white bg-white/10 backdrop-blur-sm px-6 py-2.5 rounded-xl shadow-sm border border-white/10">
                        Page {currentPage} of {totalPages}
                    </span>
                    {activeTab === "text" && highlightedText && highlightedPage === currentPage && (
                        <button
                            onClick={clearHighlight}
                            className="px-4 py-2.5 bg-yellow-500/20 text-yellow-300 rounded-xl hover:bg-yellow-500/30 transition-all flex items-center gap-2 text-sm font-medium"
                        >
                            <X className="w-4 h-4" /> Clear Highlight
                        </button>
                    )}
                </div>
                <button
                    onClick={goToNextPage}
                    disabled={currentPage >= totalPages}
                    className="group flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm rounded-xl hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-white"
                >
                    Next <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>

            {activeTab === "viewer" ? (
                <div
                    ref={containerRef}
                    className={`relative border-2 border-white/10 rounded-2xl overflow-auto bg-black/20 backdrop-blur-sm shadow-inner ${isFullscreen ? "h-[800px]" : "h-[600px]"} transition-all duration-500`}
                >
                    <canvas ref={canvasRef} className="block rounded-xl mx-auto" />
                </div>
            ) : (
                <div
                    ref={textViewRef}
                    className="p-6 bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 max-h-[600px] overflow-y-auto"
                    style={{
                        scrollbarWidth: "thin",
                        scrollbarColor: "rgba(255, 255, 255, 0.2) rgba(255, 255, 255, 0.05)",
                    }}
                >
                    <div className="prose prose-invert max-w-none">
                        <h3 className="text-lg font-bold text-purple-300 mb-4">Page {currentPage}</h3>
                        <div
                            className="text-gray-300 leading-relaxed whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ __html: getPlainTextWithHighlight() }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

export default PDFViewer
