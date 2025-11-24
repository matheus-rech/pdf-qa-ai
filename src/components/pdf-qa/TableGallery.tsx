import React from "react"
import { Loader2, Download, X } from "lucide-react"
import { StructuredTable } from "@/types/pdf-qa"

interface TableGalleryProps {
    isExtractingTables: boolean
    extractedTables: StructuredTable[]
    openTableViewer: (table: StructuredTable) => void
    selectedTable: StructuredTable | null
    closeTableViewer: () => void
    downloadTableAsCSV: (table: StructuredTable) => void
    isExplainingTable: boolean
    handleExplainTable: () => void
    tableExplanation: string
}

const TableGallery: React.FC<TableGalleryProps> = ({
    isExtractingTables,
    extractedTables,
    openTableViewer,
    selectedTable,
    closeTableViewer,
    downloadTableAsCSV,
    isExplainingTable,
    handleExplainTable,
    tableExplanation,
}) => {
    return (
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
                            <div className="p-4">
                                <h4 className="text-lg font-semibold text-gray-300 mb-2">{table.title || table.id}</h4>
                                <p className="text-sm text-gray-400 mb-3">Page: {table.pageNum}</p>
                                <div
                                    className="overflow-x-auto bg-white rounded-lg p-2 max-h-60 overflow-y-auto"
                                    dangerouslySetInnerHTML={{ __html: table.htmlTable || "" }}
                                />
                                <p className="text-sm text-gray-400 mt-3 italic">Don&apos;t see the table you&apos;re looking for?</p>
                                {table.caption && <p className="text-sm text-gray-400 mt-3 italic">Caption: {table.caption}</p>}
                                <div className="text-right mt-2">
                                    <span className="text-xs px-3 py-1 bg-purple-600/20 text-purple-300 rounded-full group-hover:bg-purple-600/30 transition-colors border border-purple-500/30">
                                        Click to view details & download CSV
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Table Viewer Modal */}
            {selectedTable && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
                    <div className="relative w-full max-w-4xl max-h-[90vh] overflow-auto bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 p-8">
                        <div className="absolute top-4 right-4 flex items-center gap-3">
                            <button
                                onClick={() => downloadTableAsCSV(selectedTable)}
                                className="px-4 py-2 bg-green-500/20 text-green-300 rounded-xl hover:bg-green-500/30 transition-all flex items-center gap-2 text-sm font-medium"
                            >
                                <Download className="w-4 h-4" /> Download CSV
                            </button>
                            <button onClick={closeTableViewer} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <h2 className="text-3xl font-bold text-white mb-6">{selectedTable.title || selectedTable.id}</h2>

                        <div className="space-y-6">
                            <div
                                className="overflow-x-auto bg-white rounded-lg p-4 max-h-[50vh] overflow-y-auto"
                                dangerouslySetInnerHTML={{ __html: selectedTable.htmlTable || "" }}
                            />

                            <div className="bg-black/20 rounded-2xl p-6 border border-white/10">
                                <h3 className="text-xl font-bold text-white mb-4">AI Analysis</h3>
                                <p className="text-gray-300 text-sm mb-4">
                                    Get an instant explanation of this table based on the paper&apos;s context.
                                </p>
                                <button
                                    onClick={handleExplainTable}
                                    disabled={isExplainingTable}
                                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-bold text-white transition-all disabled:opacity-50"
                                >
                                    {isExplainingTable ? "Analyzing..." : "✨ Explain Table"}
                                </button>
                                {tableExplanation && (
                                    <div className="mt-4 p-4 bg-purple-900/20 rounded-xl border border-purple-500/30">
                                        <p className="text-purple-200 text-sm leading-relaxed">{tableExplanation}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default TableGallery
