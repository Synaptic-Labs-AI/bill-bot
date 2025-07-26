import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Search, TrendingUp, Calendar, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  onSuggestionClick?: (suggestion: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  const suggestions = [
    {
      icon: Search,
      title: "Search Bills",
      description: "Find specific legislation by keyword, sponsor, or topic",
      example: "Show me bills about renewable energy",
      category: "search"
    },
    {
      icon: Calendar,
      title: "Recent Activity", 
      description: "Explore recently introduced or updated bills",
      example: "What bills were introduced this week?",
      category: "recent"
    },
    {
      icon: TrendingUp,
      title: "Trending Topics",
      description: "Discover what's popular in Congress right now",
      example: "What are the most discussed bills?",
      category: "trending"
    },
    {
      icon: FileText,
      title: "Bill Details",
      description: "Get comprehensive information about any bill",
      example: "Tell me about H.R. 1234",
      category: "details"
    }
  ];

  const handleSuggestionClick = (example: string) => {
    onSuggestionClick?.(example);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl mx-auto text-center space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center">
            <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Welcome to Bill Bot
            </h1>
            <p className="text-lg text-muted-foreground mt-2">
              Your AI assistant for exploring legislative bills and congressional data
            </p>
          </div>
        </div>

        {/* Suggestion Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suggestions.map((suggestion, index) => (
            <Card 
              key={index} 
              className="p-4 hover:shadow-md transition-all duration-200 cursor-pointer group hover:border-primary/20"
              onClick={() => handleSuggestionClick(suggestion.example)}
            >
              <CardContent className="p-0">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <suggestion.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="font-medium group-hover:text-primary transition-colors">
                      {suggestion.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {suggestion.description}
                    </p>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="mt-2 p-0 h-auto font-normal text-xs text-primary hover:bg-transparent group-hover:text-primary/80"
                    >
                      "{suggestion.example}"
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Features */}
        <div className="text-center space-y-4">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">What I can help you with:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "Congressional bills",
                "Sponsors & committees", 
                "Voting records",
                "Legislative history",
                "Bill status tracking",
                "Policy analysis"
              ].map((feature, index) => (
                <span 
                  key={index}
                  className="inline-block bg-muted px-2 py-1 rounded text-xs"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Ask me anything about legislative bills, sponsors, committees, or voting records.
          </p>
        </div>
      </div>
    </div>
  );
}