import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const { pdfBase64, documentTitle } = await request.json()

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
                            text: `Analyze this research document using the PICOTT framework.

IMPORTANT: Extract information primarily from Methods, Results, and Discussion sections.
Avoid using Abstract summaries - look for detailed data in the main content.
Prioritize specific numbers, statistics, and detailed descriptions over general statements.

For each PICOTT component, provide a clear summary and cite the specific text from the document:

1. **Population/Problem**: Target population or research problem being studied
2. **Intervention**: Treatment, method, or intervention being studied
3. **Comparison**: Control group or alternative being compared
4. **Outcome**: Results or outcomes being measured
5. **Time**: Study duration or timeline
6. **Type of Study**: Research design (RCT, cohort, case-control, etc.)
7. **Inclusion Criteria**: Who was included in the study
8. **Exclusion Criteria**: Who was excluded from the study

Format your response with clear headers for each section. Make sure to cite specific passages from the document that support each finding.`
                        }
                    ]
                }]
            })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            return NextResponse.json(
                { error: 'Anthropic API error', details: errorData },
                { status: response.status }
            )
        }

        const result = await response.json()

        // Parse content blocks to extract text and citations
        let fullText = ''
        const citations: Array<{
            cited_text: string
            start_page_number?: number
            end_page_number?: number
        }> = []

        // New format: citations are embedded in text blocks
        for (const block of result.content) {
            if (block.type === 'text') {
                fullText += block.text
                // Extract citations from embedded array
                if (block.citations && Array.isArray(block.citations)) {
                    for (const cite of block.citations) {
                        citations.push({
                            cited_text: cite.cited_text,
                            start_page_number: cite.start_page_number,
                            end_page_number: cite.end_page_number
                        })
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            summary: fullText,
            citations,
            rawContent: result.content
        })

    } catch (error) {
        console.error('PICOTT with citations error:', error)
        return NextResponse.json(
            { error: 'Failed to generate PICOTT summary', details: String(error) },
            { status: 500 }
        )
    }
}
