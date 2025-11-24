
export const callGeminiApi = async (prompt: string, expectJson = false) => {
    const apiKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || ""
    const apiUrl = "https://api.anthropic.com/v1/messages"

    const payload = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [
            {
                role: "user",
                content: prompt
            }
        ]
    }

    try {
        let response: Response | undefined
        let retries = 0
        const maxRetries = 5
        let delay = 1000

        while (retries < maxRetries) {
            response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "anthropic-dangerous-direct-browser-access": "true"
                },
                body: JSON.stringify(payload),
            })

            if (response.ok) {
                break
            }

            if (response.status === 429 || response.status >= 500) {
                console.warn(`Anthropic API call failed with status ${response.status}. Retrying in ${delay / 1000}s...`)
                await new Promise((resolve) => setTimeout(resolve, delay))
                delay *= 2
                retries++
            } else {
                const statusCode = response.status
                const errorData = await response
                    .json()
                    .catch(() => ({ error: { message: `HTTP error! status: ${statusCode}` } }))
                console.error("API Error Data:", errorData)
                throw new Error(errorData.error?.message || `API request failed with status ${statusCode}`)
            }
        }

        if (!response || !response.ok) {
            throw new Error(`API request failed after ${maxRetries} retries.`)
        }

        const result = await response.json()

        if (!result.content || !result.content[0] || !result.content[0].text) {
            console.error("Invalid API response structure:", result)
            throw new Error("Invalid API response structure")
        }

        const textResponse = result.content[0].text

        if (expectJson) {
            try {
                // Try to extract JSON from the response
                const jsonMatch = textResponse.match(/\{[\s\S]*\}/)
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0])
                }
                return JSON.parse(textResponse)
            } catch {
                console.error("Failed to parse JSON response:", textResponse)
                throw new Error("AI returned invalid JSON.")
            }
        } else {
            return textResponse
        }
    } catch (error: unknown) {
        console.error("Anthropic API Call Error:", error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        throw new Error(`Anthropic AI Error: ${errorMessage}`)
    }
}

export const callElevenLabsTTS = async (textToSpeak: string) => {
    const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || ""
    const voiceId = "21m00Tcm4TlvDq8ikWAM" // Rachel - clear, professional voice
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": apiKey
            },
            body: JSON.stringify({
                text: textToSpeak,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        })

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: response.statusText }))
            console.error("ElevenLabs TTS Error:", err)
            throw new Error(`TTS API failed: ${err.detail || response.status}`)
        }

        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        return audioUrl
    } catch (error) {
        console.error("callElevenLabsTTS Error:", error)
        throw error
    }
}
