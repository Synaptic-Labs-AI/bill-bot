import React from 'react';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export function ChatPage() {
  return (
    <ErrorBoundary>
      <ChatInterface className="h-full" />
    </ErrorBoundary>
  );
}

export default ChatPage;