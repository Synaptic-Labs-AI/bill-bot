import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Bill Bot</span>
            <Badge variant="outline" className="text-xs">
              Beta
            </Badge>
            <Separator orientation="vertical" className="h-4" />
            <span>Congressional AI Assistant</span>
          </div>
          
          <div className="flex items-center gap-4">
            <a 
              href="https://github.com/your-username/bill-bot" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <span>Open Source</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <Separator orientation="vertical" className="h-4" />
            <a 
              href="/privacy" 
              className="hover:text-foreground transition-colors"
            >
              Privacy
            </a>
            <Separator orientation="vertical" className="h-4" />
            <a 
              href="/terms" 
              className="hover:text-foreground transition-colors"
            >
              Terms
            </a>
          </div>
        </div>
        
        <Separator className="my-4" />
        
        <div className="text-center text-xs text-muted-foreground">
          <p>
            Built with{' '}
            <a 
              href="https://react.dev" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              React 19
            </a>
            ,{' '}
            <a 
              href="https://ui.shadcn.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              shadcn/ui
            </a>
            , and{' '}
            <a 
              href="https://tailwindcss.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Tailwind CSS v4
            </a>
          </p>
          <p className="mt-1">
            Data sourced from official U.S. Government APIs and RSS feeds
          </p>
        </div>
      </div>
    </footer>
  );
}