export declare class OpenRouterClient {
    private apiKey;
    private static readonly API_URL;
    private static readonly DEFAULT_MODEL;
    private model;
    private static readonly SYSTEM_PROMPT;
    private static readonly STRUCTURED_SYSTEM_PROMPT;
    constructor(apiKey: string, model?: string);
    enhancePrompt(prompt: string, conversationContext?: string): Promise<string>;
    private detectPromptStructure;
    private processThinkingModelResponse;
    private buildContextualPrompt;
    private cleanResponse;
    private makeRequest;
    private calculateMaxTokens;
    private sanitizeInput;
    private delay;
    validateApiKey(): Promise<boolean>;
}
//# sourceMappingURL=OpenRouterClient.d.ts.map