import { NextRequest, NextResponse } from 'next/server'

interface Citation {
    type: 'char_location' | 'page_location'
    cited_text: string
    document_index: number
    document_title: string
    start_char_index?: number
    end_char_index?: number
    start_page_number?: number
    end_page_number?: number
}

interface ContentBlock {
    type: 'text' | 'citation'
    text?: string
    citation?: Citation
}

export async function POST(request: NextRequest) {
    try {
        const { pdfBase64, question, documentTitle } = await request.json()

        const apiKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Anthropic API key not configured' },
                { status: 500 }
            )
        }

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
                            type: 'document',
                            source: {
                                type: 'base64',
                                media_type: 'application/pdf',
                                data: pdfBase64
                            },
                            title: documentTitle || 'document.pdf',
                            citations: { enabled: true }
                        },
                        {
                            type: 'text',
                            text: `You are analyzing a research paper. Answer the following question based on the document content.

IMPORTANT: Focus your answers on content from Results, Methods, and Discussion sections.
Prioritize data, findings, and methodology over Abstract summaries.

Question: ${question}

Provide a comprehensive answer with specific details from the document. Make sure to cite your sources from the document.`
                        }
                    ]
                }]
            })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            console.error('Anthropic API error:', JSON.stringify(errorData, null, 2))
            return NextResponse.json(
                { error: 'Anthropic API error', details: JSON.stringify(errorData) },
                { status: response.status }
            )
        }

        const result = await response.json()

        // Parse content blocks to extract text and citations
        // New format: text blocks have embedded citations arrays
        const contentBlocks: ContentBlock[] = []
        const citations: Citation[] = []

        for (const block of result.content) {
            if (block.type === 'text') {
                contentBlocks.push({
                    type: 'text',
                    text: block.text
                })
                // Check for embedded citations in text block
                if (block.citations && Array.isArray(block.citations)) {
                    for (const cite of block.citations) {
                        const citation: Citation = {
                            type: cite.type || (cite.start_page_number ? 'page_location' : 'char_location'),
                            cited_text: cite.cited_text,
                            document_index: cite.document_index,
                            document_title: cite.document_title,
                            start_char_index: cite.start_char_index,
                            end_char_index: cite.end_char_index,
                            start_page_number: cite.start_page_number,
                            end_page_number: cite.end_page_number
                        }
                        citations.push(citation)
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            contentBlocks,
            citations,
            rawContent: result.content
        })

    } catch (error) {
        console.error('Q&A with citations error:', error)
        return NextResponse.json(
            { error: 'Failed to process question', details: String(error) },
            { status: 500 }
        )
    }
}
