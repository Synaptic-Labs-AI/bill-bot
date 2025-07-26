import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, Bot } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Message } from '@/types';
import { ToolCallAccordion } from './ToolCallAccordion';
import { CitationSection } from './CitationSection';

interface ChatMessageProps {
  message: Message;
  className?: string;
}

export function ChatMessage({ message, className }: ChatMessageProps) {
  const [isToolCallsExpanded, setIsToolCallsExpanded] = useState(false);
  const [isCitationsExpanded, setIsCitationsExpanded] = useState(true);
  
  const isUser = message.role === 'user';
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const hasCitations = message.citations && message.citations.length > 0;

  return (
    <div className={cn('flex gap-4 max-w-5xl mx-auto', className)}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
        )}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 space-y-3">
        {/* Message Header */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {isUser ? 'You' : 'Bill Bot'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(message.timestamp)}
          </span>
          {message.isStreaming && (
            <Badge variant="outline" className="text-xs">
              <div className="flex items-center gap-1">
                <div className="w-1 h-1 bg-current rounded-full animate-pulse" />
                Typing...
              </div>
            </Badge>
          )}
          {message.metadata?.duration && (
            <Badge variant="outline" className="text-xs">
              {(message.metadata.duration / 1000).toFixed(1)}s
            </Badge>
          )}
        </div>
        
        {/* Message Content */}
        <Card className={cn(
          "overflow-hidden",
          isUser ? 'bg-primary/5 border-primary/10' : 'bg-card'
        )}>
          <CardContent className="p-4">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {message.isStreaming ? (
                <div className="flex items-center gap-1">
                  <span>{message.content}</span>
                  <span className="typing-indicator">|</span>
                </div>
              ) : (
                <div 
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ 
                    __html: message.content.replace(/\n/g, '<br>') 
                  }} 
                />
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Tool Call Accordion */}
        {hasToolCalls && (
          <ToolCallAccordion
            toolCalls={message.toolCalls}
            isExpanded={isToolCallsExpanded}
            onToggle={setIsToolCallsExpanded}
          />
        )}
        
        {/* Citations Section */}
        {hasCitations && (
          <CitationSection
            citations={message.citations}
            isExpanded={isCitationsExpanded}
            onToggle={setIsCitationsExpanded}
          />
        )}
      </div>
    </div>
  );
}