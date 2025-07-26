import React, { useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { ChatContainer } from './ChatContainer';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
  className?: string;
}

export function ChatInterface({ className }: ChatInterfaceProps) {
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
    startNewSession,
  } = useChatStore();

  // Initialize a new session on mount
  useEffect(() => {
    startNewSession();
  }, [startNewSession]);

  const handleSendMessage = async (content: string) => {
    try {
      await sendMessage(content);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleStopGeneration = () => {
    stopGeneration();
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Error banner */}
      {error && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2">
          <div className="max-w-5xl mx-auto">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      {/* Chat messages */}
      <ChatContainer 
        messages={messages}
        isLoading={isLoading}
        isStreaming={isStreaming}
        className="flex-1"
      />

      {/* Chat input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        isLoading={isLoading || isStreaming}
        onStopGeneration={handleStopGeneration}
        disabled={false}
      />
    </div>
  );
}