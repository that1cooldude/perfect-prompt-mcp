# Deployment Instructions

Your code is now pushed to GitHub at: https://github.com/that1cooldude/perfect-prompt-mcp

## Deploy to Render (Free Tier)

1. Go to [Render Dashboard](https://dashboard.render.com/)

2. Click "New +" → "Web Service"

3. Connect your GitHub account if not already connected

4. Select the repository: `that1cooldude/perfect-prompt-mcp`

5. Fill in the following:
   - **Name**: `perfect-prompt-sse`
   - **Region**: Choose closest to you
   - **Branch**: `master`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:sse`

6. Click "Advanced" and add environment variable:
   - **Key**: `OPENROUTER_API_KEY`
   - **Value**: Your OpenRouter API key

7. Select **Free** instance type

8. Click "Create Web Service"

## After Deployment

Your SSE server will be available at:
```
https://perfect-prompt-sse.onrender.com
```

### Endpoints:
- `GET /sse` - Server-Sent Events stream
- `POST /enhance` - Enhance prompts
- `GET /health` - Health check

### Example Usage:
```bash
curl -X POST https://perfect-prompt-sse.onrender.com/enhance \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a function to calculate fibonacci",
    "messages": [
      {"role": "user", "content": "I need help with recursion"},
      {"role": "assistant", "content": "I can help you with that"}
    ]
  }'
```

### Note:
Free tier services spin down after 15 minutes of inactivity. First request after spin-down takes ~30 seconds.