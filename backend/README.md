# Bill Bot Backend

The backend API server for Bill Bot - a Legislative AI Assistant for exploring Congressional bills.

## Features

- **Streaming Chat Interface**: Real-time SSE streaming for chat interactions
- **OpenRouter Integration**: Uses Claude Sonnet 4 via OpenRouter API
- **MCP Communication**: Integrates with MCP server for database operations
- **Comprehensive Error Handling**: Robust error handling and recovery
- **Rate Limiting**: Progressive rate limiting with violation tracking
- **Health Monitoring**: Detailed health checks for all services
- **Security**: CORS, Helmet, request validation, and input sanitization

## Architecture

- **Express.js**: Web framework with TypeScript
- **SSE Streaming**: Server-Sent Events for real-time responses
- **MCP Client**: Communication with MCP server via stdio
- **OpenRouter Client**: LLM integration with streaming support
- **Rate Limiting**: Express rate limiting with memory store
- **Error Handling**: Comprehensive error boundaries and recovery

## Getting Started

### Prerequisites

- Node.js 20+
- OpenRouter API key

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
```

### Environment Variables

Required environment variables:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Optional environment variables (with defaults):

```env
NODE_ENV=development
PORT=3001
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
OPENROUTER_MODEL=anthropic/claude-sonnet-4
MCP_SERVER_PATH=../mcp-server/dist/index.js
MAX_SEARCH_ITERATIONS=20
```

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Docker

```bash
# Build Docker image
docker build -t bill-bot-backend .

# Run container
docker run -p 3001:3001 --env-file .env bill-bot-backend
```

## API Endpoints

### Chat
- `POST /api/chat/stream` - Start streaming chat session
- `POST /api/chat/stop` - Stop chat generation
- `GET /api/chat/models` - Get available AI models
- `GET /api/chat/health` - Chat service health check

### Bills
- `GET /api/bills/search` - Search bills with filters
- `GET /api/bills/:billId` - Get bill details
- `GET /api/bills/recent/:chamber?` - Get recent bills
- `GET /api/bills/filters/options` - Get available filter options

### Health
- `GET /api/health` - Overall health check
- `GET /api/health/detailed` - Detailed health information
- `GET /api/health/live` - Liveness probe
- `GET /api/health/ready` - Readiness probe

## Streaming Protocol

The chat endpoint uses Server-Sent Events (SSE) with the following event types:

```typescript
type SSEEvent = 
  | { type: 'start'; data: { sessionId: string; messageId: string } }
  | { type: 'content'; data: { content: string } }
  | { type: 'tool_call'; data: { id: string; name: string; status: string } }
  | { type: 'citation'; data: Citation }
  | { type: 'error'; data: { error: string; recoverable: boolean } }
  | { type: 'end'; data: { status: string; duration: number } }
```

## Rate Limiting

- **General API**: 100 requests per 15 minutes
- **Chat Endpoint**: 10 requests per minute
- **Search Endpoint**: 30 requests per minute
- **Progressive Limiting**: Penalties for repeated violations

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error Type",
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "recoverable": true
}
```

## Monitoring

### Health Checks

- `/api/health` - Quick health check
- `/api/health/detailed` - Comprehensive service status
- `/api/health/live` - Kubernetes liveness probe
- `/api/health/ready` - Kubernetes readiness probe

### Logging

Structured logging with different levels:
- `error` - Error conditions
- `warn` - Warning conditions  
- `info` - Informational messages
- `debug` - Debug information

## Security

- **CORS**: Configurable origins
- **Helmet**: Security headers
- **Rate Limiting**: Request throttling
- **Input Validation**: Joi schema validation
- **Request Size Limits**: 10MB maximum
- **Timeout Protection**: Request timeout handling

## Development

### File Structure

```
src/
├── config/         # Configuration management
├── middleware/     # Express middleware
├── routes/         # API route handlers
├── services/       # Business logic services
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
└── app.ts          # Main application
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Linting

```bash
# Run ESLint
npm run lint

# Fix linting issues
npm run lint:fix
```

## Deployment

### Railway

The backend is configured for Railway deployment with:

- Automatic builds from Git
- Environment variable configuration
- Health check endpoints
- Graceful shutdown handling

### Docker

Multi-stage Docker build for optimized production images:

- Builder stage with development dependencies
- Production stage with minimal runtime
- Non-root user for security
- Health check configuration

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Follow conventional commit messages
5. Ensure all health checks pass

## License

MIT License - see LICENSE file for details