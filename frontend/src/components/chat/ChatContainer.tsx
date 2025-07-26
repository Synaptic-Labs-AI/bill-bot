import React, { useEffect, useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';
import { EmptyState } from './EmptyState';
import type { Message } from '@/types';

interface ChatContainerProps {
  messages: Message[];
  isLoading?: boolean;
  isStreaming?: boolean;
  className?: string;
}

export function ChatContainer({ 
  messages, 
  isLoading = false, 
  isStreaming = false,
  className 
}: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = React.useState(true);
  const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);

  // Auto-scroll to bottom when new messages arrive or content updates
  useEffect(() => {
    if (shouldAutoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isStreaming, shouldAutoScroll]);

  // Track scroll position to determine if user has scrolled up
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
    
    setIsScrolledToBottom(isAtBottom);
    setShouldAutoScroll(isAtBottom);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShouldAutoScroll(true);
  };

  if (messages.length === 0 && !isLoading) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 relative">
      <ScrollArea 
        className={cn('h-full', className)}
        ref={containerRef}
        onScrollCapture={handleScroll}
      >
        <div className="space-y-6 p-4 pb-16">
          {messages.map((message) => (
            <ChatMessage 
              key={message.id} 
              message={message}
              className="animate-fade-in-up"
            />
          ))}
          
          {(isLoading || isStreaming) && <TypingIndicator />}
          
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      
      {/* Scroll to bottom button */}
      {!isScrolledToBottom && messages.length > 0 && (
        <div className="absolute bottom-4 right-4">
          <Button
            variant="outline"
            size="sm"
            onClick={scrollToBottom}
            className="rounded-full shadow-md hover:shadow-lg transition-shadow"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}