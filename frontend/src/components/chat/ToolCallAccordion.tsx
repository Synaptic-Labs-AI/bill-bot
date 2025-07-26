import React, { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  Database, 
  FileText, 
  ChevronDown, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import type { ToolCall } from '@/types';

interface ToolCallAccordionProps {
  toolCalls: ToolCall[];
  isExpanded: boolean;
  onToggle: (expanded: boolean) => void;
}

export function ToolCallAccordion({ 
  toolCalls, 
  isExpanded, 
  onToggle 
}: ToolCallAccordionProps) {
  const totalCalls = toolCalls.length;
  const completedCalls = toolCalls.filter(call => call.status === 'completed').length;
  const failedCalls = toolCalls.filter(call => call.status === 'failed').length;
  const pendingCalls = totalCalls - completedCalls - failedCalls;

  const getOverallProgress = () => {
    if (totalCalls === 0) return 0;
    return (completedCalls / totalCalls) * 100;
  };

  return (
    <Accordion 
      type="single" 
      value={isExpanded ? "tool-calls" : ""}
      onValueChange={(value) => onToggle(value === "tool-calls")}
    >
      <AccordionItem value="tool-calls" className="border rounded-lg">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex items-center gap-3 text-sm w-full">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span className="font-medium">
                Database Operations ({completedCalls}/{totalCalls})
              </span>
            </div>
            
            <div className="flex items-center gap-2 ml-auto mr-4">
              {pendingCalls > 0 && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {pendingCalls} pending
                </Badge>
              )}
              {completedCalls > 0 && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {completedCalls} completed
                </Badge>
              )}
              {failedCalls > 0 && (
                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                  <XCircle className="h-3 w-3 mr-1" />
                  {failedCalls} failed
                </Badge>
              )}
              
              <div className="w-16">
                <Progress value={getOverallProgress()} className="h-2" />
              </div>
            </div>
          </div>
        </AccordionTrigger>
        
        <AccordionContent className="px-4 pb-4">
          <div className="space-y-3">
            {toolCalls.map((toolCall, index) => (
              <ToolCallItem 
                key={toolCall.id}
                toolCall={toolCall}
                index={index + 1}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

interface ToolCallItemProps {
  toolCall: ToolCall;
  index: number;
}

function ToolCallItem({ toolCall, index }: ToolCallItemProps) {
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  
  const getToolIcon = (toolName: string) => {
    const iconMap: Record<string, React.ComponentType<any>> = {
      search_bills: Search,
      search_executive_actions: Search,
      get_bill_details: FileText,
      get_available_sponsors: Database,
      get_available_topics: Database,
    };
    return iconMap[toolName] || Search;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'in_progress':
        return <RotateCcw className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getHumanReadableStage = (stage?: string) => {
    const stageMap: Record<string, string> = {
      'preparing_search': 'Preparing search...',
      'executing_query': 'Searching database...',
      'processing_results': 'Processing results...',
      'refining_search': 'Refining search...',
      'finalizing': 'Finalizing results...',
    };
    return stage ? stageMap[stage] || stage : '';
  };

  const IconComponent = getToolIcon(toolCall.name);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {index}
            </Badge>
            <IconComponent className="h-4 w-4" />
            <span className="font-medium text-sm">{toolCall.name}</span>
            {getStatusIcon(toolCall.status)}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {toolCall.duration && (
              <span>{formatDuration(toolCall.duration)}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
              className="h-6 w-6 p-0"
            >
              <ChevronDown 
                className={cn(
                  "h-3 w-3 transition-transform",
                  isDetailsExpanded && "rotate-180"
                )}
              />
            </Button>
          </div>
        </div>
        
        <div className="space-y-2">
          <Badge 
            variant="outline" 
            className={cn("text-xs", getStatusColor(toolCall.status))}
          >
            {toolCall.status.replace('_', ' ')}
          </Badge>
          
          {toolCall.stage && (
            <div className="text-sm text-muted-foreground">
              {getHumanReadableStage(toolCall.stage)}
            </div>
          )}
          
          {toolCall.metadata && (
            <div className="text-sm text-muted-foreground space-y-1">
              {toolCall.metadata.query && (
                <div>Query: "{toolCall.metadata.query}"</div>
              )}
              {toolCall.metadata.iteration && toolCall.metadata.max_iterations && (
                <div>
                  Iteration: {toolCall.metadata.iteration}/{toolCall.metadata.max_iterations}
                </div>
              )}
              {toolCall.metadata.resultCount !== undefined && (
                <div>Results found: {toolCall.metadata.resultCount}</div>
              )}
              {toolCall.metadata.total_results !== undefined && (
                <div>Total results: {toolCall.metadata.total_results}</div>
              )}
            </div>
          )}
        </div>
        
        {isDetailsExpanded && (
          <CardContent className="p-0 pt-3">
            <Tabs defaultValue="metadata" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
                <TabsTrigger value="result">Result</TabsTrigger>
              </TabsList>
              
              <TabsContent value="metadata" className="mt-3">
                <div className="text-xs bg-muted/50 p-3 rounded border">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify({
                      arguments: toolCall.arguments,
                      metadata: toolCall.metadata,
                    }, null, 2)}
                  </pre>
                </div>
              </TabsContent>
              
              <TabsContent value="result" className="mt-3">
                {toolCall.result ? (
                  <div className="text-xs bg-muted/50 p-3 rounded border">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(toolCall.result, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground p-3 border rounded">
                    No result available
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
      </CardHeader>
    </Card>
  );
}