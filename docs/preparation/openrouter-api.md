# OpenRouter API Documentation

## Executive Summary

OpenRouter provides a unified API for accessing hundreds of AI models through a single interface. It's OpenAI-compatible, making it a drop-in replacement with additional features like automatic fallback, cost tracking, and transparent pricing. For the Bill Bot project, OpenRouter enables flexible model selection while maintaining consistent API patterns.

## Technology Overview

OpenRouter normalizes API schemas across different model providers, allowing seamless switching between models without code changes. The service provides:

- Access to 100+ AI models from various providers
- OpenAI-compatible API structure
- Transparent pricing and usage tracking
- Automatic failover capabilities
- Real-time streaming support

## API Setup and Authentication

### Authentication

OpenRouter uses Bearer token authentication:

```javascript
import { OpenAI } from 'openai';

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

### Required Headers

For tracking and attribution:

```javascript
const headers = {
  "Authorization": "Bearer " + process.env.OPENROUTER_API_KEY,
  "HTTP-Referer": "https://your-site.com", // Optional, for app attribution
  "X-Title": "Your App Name", // Optional, for app attribution
};
```

## Chat Completions

### Basic Request

```javascript
const completion = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4",
  messages: [
    {
      role: "user",
      content: "What is the meaning of life?"
    }
  ]
});

console.log(completion.choices[0].message.content);
```

### Direct API Request

```javascript
import axios from 'axios';

const response = await axios.post(
  'https://openrouter.ai/api/v1/chat/completions',
  {
    model: "anthropic/claude-sonnet-4",
    messages: [
      {
        role: "user",
        content: "What is the meaning of life?"
      }
    ]
  },
  {
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    }
  }
);
```

## Streaming Responses

### Enable Streaming

Set `stream: true` in your request for real-time token delivery:

```javascript
const stream = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4",
  messages: [{ role: "user", content: "Tell me a story" }],
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  }
}
```

### TypeScript Streaming Implementation

```typescript
interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
}

const handleStream = async (messages: Array<{ role: string; content: string }>) => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages,
      stream: true,
    }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim() !== '');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed: StreamChunk = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content;
          if (content) {
            // Handle streaming content
            console.log(content);
          }
        } catch (error) {
          // Handle parsing errors or skip comments
        }
      }
    }
  }
};
```

## Error Handling and Retry Logic

```typescript
class OpenRouterClient {
  private client: OpenAI;
  
  constructor(apiKey: string) {
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });
  }

  async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    options: {
      model?: string;
      maxRetries?: number;
      temperature?: number;
      stream?: boolean;
    } = {}
  ) {
    const {
      model = 'anthropic/claude-sonnet-4',
      maxRetries = 3,
      temperature = 0.7,
      stream = false
    } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.chat.completions.create({
          model,
          messages,
          temperature,
          stream,
        });
      } catch (error: any) {
        if (attempt === maxRetries) throw error;
        
        // Handle rate limiting
        if (error.status === 429) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
  }
}
```

## Cost Tracking and Usage

### Get Generation Stats

```javascript
// After a request, use the returned ID to query stats
const completion = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4",
  messages: [{ role: "user", content: "Hello" }]
});

const generationId = completion.id;

// Query for cost and token usage
const statsResponse = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
  }
});

const stats = await statsResponse.json();
console.log('Cost:', stats.total_cost);
console.log('Tokens used:', stats.usage);
```

## Rate Limits and Pricing

### Rate Limit Headers

OpenRouter includes rate limit information in response headers:

```javascript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  // ... request config
});

console.log('Rate limit:', response.headers.get('x-ratelimit-limit'));
console.log('Remaining:', response.headers.get('x-ratelimit-remaining'));
console.log('Reset time:', response.headers.get('x-ratelimit-reset'));
```

### Cost Estimation

```typescript
interface ModelPricing {
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
}

const estimateCost = (
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing
): number => {
  const inputCost = (inputTokens / 1000) * pricing.inputCostPer1kTokens;
  const outputCost = (outputTokens / 1000) * pricing.outputCostPer1kTokens;
  return inputCost + outputCost;
};
```

## Security Considerations

1. **API Key Protection**: Never expose API keys in client-side code
2. **Rate Limiting**: Implement client-side rate limiting to prevent abuse
3. **Input Validation**: Sanitize user inputs before sending to the API
4. **Error Handling**: Don't expose detailed error messages to end users

## Common Pitfalls to Avoid

1. **Not handling rate limits**: Always implement exponential backoff
2. **Ignoring token limits**: Monitor and truncate inputs when necessary
3. **Missing error handling**: Network issues and API errors will occur
4. **Forgetting about costs**: Monitor usage to prevent unexpected charges
5. **Blocking UI during requests**: Use streaming for better user experience

## Resource Links

- [OpenRouter Official Documentation](https://openrouter.ai/docs)
- [OpenRouter API Reference](https://openrouter.ai/docs/api-reference)
- [Model List and Pricing](https://openrouter.ai/models)
- [OpenAI SDK Documentation](https://github.com/openai/openai-node)