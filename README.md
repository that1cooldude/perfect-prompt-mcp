# PerfectPrompt MCP

A Model Context Protocol (MCP) server that provides AI-powered prompt enhancement for any MCP-compatible client.

## Overview

PerfectPrompt MCP allows you to enhance your prompts using AI models through a standardized protocol. It works with:
- Claude Desktop (via MCP)
- TypingMind (via plugin system)
- Any MCP-compatible application

## Features

- 🚀 **Universal Prompt Enhancement**: Works with any MCP client
- 🧠 **Multiple AI Models**: Gemini 2.5 Flash, DeepSeek v3, and more via OpenRouter
- 🔄 **Context-Aware Enhancement**: Optionally use conversation history
- 🛡️ **Secure**: API keys stored locally, never transmitted
- ⚡ **Fast**: Optimized for low-latency enhancement

## Installation

### For Claude Desktop

1. Clone this repository
2. Install dependencies: `npm install`
3. Add to Claude Desktop's MCP config:

```json
{
  "mcpServers": {
    "perfect-prompt": {
      "command": "node",
      "args": ["/path/to/perfect-prompt-mcp/dist/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### For TypingMind

Coming soon - TypingMind plugin implementation.

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Architecture

This MCP server exposes tools for prompt enhancement that can be called by any MCP client. The core enhancement logic is shared with the PerfectPrompt Chrome extension.

## License

MIT