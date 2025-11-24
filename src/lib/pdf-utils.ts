import {
    TextItem,
    TableRegion,
    StructuredTable,
    Figure,
    ExtractionDiagnostics,
    PDFPageProxy,
    PDFDocumentProxy,
    ImageDetail,
} from "@/types/pdf-qa"
import { callGeminiApi } from "./gemini-api"

// Define a type for PDF.js library
interface PDFJsLib {
    getDocument: (params: { data: Uint8Array }) => { promise: Promise<PDFDocumentProxy> }
    GlobalWorkerOptions?: { workerSrc: string }
    OPS?: Record<string, number>
}

declare global {
    interface Window {
        pdfjsLib: PDFJsLib
    }
}

export const loadPdfJs = async (setStatusMessage: (msg: string) => void): Promise<boolean> => {
    if (typeof window === "undefined") return false

    // Already loaded - check if getDocument function exists and is callable
    if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
        setStatusMessage("Ready to analyse your documents")
        return true
    }

    // Don't inject multiple <script> tags
    if (document.getElementById("pdfjs-script")) return false

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
            if (window.pdfjsLib?.GlobalWorkerOptions) {
                const base = src.replace(/\/pdf\.min\.js$/, "")
                const workerPath = `${base}/pdf.worker.min.js`

                try {
                    // Test if worker is accessible
                    const workerResponse = await fetch(workerPath, { method: "HEAD" })
                    if (workerResponse.ok) {
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath
                    } else {
                        // Try alternative worker path
                        const altWorkerPath = `${base}/pdf.worker.js`
                        const altResponse = await fetch(altWorkerPath, { method: "HEAD" })
                        if (altResponse.ok) {
                            window.pdfjsLib.GlobalWorkerOptions.workerSrc = altWorkerPath
                        } else {
                            console.warn("Worker files not accessible, PDF.js will use fallback mode")
                            // Let PDF.js handle worker setup automatically
                        }
                    }
                } catch (workerError) {
                    console.warn("Worker accessibility check failed:", workerError)
                    // Set worker path anyway, PDF.js will handle fallback
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath
                }
            }

            if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
                setStatusMessage("Ready to analyse your documents")
                console.log(`Successfully loaded PDF.js from: ${src}`)
                return true
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
    return false
}

export const extractFiguresFromPage = async (page: PDFPageProxy, pageNum: number): Promise<Figure[]> => {
    if (!window.pdfjsLib) return []

    const diagnostics: ExtractionDiagnostics = {
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
    const figures: Figure[] = []

    try {
        console.log(`Starting figure extraction for page ${pageNum}`)

        // Get operator list
        const ops = await page.getOperatorList()
        diagnostics.totalOperators = ops.fnArray?.length || 0

        if (!ops.fnArray || ops.fnArray.length === 0) {
            return figures
        }

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

        for (let i = 0; i < ops.fnArray.length; i++) {
            const opType = ops.fnArray[i]

            if (imageOperatorTypes.includes(opType)) {
                diagnostics.imageOperators++

                try {
                    const args = ops.argsArray[i]
                    const imageName = args?.[0] as string

                    if (!imageName || typeof imageName !== 'string') {
                        continue
                    }

                    // Try multiple ways to get the image object
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let image: any = null

                    try {
                        image = await page.objs.get(imageName)
                    } catch {
                        // Try direct access
                        if (page.objs.objs && page.objs.objs[imageName]) {
                            image = page.objs.objs[imageName]
                        }
                    }

                    if (!image) {
                        diagnostics.errors.push(`Could not retrieve image object: ${imageName}`)
                        continue
                    }

                    if (image && image.width && image.height) {
                        diagnostics.extractedImages++

                        const imageDetail: ImageDetail = {
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
                                } else {
                                    diagnostics.errors.push(`Could not convert image data to canvas: ${imageName}`)
                                }
                            } catch (conversionError: unknown) {
                                const errorMessage = conversionError instanceof Error ? conversionError.message : String(conversionError)
                                diagnostics.errors.push(`Error converting image ${imageName}: ${errorMessage}`)
                            }
                        } else {
                            diagnostics.errors.push(
                                `Filtered out ${imageName}: size ${image.width}x${image.height}, aspect ratio ${aspectRatio.toFixed(2)}`,
                            )
                        }
                    } else {
                        diagnostics.errors.push(`Invalid image object for ${imageName}: missing dimensions or data`)
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error)
                    diagnostics.errors.push(`Error processing image operator ${i}: ${errorMessage}`)
                }
            }
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        diagnostics.errors.push(`Page processing error: ${errorMessage}`)
    }

    diagnostics.processingTime = Date.now() - startTime
    return figures
}

export const findFigureCaptions = (pageTextContents: { str: string }[][], figures: Figure[]): Figure[] => {
    figures.forEach((figure, index) => {
        const pageTexts = pageTextContents[figure.pageNum]
        if (!pageTexts) return

        const pageText = pageTexts.map((item: { str: string }) => item.str).join(" ")
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
const extractTextWithPositions = async (page: PDFPageProxy): Promise<TextItem[]> => {
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1.0 })

    return textContent.items.map((item) => ({
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

    sorted.forEach((item) => {
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
    const positions = row.map((item) => item.x)

    // Cluster nearby X positions
    const clusters: number[][] = []

    positions.forEach((pos) => {
        const existingCluster = clusters.find((cluster) => cluster.some((p) => Math.abs(p - pos) < tolerance))

        if (existingCluster) {
            existingCluster.push(pos)
        } else {
            clusters.push([pos])
        }
    })

    // Return average of each cluster
    return clusters.map((cluster) => cluster.reduce((sum, val) => sum + val, 0) / cluster.length).sort((a, b) => a - b)
}

// Step 4: Find Table Regions
const alignsWithColumns = (positions: number[], tableColumns: number[], tolerance = 15): boolean => {
    // Check if at least 70% of positions align with existing columns
    const aligned = positions.filter((pos) => tableColumns.some((col) => Math.abs(pos - col) < tolerance))
    return aligned.length >= positions.length * 0.7
}

const detectTableRegions = (rows: TextItem[][]): TableRegion[] => {
    const tableRegions: TableRegion[] = []
    let currentTable: TableRegion | null = null

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex]
        const columnPositions = detectColumnPositions(row)

        // Check if row is part of a table
        const hasMultipleColumns = columnPositions.length >= 3
        const alignsWithTable = currentTable && alignsWithColumns(columnPositions, currentTable.columnPositions)

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
    }

    // Don't forget the last table
    const lastTable = currentTable
    if (lastTable && lastTable.rows.length >= 2) {
        tableRegions.push(lastTable)
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
    const xs = items.map((i) => i.x)
    const ys = items.map((i) => i.y)
    const rights = items.map((i) => i.x + i.width)
    const bottoms = items.map((i) => i.y + i.height)

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

    rows.forEach((row) => {
        const gridRow: string[] = new Array(columnPositions.length).fill("")

        row.forEach((item: TextItem) => {
            // Find which column this item belongs to
            const colIndex = findClosestColumn(item.x, columnPositions)

            // Concatenate text if multiple items in same cell
            gridRow[colIndex] = (gridRow[colIndex] + " " + item.text).trim()
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
export const extractTablesFromPage = async (page: PDFPageProxy, pageNum: number): Promise<StructuredTable[]> => {
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
            extractionMethod: "geometric_detection",
        }
    })

    return tables
}

// AI Enhancement (Method B)
interface AIEnhancementResponse {
    title?: string
    caption?: string | null
    correctedHeaders?: string[] | null
}

const enhanceTableWithAI = async (table: StructuredTable, pageText: string): Promise<StructuredTable> => {
    const prompt = `This table has ${table.rows.length} rows and ${table.headers.length} columns.
Headers: ${table.headers.join(", ")}
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
        const response = await callGeminiApi(prompt, true) as AIEnhancementResponse

        return {
            ...table,
            title: response.title || `Table ${table.id}`,
            caption: response.caption || undefined,
            headers: response.correctedHeaders || table.headers,
            aiEnhanced: true,
        }
    } catch (error) {
        console.warn("AI enhancement failed:", error)
        return {
            ...table,
            title: `Table ${table.id}`, // Provide a fallback title
            aiEnhanced: false,
        }
    }
}

// New Table Generation (Method C)
const generateHTMLTable = (table: StructuredTable) => {
    let html = '<table class="extracted-table">'

    // Headers
    if (table.headers && table.headers.length > 0) {
        html += "<thead><tr>"
        table.headers.forEach((header: string) => {
            html += `<th>${header}</th>`
        })
        html += "</tr></thead>"
    }

    // Body
    html += "<tbody>"
    table.rows.forEach((row: string[]) => {
        html += "<tr>"
        row.forEach((cell: string) => {
            html += `<td>${cell}</td>`
        })
        html += "</tr>"
    })
    html += "</tbody></table>"

    return html
}

// New main extraction orchestrator
export const extractTablesFromDocument = async (
    pdfDoc: PDFDocumentProxy,
    allPageTexts: { str: string }[][],
    setStatusMessage: (msg: string) => void,
): Promise<StructuredTable[]> => {
    const allTables: StructuredTable[] = []

    try {
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            setStatusMessage(`Extracting tables from page ${i}...`)
            const page = await pdfDoc.getPage(i)
            const pageText = allPageTexts[i]?.map((item: { str: string }) => item.str).join(" ") || ""

            // 1. Geometric detection
            const geometricTables = await extractTablesFromPage(page, i)

            // 2. AI Enhancement
            for (const table of geometricTables) {
                const enhancedTable = await enhanceTableWithAI(table, pageText)
                allTables.push({
                    ...enhancedTable,
                    htmlTable: generateHTMLTable(enhancedTable), // Generate HTML after enhancement
                })
            }
        }
    } catch (error) {
        console.error("Error extracting tables:", error)
        setStatusMessage("Error extracting tables.")
    }
    return allTables
}

export const renderPage = async (
    pdf: PDFDocumentProxy,
    pageNum: number,
    canvas: HTMLCanvasElement,
    setStatusMessage: (msg: string) => void,
) => {
    if (!pdf || !canvas) return
    const context = canvas.getContext("2d")
    if (!context) {
        console.warn("Canvas context not ready yet, retrying...")
        // try again on next frame
        requestAnimationFrame(() => renderPage(pdf, pageNum, canvas, setStatusMessage))
        return
    }
    try {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 2.0 })

        canvas.height = viewport.height
        canvas.width = viewport.width

        // Clear canvas first
        context.clearRect(0, 0, canvas.width, canvas.height)

        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        }

        await page.render(renderContext).promise
        console.log(`Successfully rendered page ${pageNum}`)
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error("Error rendering page:", error)
        setStatusMessage(`Error rendering page ${pageNum}: ${errorMessage}`)
    }
}
