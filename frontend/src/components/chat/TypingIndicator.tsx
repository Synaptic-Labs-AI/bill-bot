import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div className="flex gap-4 max-w-5xl mx-auto animate-fade-in-up">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-secondary text-secondary-foreground">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">Bill Bot</span>
          <span className="text-xs text-muted-foreground">is thinking...</span>
        </div>
        
        <Card className="w-fit">
          <CardContent className="p-4">
            <div className="flex items-center gap-1">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}