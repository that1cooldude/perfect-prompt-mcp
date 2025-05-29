#!/usr/bin/env node
import express from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { OpenRouterClient } from "./services/OpenRouterClient.js";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const IS_MCP_MODE = process.argv.includes('--mcp');
const IS_REMOTE_MCP = process.argv.includes('--remote-mcp');

app.use(express.json());

// CORS headers for Claude.ai integration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Shared enhancement logic
const EnhancePromptSchema = z.object({
  prompt: z.string().describe("The prompt text to enhance"),
  context: z.string().optional().describe("Optional conversation or code context"),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional(),
  model: z.string().optional().default("google/gemini-2.5-flash-preview-05-20").describe("AI model to use for enhancement"),
});

async function enhancePrompt(args: z.infer<typeof EnhancePromptSchema>): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  const openRouterClient = new OpenRouterClient(apiKey, args.model);

  let fullContext = args.context || '';
  if (args.messages && args.messages.length > 0) {
    const conversationContext = args.messages
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');
    fullContext = `Recent conversation:\n${conversationContext}${fullContext ? `\n\nAdditional context: ${fullContext}` : ''}`;
  }

  return await openRouterClient.enhancePrompt(args.prompt, fullContext);
}

// MCP Mode (Local or Remote)
if (IS_MCP_MODE || IS_REMOTE_MCP) {
  class PerfectPromptMCPServer {
    private server: Server;

    constructor() {
      this.server = new Server(
        {
          name: "perfect-prompt-mcp",
          vendor: "PerfectPrompt",
          version: "1.0.0",
          description: "AI-powered prompt enhancement via MCP",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      this.setupHandlers();
    }

    private setupHandlers(): void {
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
                messages: {
                  type: "array",
                  description: "Recent conversation messages",
                  items: {
                    type: "object",
                    properties: {
                      role: { type: "string", enum: ["user", "assistant"] },
                      content: { type: "string" }
                    },
                    required: ["role", "content"]
                  }
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

      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === "enhance_prompt") {
          return await this.handleEnhancePrompt(request.params.arguments);
        }

        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      });
    }

    private async handleEnhancePrompt(args: unknown): Promise<{ content: any[] }> {
      try {
        const validatedArgs = EnhancePromptSchema.parse(args);
        const enhanced = await enhancePrompt(validatedArgs);

        return {
          content: [
            {
              type: "text",
              text: enhanced,
            },
          ],
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${error.errors.map(e => e.message).join(", ")}`
          );
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Enhancement failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    async run(): Promise<void> {
      if (IS_REMOTE_MCP) {
        // Remote MCP with HTTP endpoints
        this.setupHttpEndpoints();
        
        app.listen(PORT, () => {
          console.log(`Perfect Prompt MCP Server running on port ${PORT} with HTTP transport`);
          console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
        });
      } else {
        // Local MCP with stdio transport
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Perfect Prompt MCP Server running on stdio");
      }
    }

    private setupHttpEndpoints(): void {
      // OAuth authorization endpoint
      app.get('/mcp/authorize', (req, res) => {
        // Simple token-based auth for demo - in production use proper OAuth
        const token = Math.random().toString(36).substring(2);
        res.json({
          access_token: token,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'enhance_prompt'
        });
      });

      // Token validation middleware
      const validateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          // For now, allow unauthenticated access but log it
          console.log('No auth token provided, allowing access');
        }
        next();
      };

      // MCP tools endpoint
      app.get('/mcp/tools', validateToken, (req, res) => {
        res.json({
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
                  messages: {
                    type: "array",
                    description: "Recent conversation messages",
                    items: {
                      type: "object",
                      properties: {
                        role: { type: "string", enum: ["user", "assistant"] },
                        content: { type: "string" }
                      },
                      required: ["role", "content"]
                    }
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
        });
      });

      // MCP call tool endpoint
      app.post('/mcp/call', validateToken, async (req, res) => {
        try {
          const { name, arguments: args } = req.body;
          
          if (name === "enhance_prompt") {
            const result = await this.handleEnhancePrompt(args);
            res.json(result);
          } else {
            res.status(404).json({ error: `Unknown tool: ${name}` });
          }
        } catch (error) {
          res.status(500).json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      });

      // MCP server info endpoint
      app.get('/mcp', (req, res) => {
        res.json({
          name: "perfect-prompt-mcp",
          vendor: "PerfectPrompt",
          version: "1.0.0",
          description: "AI-powered prompt enhancement via MCP",
          authentication: {
            type: "oauth2",
            authorization_url: "/mcp/authorize",
            token_url: "/mcp/authorize"
          },
          endpoints: {
            tools: "/mcp/tools",
            call: "/mcp/call",
            authorize: "/mcp/authorize"
          }
        });
      });
    }
  }

  const server = new PerfectPromptMCPServer();
  server.run().catch(console.error);
} else {
  // Web Server Mode (SSE + REST)
  interface Client {
    id: string;
    response: express.Response;
  }

  const clients: Client[] = [];

  app.get('/sse', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const clientId = Date.now().toString();
    const newClient: Client = {
      id: clientId,
      response: res
    };

    clients.push(newClient);

    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    req.on('close', () => {
      const index = clients.findIndex(client => client.id === clientId);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });
  });

  app.post('/enhance', async (req, res) => {
    try {
      const validatedArgs = EnhancePromptSchema.parse(req.body);

      clients.forEach(client => {
        client.response.write(`data: ${JSON.stringify({ type: 'enhancement_started', prompt: validatedArgs.prompt })}\n\n`);
      });

      const enhanced = await enhancePrompt(validatedArgs);

      clients.forEach(client => {
        client.response.write(`data: ${JSON.stringify({ 
          type: 'enhancement_completed', 
          original: validatedArgs.prompt,
          enhanced,
          model: validatedArgs.model,
          timestamp: new Date().toISOString()
        })}\n\n`);
      });

      res.json({ 
        success: true, 
        enhanced,
        original: validatedArgs.prompt,
        model: validatedArgs.model
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      clients.forEach(client => {
        client.response.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
      });

      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      clients: clients.length,
      uptime: process.uptime(),
      mode: 'web-server'
    });
  });

  app.get('/', (req, res) => {
    res.json({
      service: 'Perfect Prompt Enhancement Service',
      endpoints: {
        sse: '/sse',
        enhance: '/enhance',
        health: '/health'
      },
      mcp: {
        info: 'Run with --mcp flag for MCP mode',
        tool: 'enhance_prompt'
      }
    });
  });

  app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
    console.log(`Enhancement endpoint: POST http://localhost:${PORT}/enhance`);
  });
}