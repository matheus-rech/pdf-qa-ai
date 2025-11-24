import React from "react"
import {
    MessageCircle,
    Search,
    Loader2,
    Volume2,
    StopCircle,
    Quote,
    History,
} from "lucide-react"
import { HistoryEntry, PDFDocumentProxy } from "@/types/pdf-qa"

interface ChatInterfaceProps {
    question: string
    setQuestion: (q: string) => void
    handleAskQuestion: (q?: string) => void
    isAsking: boolean
    aiThinking: string
    showAnswer: boolean
    answer: string
    sourceQuote: string
    citations: number[]
    citationMap: { [key: number]: { pageNum: number; textIndex: number; sentence: string } }
    activeCitation: number | null
    handleCitationClick: (index: number) => void
    followUpQuestions: string[]
    handleTextToSpeech: (text: string, id: string) => void
    isBufferingAudio: boolean
    currentPlayingId: string | null
    audioPlayer: HTMLAudioElement | null
    setHighlightedText: (text: string) => void
    setHighlightedPage: (page: number | null) => void
    setActiveTab: (tab: string) => void
    pdfDoc: PDFDocumentProxy | null
    renderPage: (pdf: PDFDocumentProxy | null, pageNum: number) => void
    highlightedPage: number | null
    scrollToHighlight: () => void
    history: HistoryEntry[]
    showHistory: boolean
    setShowHistory: (show: boolean) => void
    handleHistoryClick: (entry: HistoryEntry) => void
    sampleQuestions: string[]
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
    question,
    setQuestion,
    handleAskQuestion,
    isAsking,
    aiThinking,
    showAnswer,
    answer,
    sourceQuote,
    citations,
    citationMap,
    activeCitation,
    handleCitationClick,
    followUpQuestions,
    handleTextToSpeech,
    isBufferingAudio,
    currentPlayingId,
    audioPlayer,
    setHighlightedText,
    setHighlightedPage,
    setActiveTab,
    pdfDoc,
    renderPage,
    highlightedPage,
    scrollToHighlight,
    history,
    showHistory,
    setShowHistory,
    handleHistoryClick,
    sampleQuestions,
}) => {
    return (
        <div>
            <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 border border-white/10 mb-8">
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
                            onKeyDown={(e) => e.key === "Enter" && handleAskQuestion()}
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
                                    setQuestion(q)
                                    handleAskQuestion(q)
                                }}
                                className="px-4 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 text-gray-300 font-medium text-sm hover:bg-white/10 transition-colors"
                            >
                                {q}
                            </button>
                        ))}
                    </div>
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
                                onClick={() => handleTextToSpeech(answer, "main-answer")}
                                disabled={isBufferingAudio && currentPlayingId !== "main-answer"}
                                className="group relative inline-flex items-center px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-xl hover:bg-blue-500/30 transition-all text-sm font-medium"
                            >
                                {isBufferingAudio && currentPlayingId === "main-answer" ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : audioPlayer && currentPlayingId === "main-answer" ? (
                                    <StopCircle className="w-4 h-4 mr-2" />
                                ) : (
                                    <Volume2 className="w-4 h-4 mr-2" />
                                )}
                                {audioPlayer && currentPlayingId === "main-answer" ? "Stop" : "✨ Listen"}
                            </button>
                        </div>
                        <div className="prose prose-invert max-w-none mb-4">
                            <p>{answer}</p>
                        </div>
                        {sourceQuote && (
                            <div
                                className="mt-3 p-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 rounded-lg border-l-4 border-blue-400 cursor-pointer hover:bg-blue-50 transition-colors"
                                onClick={() => {
                                    setHighlightedText(sourceQuote)
                                    setHighlightedPage(highlightedPage)
                                    setActiveTab("text")
                                    if (pdfDoc && highlightedPage) renderPage(pdfDoc, highlightedPage)
                                    setTimeout(scrollToHighlight, 100)
                                }}
                            >
                                <p className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-2">
                                    <Quote className="w-3 h-3" /> Source (Page {highlightedPage}) - Click to view
                                </p>
                                <p className="text-sm text-gray-600 italic">&quot;{sourceQuote}&quot;</p>
                            </div>
                        )}
                        {citations.length > 0 && (
                            <div className="mt-4 p-4 bg-gray-800/30 rounded-lg border border-gray-600/30">
                                <p className="text-gray-300 text-sm mb-2 font-medium">Supporting Citations:</p>
                                <div className="flex flex-wrap gap-2">
                                    {citations.map((citationIndex) => (
                                        <button
                                            key={citationIndex}
                                            onClick={() => handleCitationClick(citationIndex)}
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
                                                setQuestion(q)
                                                handleAskQuestion(q)
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
    )
}

export default ChatInterface
