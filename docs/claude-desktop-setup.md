# Claude Desktop Setup Guide

## Installation

1. **Clone and build the MCP server:**
   ```bash
   git clone https://github.com/yourusername/perfect-prompt-mcp.git
   cd perfect-prompt-mcp
   npm install
   npm run build
   ```

2. **Get your OpenRouter API key:**
   - Visit https://openrouter.ai/keys
   - Create a new API key
   - Keep it secure

3. **Configure Claude Desktop:**
   
   Find your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

   Add the Perfect Prompt MCP server:
   ```json
   {
     "mcpServers": {
       "perfect-prompt": {
         "command": "node",
         "args": ["/absolute/path/to/perfect-prompt-mcp/dist/index.js"],
         "env": {
           "OPENROUTER_API_KEY": "sk-or-your-api-key-here"
         }
       }
     }
   }
   ```

4. **Restart Claude Desktop**

## Usage

Once installed, you can use the `enhance_prompt` tool in Claude:

```
Use the enhance_prompt tool to improve this prompt: "help me write better code"
```

With context:
```
Use the enhance_prompt tool with the following:
- prompt: "debug this error"
- context: "We're working on a React app with TypeScript. The error is about type mismatches in props."
```

With a specific model:
```
Use the enhance_prompt tool:
- prompt: "explain machine learning"
- model: "deepseek/deepseek-chat-v3-0324:free"
```

## Available Models

- `google/gemini-2.5-flash-preview-05-20` (default) - Best for contextual enhancement
- `deepseek/deepseek-chat-v3-0324:free` - Free alternative
- `anthropic/claude-3-haiku` - Fast and affordable
- `openai/gpt-4o-mini` - GPT-4 quality at lower cost

## Troubleshooting

### MCP server not appearing in Claude
1. Check the config file path is correct
2. Ensure the path to `index.js` is absolute
3. Check Claude Desktop logs for errors

### API key errors
1. Verify your OpenRouter API key is valid
2. Check you have credits in your OpenRouter account
3. Ensure the key starts with `sk-or-`

### Enhancement not working
1. Check the MCP server logs in Claude Desktop
2. Try a simple prompt first
3. Verify network connectivity