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
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { OpenRouterClient } from "./services/OpenRouterClient.js";
import dotenv from 'dotenv';
import WebSocket, { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

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

// Custom WebSocket transport for MCP
class WebSocketMCPTransport implements Transport {
  private ws: WebSocket;
  private onMessageCallback?: (message: JSONRPCMessage) => void;
  private onCloseCallback?: () => void;
  private onErrorCallback?: (error: Error) => void;

  constructor(ws: WebSocket) {
    this.ws = ws;
    
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.onMessageCallback?.(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });

    this.ws.on('close', () => {
      this.onCloseCallback?.();
    });

    this.ws.on('error', (error) => {
      this.onErrorCallback?.(error);
    });
  }

  async start(): Promise<void> {
    // WebSocket is already connected
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket is not open');
    }
  }

  async close(): Promise<void> {
    this.ws.close();
  }

  onMessage(callback: (message: JSONRPCMessage) => void): void {
    this.onMessageCallback = callback;
  }

  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }
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
        // Setup WebSocket transport for Claude.ai
        const httpServer = createServer(app);
        this.setupWebSocketTransport(httpServer);
        
        httpServer.listen(PORT, () => {
          console.log(`Perfect Prompt MCP Server running on port ${PORT}`);
          console.log(`WebSocket endpoint: ws://localhost:${PORT}/mcp`);
          console.log(`Health check: http://localhost:${PORT}/health`);
        });
      } else {
        // Local MCP with stdio transport
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Perfect Prompt MCP Server running on stdio");
      }
    }

    private setupWebSocketTransport(httpServer: any): void {
      const wss = new WebSocketServer({ 
        server: httpServer,
        path: '/mcp'
      });

      wss.on('connection', (ws) => {
        console.log('New WebSocket connection established');
        
        // Create a custom transport for this WebSocket connection
        const transport = new WebSocketMCPTransport(ws);
        
        // Connect the MCP server to this transport
        this.server.connect(transport).catch(console.error);
        
        ws.on('close', () => {
          console.log('WebSocket connection closed');
        });

        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
        });
      });

      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({ 
          status: 'ok',
          mode: 'remote-mcp-websocket',
          uptime: process.uptime()
        });
      });

      app.get('/', (req, res) => {
        res.json({
          name: "perfect-prompt-mcp",
          vendor: "PerfectPrompt",
          version: "1.0.0",
          transport: "websocket",
          endpoint: "/mcp"
        });
      });
    }

    private setupSSETransport(): void {
      // Store transports by session ID
      const transports = new Map<string, SSEServerTransport>();

      // SSE endpoint - Claude.ai connects here first
      app.get('/sse', async (req, res) => {
        try {
          const transport = new SSEServerTransport('/messages', res);
          const sessionId = (transport as any).sessionId || Date.now().toString();
          
          transports.set(sessionId, transport);
          
          // Clean up on disconnect
          res.on('close', () => {
            transports.delete(sessionId);
          });

          // Connect the MCP server to this transport
          await this.server.connect(transport);
          
          console.log(`New SSE connection established: ${sessionId}`);
        } catch (error) {
          console.error('SSE connection error:', error);
          res.status(500).json({ error: 'Failed to establish SSE connection' });
        }
      });

      // Messages endpoint - Claude.ai sends requests here
      app.post('/messages', async (req, res) => {
        try {
          const sessionId = req.query.sessionId as string;
          const transport = transports.get(sessionId);
          
          if (!transport) {
            return res.status(400).json({ error: 'No transport found for sessionId' });
          }

          // Forward the message to the transport
          await transport.handlePostMessage(req, res);
        } catch (error) {
          console.error('Message handling error:', error);
          res.status(500).json({ error: 'Failed to handle message' });
        }
      });

      // Health check
      app.get('/health', (req, res) => {
        res.json({ 
          status: 'ok', 
          connections: transports.size,
          mode: 'remote-mcp-sse'
        });
      });
    }

    private setupAdditionalEndpoints(): void {
      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({ 
          status: 'ok', 
          mode: 'remote-mcp-sse',
          uptime: process.uptime()
        });
      });

      // MCP info endpoint for debugging
      app.get('/info', (req, res) => {
        res.json({
          name: "perfect-prompt-mcp",
          vendor: "PerfectPrompt", 
          version: "1.0.0",
          transport: "sse",
          endpoints: {
            sse: "/sse",
            message: "/message"
          }
        });
      });
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