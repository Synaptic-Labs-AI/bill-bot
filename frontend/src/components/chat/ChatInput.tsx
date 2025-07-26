import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Square, Calendar, Heart, Leaf, Building } from 'lucide-react';
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
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 200; // Maximum height in pixels
    
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [message, adjustTextareaHeight]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || isLoading || disabled || isComposing) {
      return;
    }
    
    onSendMessage(message.trim());
    setMessage('');
    
    // Reset textarea height
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, 0);
  }, [message, isLoading, disabled, isComposing, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit, isComposing]);

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  const handleStop = () => {
    onStopGeneration?.();
  };

  const characterCount = message.length;
  const maxCharacters = 2000;
  const isNearLimit = characterCount > maxCharacters * 0.8;
  const isOverLimit = characterCount > maxCharacters;

  const quickActions = [
    {
      label: "Recent bills",
      query: "What bills were introduced this week?",
      icon: Calendar,
    },
    {
      label: "Healthcare legislation",
      query: "Show me recent healthcare legislation",
      icon: Heart,
    },
    {
      label: "Climate bills",
      query: "Find climate change related bills",
      icon: Leaf,
    },
    {
      label: "Infrastructure",
      query: "What infrastructure bills are in Congress?",
      icon: Building,
    },
  ];

  return (
    <div className="border-t bg-background/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(
                "min-h-[44px] max-h-[200px] resize-none pr-16 py-3",
                "focus:ring-2 focus:ring-primary/20",
                isOverLimit && "border-destructive focus:ring-destructive/20"
              )}
              rows={1}
              maxLength={maxCharacters}
            />
            
            {/* Character count */}
            <div className={cn(
              "absolute bottom-2 right-12 text-xs",
              isNearLimit 
                ? isOverLimit 
                  ? "text-destructive" 
                  : "text-yellow-600"
                : "text-muted-foreground"
            )}>
              {characterCount}/{maxCharacters}
            </div>
            
            {/* Send/Stop button */}
            <div className="absolute bottom-2 right-2">
              {isLoading ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleStop}
                  className="h-8 w-8 p-0"
                  title="Stop generation"
                >
                  <Square className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!message.trim() || disabled || isOverLimit}
                  size="sm"
                  className="h-8 w-8 p-0"
                  title="Send message"
                >
                  <Send className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          
          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMessage(action.query)}
                disabled={isLoading || disabled}
                className="text-xs h-7"
              >
                <action.icon className="h-3 w-3 mr-1" />
                {action.label}
              </Button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}