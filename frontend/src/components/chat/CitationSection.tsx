import React, { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, FileText, Scale, Building2, ChevronDown } from 'lucide-react';
import { cn, formatRelevanceScore, highlightSearchTerms } from '@/lib/utils';
import type { Citation } from '@/types';

interface CitationSectionProps {
  citations: Citation[];
  isExpanded: boolean;
  onToggle: (expanded: boolean) => void;
}

export function CitationSection({ 
  citations, 
  isExpanded, 
  onToggle 
}: CitationSectionProps) {
  if (citations.length === 0) return null;

  return (
    <Accordion 
      type="single" 
      value={isExpanded ? "citations" : ""}
      onValueChange={(value) => onToggle(value === "citations")}
    >
      <AccordionItem value="citations" className="border rounded-lg">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex items-center gap-3 text-sm">
            <FileText className="h-4 w-4" />
            <span className="font-medium">
              Sources ({citations.length})
            </span>
            <Badge variant="outline" className="text-xs">
              {formatRelevanceScore(
                citations.reduce((sum, c) => sum + c.relevanceScore, 0) / citations.length
              )} avg relevance
            </Badge>
          </div>
        </AccordionTrigger>
        
        <AccordionContent className="px-4 pb-4">
          <div className="space-y-3">
            {citations.map((citation, index) => (
              <CitationCard 
                key={citation.id} 
                citation={citation} 
                index={index + 1} 
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

interface CitationCardProps {
  citation: Citation;
  index: number;
  variant?: 'default' | 'compact';
}

export function CitationCard({ 
  citation, 
  index, 
  variant = 'default' 
}: CitationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bill':
        return <FileText className="h-4 w-4" />;
      case 'amendment':
        return <Scale className="h-4 w-4" />;
      case 'vote':
        return <Building2 className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getChamberColor = (chamber?: string) => {
    switch (chamber) {
      case 'house':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'senate':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Badge 
            variant="secondary" 
            className="text-xs font-medium shrink-0 mt-1"
          >
            {index}
          </Badge>
          
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title and Link */}
            <div className="flex items-start justify-between gap-2">
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sm hover:underline line-clamp-2 flex items-start gap-2 group"
              >
                {getTypeIcon(citation.type)}
                <span className="group-hover:text-primary transition-colors">
                  {citation.title}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
              </a>
              
              <div className={cn(
                "text-xs font-medium shrink-0",
                getRelevanceColor(citation.relevanceScore)
              )}>
                {formatRelevanceScore(citation.relevanceScore)}
              </div>
            </div>
            
            {/* Metadata badges */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              {citation.billNumber && (
                <Badge variant="outline" className="text-xs">
                  {citation.billNumber}
                </Badge>
              )}
              {citation.chamber && (
                <Badge 
                  variant="outline" 
                  className={cn("text-xs", getChamberColor(citation.chamber))}
                >
                  {citation.chamber === 'house' ? 'House' : 'Senate'}
                </Badge>
              )}
              {citation.status && (
                <Badge variant="outline" className="text-xs">
                  {citation.status}
                </Badge>
              )}
              {citation.sponsor && (
                <Badge variant="outline" className="text-xs">
                  {citation.sponsor}
                </Badge>
              )}
            </div>
            
            {/* Excerpt */}
            <CitationExcerpt 
              excerpt={citation.excerpt}
              query={citation.searchContext.query}
              isExpanded={isExpanded}
              onToggle={setIsExpanded}
            />
            
            {/* Source information */}
            <div className="text-xs text-muted-foreground">
              <div>Source: {citation.source.name}</div>
              {citation.source.publishedDate && (
                <div>Published: {new Date(citation.source.publishedDate).toLocaleDateString()}</div>
              )}
              {citation.introducedDate && (
                <div>Introduced: {new Date(citation.introducedDate).toLocaleDateString()}</div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface CitationExcerptProps {
  excerpt: string;
  query: string;
  isExpanded: boolean;
  onToggle: (expanded: boolean) => void;
}

function CitationExcerpt({ 
  excerpt, 
  query, 
  isExpanded, 
  onToggle 
}: CitationExcerptProps) {
  const shouldTruncate = excerpt.length > 150;
  const displayText = isExpanded ? excerpt : excerpt.substring(0, 150);
  
  // Highlight query terms
  const highlightedText = highlightSearchTerms(displayText, query);
  
  return (
    <div className="text-sm text-muted-foreground">
      <div 
        dangerouslySetInnerHTML={{ __html: highlightedText }}
        className="leading-relaxed"
      />
      {shouldTruncate && !isExpanded && <span>...</span>}
      
      {shouldTruncate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggle(!isExpanded)}
          className="h-auto p-0 text-xs text-primary hover:bg-transparent mt-1"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </div>
  );
}