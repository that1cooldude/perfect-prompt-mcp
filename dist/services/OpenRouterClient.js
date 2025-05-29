// Adapted from PerfectPrompt Chrome Extension
// This is a standalone implementation for the MCP server
export class OpenRouterClient {
    apiKey;
    static API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    static DEFAULT_MODEL = 'google/gemini-2.5-flash-preview-05-20';
    model;
    static SYSTEM_PROMPT = `You are a prompt enhancement assistant. Your ONLY job is to rewrite prompts to be clearer, more specific, and more effective.

CRITICAL RULES:
1. Return ONLY the enhanced prompt text - NO other text whatsoever
2. PRESERVE the original perspective (I/me/my stays as I/me/my, you stays as you, etc.)
3. NO explanations, NO prefixes, NO suffixes, NO introductions
4. NO phrases like "Here's", "Enhanced", "Improved", "Better version", etc.
5. NO markdown formatting unless the original had it
6. Start your response immediately with the enhanced prompt
7. Keep the same voice, tone, and perspective as the original
8. Make prompts more actionable and specific

EXAMPLES:

Input: "help me evaluate why I am getting distracted at work"
Output: "Help me conduct a comprehensive analysis of the specific factors causing workplace distractions in my daily routine, including environmental, technological, psychological, and organizational elements that may be impacting my focus and productivity"

Input: "write a story about a robot"
Output: "Write a compelling science fiction story about a sentient robot who develops consciousness in a near-future manufacturing facility, exploring themes of identity, purpose, and the nature of awareness as it navigates relationships with humans and other machines"

Input: "explain quantum computing"
Output: "Explain quantum computing in accessible terms, covering the fundamental principles of superposition and entanglement, how qubits differ from classical bits, current practical applications, major technical challenges, and potential future breakthroughs that could transform computing"`;
    static STRUCTURED_SYSTEM_PROMPT = `You are a prompt enhancement assistant. Your ONLY job is to rewrite prompts while preserving their exact structure and format.

CRITICAL RULES:
1. Return ONLY the enhanced prompt text - NO other text whatsoever
2. PRESERVE the original perspective (I/me/my stays as I/me/my, you stays as you)
3. NO explanations, NO prefixes, NO suffixes, NO introductions
4. NO phrases like "Here's", "Enhanced", "Improved", "Better version", etc.
5. Preserve the EXACT format (XML, JSON, Markdown, role-based structure, etc.)
6. Start your response immediately with the enhanced prompt
7. Keep the same voice, tone, and perspective as the original
8. Enhance ONLY the content within the structure, never modify the structure itself`;
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        if (!apiKey) {
            throw new Error('API key is required');
        }
        this.model = model || OpenRouterClient.DEFAULT_MODEL;
    }
    async enhancePrompt(prompt, conversationContext) {
        const sanitizedPrompt = this.sanitizeInput(prompt);
        const structure = this.detectPromptStructure(sanitizedPrompt);
        try {
            let response = await this.makeRequest(sanitizedPrompt, structure, conversationContext);
            if (!response.ok) {
                if (response.status === 429) {
                    // Handle rate limiting
                    const retryAfter = response.headers?.get?.('Retry-After');
                    if (retryAfter) {
                        await this.delay(parseInt(retryAfter) * 1000);
                        response = await this.makeRequest(sanitizedPrompt, structure, conversationContext);
                        if (!response.ok) {
                            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                        }
                    }
                    else {
                        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                    }
                }
                else {
                    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                }
            }
            const data = await response.json();
            if (!data.choices || data.choices.length === 0) {
                throw new Error('No response from API');
            }
            const enhancedContent = data.choices[0].message.content;
            // Handle thinking model responses
            const processed = this.processThinkingModelResponse(enhancedContent);
            // Clean up any potential unwanted prefixes/suffixes
            return this.cleanResponse(processed);
        }
        catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Unknown error occurred');
        }
    }
    detectPromptStructure(prompt) {
        // Check for XML structure
        if (/<\w+>[\s\S]*<\/\w+>/.test(prompt)) {
            return { type: 'xml', preserveFormat: true };
        }
        // Check for JSON structure
        try {
            JSON.parse(prompt);
            return { type: 'json', preserveFormat: true };
        }
        catch {
            // Not JSON
        }
        // Check for Markdown structure
        if (/^#+ .+$/m.test(prompt) || /^[-*] .+$/m.test(prompt)) {
            return { type: 'markdown', preserveFormat: true };
        }
        // Check for role-based structure
        if (/^(You are|System:|User:|Assistant:)/im.test(prompt)) {
            return { type: 'role-based', preserveFormat: true };
        }
        return { type: 'plain', preserveFormat: false };
    }
    processThinkingModelResponse(content) {
        // Remove thinking tags and their content
        const thinkingPattern = /<thinking>[\s\S]*?<\/thinking>/g;
        if (thinkingPattern.test(content)) {
            let processed = content.replace(thinkingPattern, '');
            processed = processed.trim();
            processed = processed.replace(/\n{3,}/g, '\n\n');
            return processed;
        }
        return content;
    }
    buildContextualPrompt(conversationContext) {
        return `

🔍 CONTEXTUAL ENHANCEMENT MODE ACTIVATED

You are now operating in contextual enhancement mode. Use the conversation history below to dramatically improve the prompt's specificity, relevance, and effectiveness.

CONTEXTUAL ENHANCEMENT RULES:
1. **Domain Expertise**: Identify the specific domain/field from the conversation and enhance the prompt with domain-specific terminology
2. **Technical Consistency**: Maintain consistency with any technical terms, variable names, frameworks, or tools mentioned
3. **Progress Awareness**: Understand where the user is in their journey
4. **Context Patterns**: Recognize conversation patterns (debugging, learning, creative, technical)
5. **Relationship Building**: Reference previous solutions or approaches that worked well
6. **Scope Refinement**: Use conversation context to narrow or expand the prompt scope appropriately

CONVERSATION CONTEXT:
${conversationContext}

Based on this conversation history, enhance the user's prompt to be more specific, contextually relevant, and aligned with their ongoing work.`;
    }
    cleanResponse(content) {
        // Remove common unwanted prefixes
        const unwantedPrefixes = [
            /^Here\s+is\s+an?\s+enhanced\s+prompt:?\s*/i,
            /^Here\s+is\s+the\s+enhanced\s+prompt:?\s*/i,
            /^Here's\s+the\s+enhanced\s+prompt:?\s*/i,
            /^Enhanced\s+version:?\s*/i,
            /^Enhanced\s+prompt:?\s*/i,
            /^Improved\s+prompt:?\s*/i,
            /^```[\w]*\s*/,
            /^\*\*Enhanced\s+Prompt:?\*\*\s*/i,
        ];
        const unwantedSuffixes = [
            /\s*```\s*$/,
            /\s*This\s+enhanced\s+prompt\s+is\s+more\s+specific\s+and\s+detailed\.?\s*$/i,
            /\s*Hope\s+this\s+helps!?\s*$/i,
        ];
        let cleaned = content.trim();
        // Remove unwanted prefixes
        for (let i = 0; i < 3; i++) {
            for (const prefix of unwantedPrefixes) {
                cleaned = cleaned.replace(prefix, '');
            }
            cleaned = cleaned.trim();
        }
        // Remove unwanted suffixes
        for (const suffix of unwantedSuffixes) {
            cleaned = cleaned.replace(suffix, '');
        }
        return cleaned.trim() || content;
    }
    async makeRequest(prompt, structure, conversationContext) {
        let systemPrompt = structure.preserveFormat
            ? OpenRouterClient.STRUCTURED_SYSTEM_PROMPT
            : OpenRouterClient.SYSTEM_PROMPT;
        if (conversationContext) {
            systemPrompt += this.buildContextualPrompt(conversationContext);
        }
        const requestBody = {
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: this.calculateMaxTokens(prompt),
            top_p: 0.9,
            frequency_penalty: 0.1,
            presence_penalty: 0.1
        };
        return fetch(OpenRouterClient.API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/yourusername/perfect-prompt-mcp',
                'X-Title': 'Perfect Prompt MCP Server'
            },
            body: JSON.stringify(requestBody)
        });
    }
    calculateMaxTokens(prompt) {
        const promptTokens = Math.ceil(prompt.length / 4);
        const estimatedOutputTokens = promptTokens * 3;
        return Math.min(Math.max(500, estimatedOutputTokens), 4000);
    }
    sanitizeInput(input) {
        if (this.detectPromptStructure(input).type === 'xml') {
            return input.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        }
        return input.replace(/<[^>]*>/g, '');
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async validateApiKey() {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=OpenRouterClient.js.map