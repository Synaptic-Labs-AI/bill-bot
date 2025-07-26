# Bill Bot Project Documentation

## Project Overview
Bill Bot is a single-use chatbot that helps users explore and understand legislative bills through an elegant chat interface. It leverages RAG (Retrieval Augmented Generation) with Supabase, Model Context Protocol (MCP), and OpenRouter for LLM calls.

## Key Requirements
- **Frontend**: React + TypeScript with Vite, shadcn/ui components, Tailwind CSS v4
- **Backend**: OpenRouter for LLM, Supabase for database and RAG
- **Architecture**: Model Context Protocol for database access
- **Features**: Bill scraping via RSS, embeddings with Cohere, reranking, citations
- **Design**: Template-based architecture with YAML prompt configuration

## PACT Phase Progress

### Phase 0: Project Setup ✅
- Created `docs` folder
- Initialized project documentation

### Phase 1: Prepare ✅
- [x] Research OpenRouter API documentation
- [x] Research Model Context Protocol implementation
- [x] Research Supabase RAG capabilities and vector search
- [x] Research Vite + React + TypeScript setup
- [x] Research shadcn/ui and Tailwind CSS v4
- [x] Research Cohere embeddings and reranking
- [x] Research RSS feed parsing for bill scraping
- [x] Research Railway deployment patterns
- [x] Research WebSocket/SSE streaming and YAML configuration
- [x] Create comprehensive documentation for all technologies

**Documentation Created:**
- `/docs/openrouter-api.md` - Complete OpenRouter integration guide
- `/docs/model-context-protocol.md` - MCP server/client implementation
- `/docs/supabase-vector-rag.md` - Vector database and RAG setup
- `/docs/cohere-embeddings-reranking.md` - Embeddings and reranking API
- `/docs/frontend-stack.md` - React 19 + Vite + shadcn/ui + Tailwind v4
- `/docs/railway-deployment.md` - Monorepo deployment configuration
- `/docs/additional-technologies.md` - RSS, YAML, streaming, citations

### Phase 2: Architect ✅
- [x] Design system architecture
- [x] Design database schema for bills and executive actions
- [x] Design MCP server implementation
- [x] Design frontend component structure
- [x] Design API endpoints structure
- [x] Design deployment architecture
- [x] Design configuration system
- [x] Design backend server architecture
- [x] Design context injection strategy
- [x] Design executive actions integration
- [x] Design tool call feedback system

**Architecture Documents Created:**
- `/docs/architecture/system-architecture.md` - Complete system design and component interactions
- `/docs/architecture/database-schema.md` - Bills and executive actions tables with vector embeddings
- `/docs/architecture/mcp-server-architecture.md` - Tool definitions and iterative search logic
- `/docs/architecture/frontend-architecture.md` - Component hierarchy and state management
- `/docs/architecture/api-design.md` - Backend endpoints and OpenRouter integration
- `/docs/architecture/deployment-architecture.md` - Docker containers and Railway configuration
- `/docs/architecture/configuration-system.md` - YAML prompt templates and RSS feed setup
- `/docs/architecture/backend-architecture.md` - Express.js server with MCP communication
- `/docs/architecture/context-injection.md` - Dynamic schema injection for preventing hallucination
- `/docs/architecture/executive-actions.md` - Presidential executive actions integration
- `/docs/architecture/tool-feedback-system.md` - Real-time tool call feedback with SSE

### Phase 3: Code (Pending)
- [ ] Backend implementation
- [ ] Frontend implementation
- [ ] Database setup
- [ ] MCP server implementation
- [ ] Scraper implementation

### Phase 4: Test (Pending)
- [ ] Unit tests
- [ ] Integration tests
- [ ] End-to-end tests
- [ ] Performance testing

## Technical Stack
- **Frontend**: React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS v4
- **Backend**: Express.js, TypeScript, SSE streaming
- **LLM**: anthropic/claude-sonnet-4 via OpenRouter API
- **Database**: Supabase (PostgreSQL + Vector embeddings)
- **Embeddings**: Cohere embed-english-v3.0
- **Protocol**: Model Context Protocol (MCP)
- **Scraping**: RSS feed parser for bills and executive actions
- **Configuration**: YAML-based prompt templates
- **Deployment**: Railway (Docker containers)

## Architecture Notes
- Single-use chat interface (no conversation history or external caching)
- MCP with dynamic context injection prevents LLM hallucination
- Unified search across Congressional bills and executive actions
- Real-time tool call feedback with SSE streaming
- Human-readable accordion UI for search progress
- Template-based design for different bot personalities
- Context-aware search with sponsor/status/topic validation