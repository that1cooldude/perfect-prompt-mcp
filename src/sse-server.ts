import express from 'express';
import { EventEmitter } from 'events';
import { OpenRouterClient } from './services/OpenRouterClient.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const eventBus = new EventEmitter();

app.use(express.json());

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface EnhancementRequest {
  prompt: string;
  context?: string;
  messages?: Message[];
  model?: string;
}

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
    const { prompt, context, messages, model = 'google/gemini-2.5-flash-preview-05-20' }: EnhancementRequest = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenRouter API key not configured' });
    }

    const openRouterClient = new OpenRouterClient(apiKey, model);

    // Build context from messages if provided
    let fullContext = context || '';
    if (messages && messages.length > 0) {
      const conversationContext = messages
        .slice(-6) // Last 6 messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n\n');
      fullContext = `Recent conversation:\n${conversationContext}${fullContext ? `\n\nAdditional context: ${fullContext}` : ''}`;
    }

    clients.forEach(client => {
      client.response.write(`data: ${JSON.stringify({ type: 'enhancement_started', prompt })}\n\n`);
    });

    const enhanced = await openRouterClient.enhancePrompt(prompt, fullContext);

    clients.forEach(client => {
      client.response.write(`data: ${JSON.stringify({ 
        type: 'enhancement_completed', 
        original: prompt,
        enhanced,
        model,
        timestamp: new Date().toISOString()
      })}\n\n`);
    });

    res.json({ 
      success: true, 
      enhanced,
      original: prompt,
      model
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
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`SSE server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Enhancement endpoint: POST http://localhost:${PORT}/enhance`);
});