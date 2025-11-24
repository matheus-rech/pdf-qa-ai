import { NextRequest, NextResponse } from 'next/server'

// pdf-parse types
interface PDFParseResult {
    numpages: number
    numrender: number
    info: any
    metadata: any
    text: string
    version: string
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('pdf') as File
        const pageImages = formData.get('pageImages') as string // Base64 images JSON

        if (!file) {
            return NextResponse.json(
                { error: 'No PDF file provided' },
                { status: 400 }
            )
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Dynamic import for pdf-parse (CommonJS module)
        const pdfParseModule = await import('pdf-parse')
        // Handle different export formats
        const pdfParse = typeof pdfParseModule.default === 'function'
            ? pdfParseModule.default
            : (pdfParseModule.default?.default || pdfParseModule)

        // Parse PDF
        const data: PDFParseResult = await pdfParse(buffer)

        // Extract tables using text analysis
        let tables = extractTablesFromText(data.text, data.numpages)

        // If page images provided, use Claude vision to validate and enhance tables
        if (pageImages && tables.length > 0) {
            const images = JSON.parse(pageImages) as string[]
            tables = await enhanceTablesWithVision(tables, images)
        }

        return NextResponse.json({
            success: true,
            tables,
            pageCount: data.numpages,
            fullText: data.text
        })

    } catch (error) {
        console.error('PDF parsing error:', error)
        return NextResponse.json(
            { error: 'Failed to parse PDF', details: String(error) },
            { status: 500 }
        )
    }
}

async function enhanceTablesWithVision(
    tables: ExtractedTable[],
    pageImages: string[]
): Promise<ExtractedTable[]> {
    const apiKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY
    if (!apiKey) return tables

    const enhancedTables: ExtractedTable[] = []

    for (const table of tables) {
        const pageIndex = table.pageNum - 1
        const pageImage = pageImages[pageIndex]

        if (!pageImage) {
            enhancedTables.push(table)
            continue
        }

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 4096,
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: 'image/png',
                                    data: pageImage.replace(/^data:image\/\w+;base64,/, '')
                                }
                            },
                            {
                                type: 'text',
                                text: `You are analyzing a scientific/research PDF page to extract tables.

IMPORTANT: Focus ONLY on tables from Results, Methods, and Discussion sections.
IGNORE any tables or data from the Abstract section.

I extracted this table from the PDF using text parsing:

Title: ${table.title || 'Unknown'}
Headers: ${JSON.stringify(table.headers)}
Rows: ${JSON.stringify(table.rows.slice(0, 5))}${table.rows.length > 5 ? `... (${table.rows.length - 5} more rows)` : ''}

Please analyze the image and:
1. Verify if this is a real data table (not from Abstract)
2. Check accuracy of headers and rows
3. Correct any extraction errors

Return a JSON object with:
{
  "isAccurate": boolean,
  "isFromAbstract": boolean,
  "correctedHeaders": string[],
  "correctedRows": string[][],
  "title": string,
  "notes": string,
  "boundingBox": {
    "x": number (0-100, percentage from left),
    "y": number (0-100, percentage from top),
    "width": number (0-100, percentage of page width),
    "height": number (0-100, percentage of page height)
  }
}

If isFromAbstract is true, return empty arrays for headers and rows.
If the extraction looks correct, set isAccurate to true and return the same data.
If there are errors, provide the corrected version based on what you see in the image.
Estimate the bounding box coordinates as percentages of the page dimensions.
Only return the JSON object, no other text.`
                            }
                        ]
                    }]
                })
            })

            if (response.ok) {
                const result = await response.json()
                const content = result.content[0]?.text || ''

                // Parse Claude's response
                const jsonMatch = content.match(/\{[\s\S]*\}/)
                if (jsonMatch) {
                    const validation = JSON.parse(jsonMatch[0])

                    // Skip tables from Abstract section
                    if (validation.isFromAbstract) {
                        console.log(`Skipping table from Abstract: ${table.title}`)
                        continue
                    }

                    enhancedTables.push({
                        ...table,
                        headers: validation.correctedHeaders || table.headers,
                        rows: validation.correctedRows || table.rows,
                        title: validation.title || table.title,
                        aiValidated: true,
                        aiNotes: validation.notes,
                        boundingBox: validation.boundingBox
                    } as ExtractedTable)
                } else {
                    enhancedTables.push(table)
                }
            } else {
                enhancedTables.push(table)
            }
        } catch (error) {
            console.error('Vision validation error:', error)
            enhancedTables.push(table)
        }
    }

    return enhancedTables
}

interface ExtractedTable {
    id: string
    pageNum: number
    headers: string[]
    rows: string[][]
    title?: string
    aiValidated?: boolean
    aiNotes?: string
    boundingBox?: {
        x: number
        y: number
        width: number
        height: number
    }
}

function extractTablesFromText(text: string, numPages: number): ExtractedTable[] {
    const tables: ExtractedTable[] = []
    const lines = text.split('\n').filter(line => line.trim())

    let currentTable: string[][] = []
    let tableStartIndex = -1
    let tableId = 0

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()

        // Detect potential table rows (multiple columns separated by whitespace)
        const columns = line.split(/\s{2,}/).filter(col => col.trim())

        // If line has multiple columns, it might be a table row
        if (columns.length >= 2) {
            if (tableStartIndex === -1) {
                tableStartIndex = i
            }
            currentTable.push(columns)
        } else {
            // End of potential table
            if (currentTable.length >= 3) {
                // We have a table with at least 3 rows
                const headers = currentTable[0]
                const rows = currentTable.slice(1)

                // Estimate page number based on position in text
                const estimatedPage = Math.ceil((tableStartIndex / lines.length) * numPages) || 1

                tables.push({
                    id: `table-${tableId++}`,
                    pageNum: estimatedPage,
                    headers,
                    rows,
                    title: findTableTitle(lines, tableStartIndex)
                })
            }
            currentTable = []
            tableStartIndex = -1
        }
    }

    // Check for table at end of document
    if (currentTable.length >= 3) {
        const headers = currentTable[0]
        const rows = currentTable.slice(1)
        const estimatedPage = Math.ceil((tableStartIndex / lines.length) * numPages) || 1

        tables.push({
            id: `table-${tableId++}`,
            pageNum: estimatedPage,
            headers,
            rows,
            title: findTableTitle(lines, tableStartIndex)
        })
    }

    return tables
}

function findTableTitle(lines: string[], tableStartIndex: number): string | undefined {
    // Look for table title in the 3 lines before the table
    for (let i = tableStartIndex - 1; i >= Math.max(0, tableStartIndex - 3); i--) {
        const line = lines[i].trim()
        if (line.toLowerCase().includes('table') ||
            line.match(/^(Table|TABLE)\s*\d+/)) {
            return line
        }
    }
    return undefined
}
