#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { OpenRouterClient } from "./services/OpenRouterClient.js";
// Tool schemas
const EnhancePromptSchema = z.object({
    prompt: z.string().describe("The prompt text to enhance"),
    context: z.string().optional().describe("Optional conversation or code context"),
    model: z.string().optional().default("google/gemini-2.5-flash-preview-05-20").describe("AI model to use for enhancement"),
});
class PerfectPromptMCPServer {
    server;
    openRouterClient = null;
    constructor() {
        this.server = new Server({
            name: "perfect-prompt-mcp",
            vendor: "PerfectPrompt",
            version: "1.0.0",
            description: "AI-powered prompt enhancement via MCP",
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
    }
    setupHandlers() {
        // Initialize OpenRouter client with API key from environment
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            console.error("Warning: OPENROUTER_API_KEY not set. Enhancement will fail.");
        }
        else {
            this.openRouterClient = new OpenRouterClient(apiKey);
        }
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "enhance_prompt",
                    description: "Enhance a prompt to be clearer, more specific, and more effective using AI",
                    inputSchema: {
                        type: "object",
                        properties: {
                            prompt: {
                                type: "string",
                                description: "The prompt text to enhance",
                            },
                            context: {
                                type: "string",
                                description: "Optional conversation or code context",
                            },
                            model: {
                                type: "string",
                                description: "AI model to use (default: google/gemini-2.5-flash-preview-05-20)",
                                enum: [
                                    "google/gemini-2.5-flash-preview-05-20",
                                    "deepseek/deepseek-chat-v3-0324:free",
                                    "anthropic/claude-3-haiku",
                                    "openai/gpt-4o-mini",
                                ],
                            },
                        },
                        required: ["prompt"],
                    },
                },
            ],
        }));
        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name === "enhance_prompt") {
                return await this.handleEnhancePrompt(request.params.arguments);
            }
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        });
    }
    async handleEnhancePrompt(args) {
        try {
            // Validate arguments
            const validatedArgs = EnhancePromptSchema.parse(args);
            if (!this.openRouterClient) {
                throw new McpError(ErrorCode.InternalError, "OpenRouter client not initialized. Please set OPENROUTER_API_KEY environment variable.");
            }
            // Update model if specified
            if (validatedArgs.model) {
                this.openRouterClient = new OpenRouterClient(process.env.OPENROUTER_API_KEY, validatedArgs.model);
            }
            // Enhance the prompt
            const enhanced = await this.openRouterClient.enhancePrompt(validatedArgs.prompt, validatedArgs.context);
            return {
                content: [
                    {
                        type: "text",
                        text: enhanced,
                    },
                ],
            };
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(", ")}`);
            }
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(ErrorCode.InternalError, `Enhancement failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Perfect Prompt MCP Server running on stdio");
    }
}
// Start the server
const server = new PerfectPromptMCPServer();
server.run().catch(console.error);
//# sourceMappingURL=index.js.map