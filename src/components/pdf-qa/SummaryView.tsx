import type React from "react"
import { Sparkles, FileSearch, Loader2, Volume2, StopCircle, Users, Beaker, BarChart3, Target, Calendar, BookOpen, Shield, Ban, Quote } from "lucide-react"
import { PDFDocumentProxy } from "@/types/pdf-qa"

interface SummaryViewProps {
    handleSummarize: () => void
    isSummarizing: boolean
    showSummary: boolean
    summary: React.ReactNode | string
    rawSummaryText: string
    handleTextToSpeech: (text: string, id: string) => void
    isBufferingAudio: boolean
    currentPlayingId: string | null
    audioPlayer: HTMLAudioElement | null
    setHighlightedText: (text: string) => void
    setHighlightedPage: (page: number | null) => void
    setActiveTab: (tab: string) => void
    pdfDoc: PDFDocumentProxy | null
    renderPage: (pdf: PDFDocumentProxy | null, pageNum: number) => void
    scrollToHighlight: () => void
}

const SummaryView: React.FC<SummaryViewProps> = ({
    handleSummarize,
    isSummarizing,
    showSummary,
    summary,
    rawSummaryText,
    handleTextToSpeech,
    isBufferingAudio,
    currentPlayingId,
    audioPlayer,
    setHighlightedText: _setHighlightedText,
    setHighlightedPage: _setHighlightedPage,
    setActiveTab: _setActiveTab,
    pdfDoc: _pdfDoc,
    renderPage: _renderPage,
    scrollToHighlight: _scrollToHighlight,
}) => {
    return (
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
                className="group relative inline-flex items-center px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-2xl text-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 w-full mb-6"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                <div className="relative flex items-center gap-3 justify-center">
                    {isSummarizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSearch className="w-5 h-5" />}
                    ✨ Generate PICOTT Summary
                </div>
            </button>

            {showSummary && (
                <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 border border-white/10">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-white">PICOTT Summary</h3>
                        {rawSummaryText && (
                            <button
                                onClick={() => handleTextToSpeech(rawSummaryText, "picott-summary")}
                                disabled={isBufferingAudio && currentPlayingId !== "picott-summary"}
                                className="group relative inline-flex items-center px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-xl hover:bg-blue-500/30 transition-all text-sm font-medium"
                            >
                                {isBufferingAudio && currentPlayingId === "picott-summary" ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : audioPlayer && currentPlayingId === "picott-summary" ? (
                                    <StopCircle className="w-4 h-4 mr-2" />
                                ) : (
                                    <Volume2 className="w-4 h-4 mr-2" />
                                )}
                                {audioPlayer && currentPlayingId === "picott-summary" ? "Stop" : "✨ Listen"}
                            </button>
                        )}
                    </div>
                    <div>{summary}</div>
                </div>
            )}
        </div>
    )
}

interface PicottField {
    text: string
    quote: string
    page_number: number
}

interface PicottData {
    [key: string]: PicottField
}

export const formatPicottSummary = (
    data: PicottData,
    setHighlightedText: (text: string) => void,
    setHighlightedPage: (page: number) => void,
    setActiveTab: (tab: string) => void,
    pdfDoc: PDFDocumentProxy | null,
    renderPage: (pdf: PDFDocumentProxy | null, pageNum: number) => void,
    scrollToHighlight: () => void,
): React.ReactNode => {
    const fields: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
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
                                            setActiveTab("text")
                                            if (pdfDoc && data[key].page_number) renderPage(pdfDoc, data[key].page_number)
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

export default SummaryView
