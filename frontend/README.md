# Bill Bot Frontend

A modern React 19 frontend for the Bill Bot congressional AI assistant, built with TypeScript, Vite, shadcn/ui, and Tailwind CSS v4.

## 🚀 Features

- **Modern Stack**: React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS v4
- **Real-time Streaming**: Server-Sent Events for live chat responses
- **Tool Call Transparency**: Collapsible accordion showing search progress
- **Citation Display**: Elegant citation cards with relevance scores
- **Dark Mode**: System-aware theme switching
- **Responsive Design**: Mobile-first responsive layout
- **Performance Optimized**: Code splitting, lazy loading, and optimized builds
- **Type Safe**: Comprehensive TypeScript coverage
- **Accessible**: WCAG 2.1 AA compliant components

## 📦 Tech Stack

### Core
- **React 19** - Latest React with concurrent features
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server

### UI & Styling
- **shadcn/ui** - Modern accessible component library
- **Tailwind CSS v4** - Utility-first CSS framework
- **Lucide React** - Beautiful SVG icons
- **Radix UI** - Unstyled accessible components

### State & Data
- **Zustand** - Lightweight state management
- **Axios** - HTTP client with interceptors
- **Server-Sent Events** - Real-time streaming

### Development
- **ESLint** - Code linting
- **TypeScript** - Static type checking
- **React Router** - Client-side routing

## 🛠 Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/bill-bot.git
cd bill-bot/frontend
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Start development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# API Configuration
VITE_API_URL=http://localhost:3001/api
VITE_SSE_URL=http://localhost:3001/api

# Application Configuration
VITE_APP_NAME=Bill Bot
VITE_APP_VERSION=1.0.0

# Feature Flags
VITE_ENABLE_TOOL_CALL_FEEDBACK=true
VITE_ENABLE_CITATIONS=true
VITE_ENABLE_DARK_MODE=true
```

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── chat/           # Chat-specific components
│   │   ├── layout/         # Layout components
│   │   ├── ui/            # shadcn/ui components
│   │   └── common/        # Shared components
│   ├── pages/             # Page components
│   ├── stores/            # Zustand stores
│   ├── services/          # API services
│   ├── hooks/             # Custom hooks
│   ├── types/             # TypeScript types
│   ├── lib/               # Utility functions
│   └── styles/            # Global styles
├── public/                # Static assets
├── dist/                  # Build output
└── docs/                  # Documentation
```

## 🧩 Key Components

### Chat Interface
- `ChatInterface` - Main chat container
- `ChatMessage` - Individual message display
- `ChatInput` - Message input with auto-resize
- `ToolCallAccordion` - Collapsible tool call feedback
- `CitationSection` - Citation display with links

### UI Components
- Built with shadcn/ui for consistency
- Fully accessible and keyboard navigable
- Dark mode support
- Mobile responsive

### State Management
- **Zustand** for chat state
- **Server-Sent Events** for real-time updates
- **Error boundaries** for graceful error handling

## 🎨 Styling

### Tailwind CSS v4
The project uses Tailwind CSS v4 with:
- Custom CSS variables for theming
- OKLCH color space for better color consistency
- Custom utility classes for common patterns

### Design System
- Consistent spacing and typography
- Color palette optimized for accessibility
- Component variants using class-variance-authority
- Responsive breakpoints

## 🔧 Build & Deployment

### Development
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run type-check   # Type checking only
```

### Production Build
```bash
npm run build
```

The build outputs to the `dist/` directory with:
- Optimized bundles
- Code splitting
- Asset optimization
- Source maps

### Docker Deployment
```bash
# Build image
docker build -t bill-bot-frontend .

# Run container
docker run -p 3000:3000 bill-bot-frontend
```

## 🧪 Testing

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

## 📱 Responsive Design

The application is fully responsive with:
- Mobile-first approach
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Touch-friendly interactions
- Optimized for various screen sizes

## ♿ Accessibility

- **WCAG 2.1 AA** compliance
- **Keyboard navigation** support
- **Screen reader** friendly
- **Focus management** 
- **Color contrast** ratios met
- **Semantic HTML** structure

## 🔒 Security

- **Content Security Policy** headers
- **XSS protection** 
- **Input sanitization**
- **Environment variable** isolation
- **No sensitive data** in client-side code

## 🚀 Performance

### Optimization Features
- **Code splitting** with React.lazy
- **Bundle analysis** and optimization
- **Image optimization** and lazy loading
- **Memoization** for expensive operations
- **Virtual scrolling** for large lists
- **Service worker** caching (optional)

### Performance Metrics
- **First Contentful Paint** < 1.5s
- **Largest Contentful Paint** < 2.5s
- **Cumulative Layout Shift** < 0.1
- **First Input Delay** < 100ms

## 🐛 Error Handling

### Error Boundaries
- Component-level error boundaries
- Graceful fallback UI
- Error reporting to console
- User-friendly error messages

### Network Errors
- Automatic retry with exponential backoff
- Offline state detection
- Connection status indicators
- Graceful degradation

## 🔄 State Management

### Chat Store (Zustand)
```typescript
interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  // ... actions
}
```

### SSE Integration
- Real-time message streaming
- Tool call progress updates
- Connection status management
- Automatic reconnection

## 🎯 Browser Support

- **Chrome** 90+
- **Firefox** 88+
- **Safari** 14+
- **Edge** 90+

## 📋 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Code Style
- Use TypeScript for all new code
- Follow the existing component patterns
- Use shadcn/ui components when possible
- Write accessible, semantic HTML
- Add proper TypeScript types

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## 🤝 Support

- **Documentation**: [Project Docs](../docs/)
- **Issues**: [GitHub Issues](https://github.com/your-username/bill-bot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/bill-bot/discussions)