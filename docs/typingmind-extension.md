# TypingMind Extension Implementation

## Overview

This document outlines how to create a TypingMind extension that integrates Perfect Prompt enhancement.

## Extension Architecture

TypingMind extensions run JavaScript code with full DOM access. We'll create an extension that:
1. Monitors the chat input field
2. Adds a "Perfect Prompt" button
3. Intercepts and enhances prompts before submission

## Implementation

### Extension Code

```javascript
// Perfect Prompt for TypingMind Extension
(function() {
  'use strict';
  
  // Configuration
  const OPENROUTER_API_KEY = 'sk-or-your-key-here'; // User should replace this
  const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
  const DEFAULT_MODEL = 'google/gemini-2.5-flash-preview-05-20';
  
  // System prompt for enhancement
  const SYSTEM_PROMPT = `You are a prompt enhancement assistant. Your ONLY job is to rewrite prompts to be clearer, more specific, and more effective.

CRITICAL RULES:
1. Return ONLY the enhanced prompt text - NO other text whatsoever
2. PRESERVE the original perspective (I/me/my stays as I/me/my, you stays as you, etc.)
3. NO explanations, NO prefixes, NO suffixes, NO introductions
4. Make prompts more actionable and specific`;

  // Enhance prompt function
  async function enhancePrompt(prompt) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://typingmind.com',
          'X-Title': 'Perfect Prompt for TypingMind'
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Perfect Prompt error:', error);
      alert('Failed to enhance prompt. Check console for details.');
      return prompt; // Return original on error
    }
  }

  // Create and inject the Perfect Prompt button
  function injectButton() {
    // Find the chat input area
    const chatInput = document.querySelector('[data-element-id="chat-input-text-area"]');
    if (!chatInput) return;

    // Check if button already exists
    if (document.querySelector('.perfect-prompt-button')) return;

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      position: absolute;
      right: 60px;
      bottom: 10px;
      z-index: 1000;
    `;

    // Create button
    const button = document.createElement('button');
    button.className = 'perfect-prompt-button';
    button.textContent = '✨ Perfect Prompt';
    button.style.cssText = `
      background: #4f46e5;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    `;

    // Button hover effect
    button.onmouseover = () => button.style.background = '#4338ca';
    button.onmouseout = () => button.style.background = '#4f46e5';

    // Button click handler
    button.onclick = async () => {
      const currentPrompt = chatInput.value;
      if (!currentPrompt.trim()) {
        alert('Please enter a prompt first');
        return;
      }

      // Show loading state
      button.disabled = true;
      button.textContent = '⏳ Enhancing...';

      try {
        const enhanced = await enhancePrompt(currentPrompt);
        
        // Update the input field
        chatInput.value = enhanced;
        
        // Trigger input event for TypingMind to recognize the change
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Show success state
        button.textContent = '✅ Enhanced!';
        setTimeout(() => {
          button.textContent = '✨ Perfect Prompt';
          button.disabled = false;
        }, 2000);
      } catch (error) {
        button.textContent = '❌ Error';
        setTimeout(() => {
          button.textContent = '✨ Perfect Prompt';
          button.disabled = false;
        }, 2000);
      }
    };

    buttonContainer.appendChild(button);
    
    // Find the parent container and inject button
    const inputParent = chatInput.parentElement;
    if (inputParent) {
      inputParent.style.position = 'relative';
      inputParent.appendChild(buttonContainer);
    }
  }

  // Observer to detect when chat input appears
  const observer = new MutationObserver(() => {
    injectButton();
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Initial injection attempt
  setTimeout(injectButton, 1000);

  // Keyboard shortcut (Ctrl/Cmd + E)
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      const button = document.querySelector('.perfect-prompt-button');
      if (button) button.click();
    }
  });

  console.log('Perfect Prompt for TypingMind loaded');
})();
```

## Installation Instructions

1. **Host the Extension Code**
   - Save the JavaScript code to a file (e.g., `perfect-prompt-typingmind.js`)
   - Host it on a public URL with CORS enabled (GitHub Gist, CDN, or your server)

2. **Configure in TypingMind**
   - Go to TypingMind settings
   - Navigate to Extensions section
   - Add new extension with your hosted JavaScript URL
   - Save and reload

3. **Update API Key**
   - Edit the extension code
   - Replace `'sk-or-your-key-here'` with your actual OpenRouter API key
   - Re-host the updated code

## Features

- **Visual Button**: Adds a "Perfect Prompt" button to the chat input
- **Keyboard Shortcut**: Press Ctrl/Cmd + E to enhance
- **Loading States**: Shows progress during enhancement
- **Error Handling**: Gracefully handles API failures
- **Auto-injection**: Detects when chat input appears

## Customization

### Change Models
Update the `DEFAULT_MODEL` constant to use different models:
```javascript
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324:free'; // Free alternative
```

### Modify Button Position
Adjust the `buttonContainer.style.cssText` to change button placement.

### Add Context Awareness
Extend the extension to capture conversation history from TypingMind's DOM and include it in the enhancement request.

## Security Notes

- API key is embedded in the extension (consider using a proxy server for production)
- Extension has full DOM access - review code carefully
- Consider implementing rate limiting to prevent API abuse