#!/usr/bin/env node
import express from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
        // Create a standalone remote MCP server
        this.setupRemoteMCPEndpoints();
        
        app.listen(PORT, () => {
          console.log(`Perfect Prompt MCP Server running on port ${PORT}`);
          console.log(`Remote MCP endpoint: http://localhost:${PORT}/sse`);
          console.log(`Health check: http://localhost:${PORT}/health`);
        });
      } else {
        // Local MCP with stdio transport
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Perfect Prompt MCP Server running on stdio");
      }
    }

    private setupRemoteMCPEndpoints(): void {
      // Health check
      app.get('/health', (req, res) => {
        res.json({ 
          status: 'ok',
          mode: 'standalone-remote-mcp',
          uptime: process.uptime(),
          endpoint: '/sse'
        });
      });

      // Server info for mcp-remote and Claude.ai
      app.get('/', (req, res) => {
        res.json({
          name: "perfect-prompt-mcp",
          vendor: "PerfectPrompt",
          version: "1.0.0",
          description: "AI-powered prompt enhancement via MCP",
          transport: "standalone",
          endpoint: "/sse",
          tools: ["enhance_prompt"]
        });
      });

      // SSE endpoint for mcp-remote compatibility
      app.get('/sse', (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        });

        // Send initial handshake
        res.write('data: {"jsonrpc":"2.0","method":"notifications/initialized"}\n\n');
        
        // Keep connection alive
        const keepAlive = setInterval(() => {
          res.write('data: {"jsonrpc":"2.0","method":"notifications/ping"}\n\n');
        }, 30000);

        req.on('close', () => {
          clearInterval(keepAlive);
        });
      });

      // Handle MCP requests
      app.post('/messages', async (req, res) => {
        try {
          const message = req.body;
          console.log('Received MCP message:', JSON.stringify(message, null, 2));

          if (message.method === 'tools/list') {
            res.json({
              jsonrpc: "2.0",
              id: message.id,
              result: {
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
                        },
                      },
                      required: ["prompt"],
                    },
                  },
                ],
              }
            });
          } else if (message.method === 'tools/call' && message.params?.name === 'enhance_prompt') {
            const result = await this.handleEnhancePrompt(message.params.arguments);
            res.json({
              jsonrpc: "2.0",
              id: message.id,
              result
            });
          } else {
            res.json({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32601,
                message: "Method not found"
              }
            });
          }
        } catch (error) {
          console.error('Error handling MCP message:', error);
          res.json({
            jsonrpc: "2.0",
            id: req.body.id,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal error'
            }
          });
        }
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