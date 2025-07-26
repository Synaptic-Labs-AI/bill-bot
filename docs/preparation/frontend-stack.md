# Frontend Stack: Vite + React + TypeScript + shadcn/ui + Tailwind CSS v4

## Executive Summary

This document covers the modern frontend stack for Bill Bot using Vite, React 19, TypeScript, shadcn/ui components, and Tailwind CSS v4. This combination provides blazing-fast development, type safety, beautiful UI components, and cutting-edge styling capabilities. The stack is optimized for 2025 development practices with React 19 features and Tailwind CSS v4's latest improvements.

## Technology Overview

### Stack Components

- **Vite**: Next-generation build tool with instant HMR and optimized production builds
- **React 19**: Latest React with improved concurrent features and automatic ref forwarding
- **TypeScript**: Static type checking for enhanced developer experience
- **shadcn/ui**: Modern, accessible component library built on Radix UI
- **Tailwind CSS v4**: Latest version with simplified configuration and improved performance
- **Lucide React**: Beautiful, customizable SVG icons

## Project Setup and Configuration

### Initial Project Creation

```bash
# Create new Vite project with React + TypeScript
npm create vite@latest bill-bot-frontend -- --template react-ts
cd bill-bot-frontend

# Install React 19 and updated dependencies
npm install react@19 react-dom@19
npm install -D @types/react@19 @types/react-dom@19

# Install additional dependencies
npm install react-router-dom@6 zustand@4 axios@1
npm install -D @vitejs/plugin-react @tailwindcss/vite
```

### Vite Configuration (vite.config.ts)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Tailwind CSS v4 plugin
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/services': path.resolve(__dirname, './src/services'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['lucide-react'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
```

### TypeScript Configuration

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/types/*": ["./src/types/*"],
      "@/services/*": ["./src/services/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

#### tsconfig.app.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo"
  },
  "include": ["src"]
}
```

## Tailwind CSS v4 Setup

### CSS Configuration (src/index.css)

```css
/* Tailwind CSS v4 - Simplified import */
@import "tailwindcss";

/* Custom variables using oklch color space */
@custom-variant dark (&:is(.dark *));

:root {
  /* Background colors */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  
  /* Card colors */
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  
  /* Primary colors */
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  
  /* Secondary colors */
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  
  /* Muted colors */
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  
  /* Accent colors */
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  
  /* State colors */
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  
  /* Border and input colors */
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  
  /* Chart colors */
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  
  /* Border radius */
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.145 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.145 0 0);
  --secondary: oklch(0.205 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.205 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.205 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.72 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.205 0 0);
  --input: oklch(0.205 0 0);
  --ring: oklch(0.708 0 0);
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: hsl(var(--background));
}

::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground));
}

/* Custom animations for chat */
@keyframes typing {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.typing-indicator {
  animation: typing 1.5s infinite;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.3s ease-out;
}
```

## shadcn/ui Installation and Setup

### Install shadcn/ui (Canary for React 19 + Tailwind v4)

```bash
# Install shadcn/ui with canary version for React 19 support
npx shadcn@canary init
```

### Configuration (components.json)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

### Utility Functions (src/lib/utils.ts)

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format date for bill display
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

// Truncate text with ellipsis
export function truncate(text: string, length: number = 100): string {
  if (text.length <= length) return text;
  return text.slice(0, length).trim() + '...';
}

// Highlight search terms in text
export function highlightSearchTerms(text: string, searchTerm: string): string {
  if (!searchTerm) return text;
  
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
}

// Generate initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
```

### Install Core Components

```bash
# Install essential components for Bill Bot
npx shadcn@canary add button
npx shadcn@canary add input
npx shadcn@canary add card
npx shadcn@canary add badge
npx shadcn@canary add avatar
npx shadcn@canary add skeleton
npx shadcn@canary add scroll-area
npx shadcn@canary add separator
npx shadcn@canary add dialog
npx shadcn@canary add dropdown-menu
npx shadcn@canary add toast
npx shadcn@canary add tabs
npx shadcn@canary add accordion
npx shadcn@canary add progress
```

## Core Components for Chat Interface

### Chat Message Component

```tsx
// src/components/chat/ChatMessage.tsx
import React from 'react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Citation {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  relevanceScore: number;
}

interface ChatMessageProps {
  message: {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: Date;
    citations?: Citation[];
    isStreaming?: boolean;
  };
  className?: string;
}

export function ChatMessage({ message, className }: ChatMessageProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={cn('flex gap-3 max-w-4xl mx-auto', className)}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {isUser ? 'You' : 'Bill Bot'}
          </span>
          <span className="text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString()}
          </span>
          {message.isStreaming && (
            <Badge variant="outline" className="text-xs">
              Typing...
            </Badge>
          )}
        </div>
        
        <Card className="p-4">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {message.isStreaming ? (
              <div className="flex items-center gap-1">
                <span>{message.content}</span>
                <span className="typing-indicator">|</span>
              </div>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: message.content }} />
            )}
          </div>
          
          {message.citations && message.citations.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Sources:</h4>
              <div className="space-y-2">
                {message.citations.map((citation, index) => (
                  <CitationCard 
                    key={citation.id} 
                    citation={citation} 
                    index={index + 1} 
                  />
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  return (
    <Card className="p-3 bg-muted/50">
      <div className="flex items-start gap-2">
        <Badge variant="secondary" className="text-xs">
          {index}
        </Badge>
        <div className="flex-1 min-w-0">
          <a 
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline line-clamp-1"
          >
            {citation.title}
          </a>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {citation.excerpt}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              Relevance: {Math.round(citation.relevanceScore * 100)}%
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}
```

### Chat Input Component

```tsx
// src/components/chat/ChatInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Mic, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  onStopGeneration?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({ 
  onSendMessage, 
  isLoading = false,
  onStopGeneration,
  placeholder = "Ask about legislative bills...",
  disabled = false 
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleStop = () => {
    onStopGeneration?.();
  };

  return (
    <div className="border-t bg-background/80 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto p-4">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="min-h-[44px] max-h-[120px] resize-none pr-12 py-3"
                rows={1}
              />
              
              {/* Character count */}
              <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                {message.length}/2000
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              {isLoading ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={handleStop}
                  className="h-11 w-11"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!message.trim() || disabled}
                  size="icon"
                  className="h-11 w-11"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
              
              {/* Voice input button (future feature) */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11"
                disabled
                title="Voice input (coming soon)"
              >
                <Mic className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Quick actions */}
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMessage("What bills were introduced this week?")}
              disabled={isLoading}
            >
              Recent bills
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMessage("Show me healthcare legislation")}
              disabled={isLoading}
            >
              Healthcare bills
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMessage("Find climate change related bills")}
              disabled={isLoading}
            >
              Climate bills
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### Chat Container Component

```tsx
// src/components/chat/ChatContainer.tsx
import React, { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { ChatSkeleton } from './ChatSkeleton';
import { EmptyState } from './EmptyState';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  citations?: any[];
  isStreaming?: boolean;
}

interface ChatContainerProps {
  messages: Message[];
  isLoading?: boolean;
  className?: string;
}

export function ChatContainer({ messages, isLoading, className }: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return <EmptyState />;
  }

  return (
    <ScrollArea className={cn('flex-1', className)}>
      <div ref={containerRef} className="space-y-6 p-4">
        {messages.map((message) => (
          <ChatMessage 
            key={message.id} 
            message={message}
            className="animate-fade-in-up"
          />
        ))}
        
        {isLoading && <ChatSkeleton />}
        
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
```

### Empty State Component

```tsx
// src/components/chat/EmptyState.tsx
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Search, TrendingUp, Calendar } from 'lucide-react';

export function EmptyState() {
  const suggestions = [
    {
      icon: Search,
      title: "Search Bills",
      description: "Find specific legislation by keyword, sponsor, or topic",
      example: "Show me bills about renewable energy"
    },
    {
      icon: Calendar,
      title: "Recent Activity", 
      description: "Explore recently introduced or updated bills",
      example: "What bills were introduced this week?"
    },
    {
      icon: TrendingUp,
      title: "Trending Topics",
      description: "Discover what's popular in Congress right now",
      example: "What are the most discussed bills?"
    },
    {
      icon: FileText,
      title: "Bill Details",
      description: "Get comprehensive information about any bill",
      example: "Tell me about H.R. 1234"
    }
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl mx-auto text-center space-y-8">
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <FileText className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome to Bill Bot
            </h1>
            <p className="text-lg text-muted-foreground mt-2">
              Your AI assistant for exploring legislative bills and congressional data
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suggestions.map((suggestion, index) => (
            <Card key={index} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <suggestion.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-medium">{suggestion.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {suggestion.description}
                  </p>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-2 p-0 h-auto font-normal text-xs text-primary hover:bg-transparent"
                  >
                    "{suggestion.example}"
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="text-sm text-muted-foreground">
          <p>Ask me anything about congressional bills, sponsors, committees, or voting records.</p>
        </div>
      </div>
    </div>
  );
}
```

## State Management with Zustand

```typescript
// src/stores/chatStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  citations?: any[];
  isStreaming?: boolean;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      messages: [],
      isLoading: false,
      error: null,

      addMessage: (message) =>
        set((state) => ({
          messages: [
            ...state.messages,
            {
              ...message,
              id: crypto.randomUUID(),
              timestamp: new Date(),
            },
          ],
        })),

      updateMessage: (id, updates) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          ),
        })),

      removeMessage: (id) =>
        set((state) => ({
          messages: state.messages.filter((msg) => msg.id !== id),
        })),

      clearMessages: () => set({ messages: [] }),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),
    }),
    { name: 'chat-store' }
  )
);
```

## React Router Setup

```tsx
// src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ChatPage } from '@/pages/ChatPage';
import { AboutPage } from '@/pages/AboutPage';
import { Layout } from '@/components/Layout';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/ThemeProvider';

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="bill-bot-theme">
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </Layout>
        <Toaster />
      </Router>
    </ThemeProvider>
  );
}

export default App;
```

## Theme Provider (Dark Mode Support)

```tsx
// src/components/ThemeProvider.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
```

## Performance Optimization

### Code Splitting with React.lazy

```tsx
// src/pages/LazyPages.tsx
import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Loading component for lazy routes
function PageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// Lazy load pages
export const ChatPage = React.lazy(() => import('@/pages/ChatPage'));
export const AboutPage = React.lazy(() => import('@/pages/AboutPage'));
export const SettingsPage = React.lazy(() => import('@/pages/SettingsPage'));

// Wrapper with Suspense
export function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<PageSkeleton />}>
      {children}
    </React.Suspense>
  );
}
```

### Custom Hooks for Performance

```typescript
// src/hooks/useDebounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// src/hooks/useLocalStorage.ts
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}

// src/hooks/useIntersectionObserver.ts
import { useEffect, useRef, useState } from 'react';

export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      options
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [options]);

  return [ref, isIntersecting];
}
```

## Best Practices

### 1. Component Organization

```typescript
// Component structure
const ComponentStructure = {
  // Group by feature, not by type
  components: {
    chat: ['ChatMessage', 'ChatInput', 'ChatContainer'],
    bills: ['BillCard', 'BillList', 'BillDetail'],
    layout: ['Header', 'Footer', 'Sidebar'],
    ui: ['Button', 'Card', 'Input'], // shadcn/ui components
  },
  
  // Use index files for clean imports
  exports: 'export { ChatMessage } from "./ChatMessage";',
  
  // Consistent naming conventions
  naming: {
    components: 'PascalCase',
    files: 'PascalCase.tsx',
    hooks: 'camelCase with use prefix',
    utilities: 'camelCase',
  },
};
```

### 2. Type Safety

```typescript
// src/types/index.ts
export interface Bill {
  id: string;
  billNumber: string;
  title: string;
  summary?: string;
  sponsor: string;
  introducedDate: string;
  status: BillStatus;
  chamber: Chamber;
  committee?: string;
  metadata: BillMetadata;
}

export type BillStatus = 
  | 'introduced'
  | 'committee'
  | 'passed_house'
  | 'passed_senate'
  | 'enacted'
  | 'vetoed';

export type Chamber = 'house' | 'senate';

export interface BillMetadata {
  [key: string]: any;
}

export interface SearchFilters {
  status?: BillStatus[];
  chamber?: Chamber;
  dateRange?: {
    from: string;
    to: string;
  };
  sponsor?: string;
  committee?: string;
}

// API response types
export interface APIResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}
```

### 3. Error Boundaries

```tsx
// src/components/ErrorBoundary.tsx
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
          <Card className="p-6 max-w-md mx-auto text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4">
              We encountered an unexpected error. Please try refreshing the page.
            </p>
            <Button onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Common Pitfalls to Avoid

1. **Not using React 19 features**: Update forwardRef patterns and use new APIs
2. **Incorrect Tailwind v4 setup**: Use @import "tailwindcss" instead of separate directives
3. **Missing error boundaries**: Always wrap components that might fail
4. **Poor accessibility**: Use semantic HTML and ARIA attributes
5. **Unoptimized images**: Use proper image optimization and lazy loading
6. **Memory leaks**: Clean up event listeners and subscriptions
7. **Large bundle sizes**: Implement code splitting and tree shaking

## Resource Links

- [Vite Documentation](https://vitejs.dev/)
- [React 19 Documentation](https://react.dev/)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/)
- [TypeScript React Handbook](https://react-typescript-cheatsheet.netlify.app/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)