# SSE Server Integration Guide

## Your SSE Endpoints (after deployment)

Once deployed to Render, your SSE server will be available at:
```
https://[your-app-name].onrender.com
```

### Available Endpoints:

1. **SSE Stream** (Server-Sent Events)
   ```
   GET https://[your-app-name].onrender.com/sse
   ```
   - Real-time event stream
   - Sends enhancement progress updates
   - Maintains persistent connection

2. **Enhancement API**
   ```
   POST https://[your-app-name].onrender.com/enhance
   ```
   - Request body:
   ```json
   {
     "prompt": "your prompt text",
     "messages": [
       {"role": "user", "content": "previous message"},
       {"role": "assistant", "content": "previous response"}
     ],
     "model": "google/gemini-2.5-flash-preview-05-20"
   }
   ```

3. **Health Check**
   ```
   GET https://[your-app-name].onrender.com/health
   ```

## Integration Example for Web Claude

```javascript
// Connect to SSE
const eventSource = new EventSource('https://[your-app-name].onrender.com/sse');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('SSE Event:', data);
  
  switch(data.type) {
    case 'connected':
      console.log('Connected with ID:', data.clientId);
      break;
    case 'enhancement_started':
      console.log('Processing:', data.prompt);
      break;
    case 'enhancement_completed':
      console.log('Enhanced:', data.enhanced);
      break;
  }
};

// Enhance a prompt
async function enhancePrompt(prompt, messages = []) {
  const response = await fetch('https://[your-app-name].onrender.com/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, messages })
  });
  
  return response.json();
}
```

## Testing Your Deployment

After deployment, test your SSE server:

```bash
# Test SSE connection
curl -N https://[your-app-name].onrender.com/sse

# Test enhancement
curl -X POST https://[your-app-name].onrender.com/enhance \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test prompt"}'

# Check health
curl https://[your-app-name].onrender.com/health
```

## Important Notes

1. **Free Tier Limitations**: 
   - Service spins down after 15 mins of inactivity
   - First request after spin-down takes ~30 seconds
   - 750 hours/month free

2. **CORS**: 
   - Currently allows all origins (*)
   - Update `src/sse-server.ts` to restrict origins if needed

3. **API Key**: 
   - Set `OPENROUTER_API_KEY` in Render environment variables
   - Never commit API keys to GitHub