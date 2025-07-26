# Tool Call Feedback System

## Executive Summary

The tool call feedback system provides real-time, human-readable updates about database searches and tool executions. Using SSE streaming and accordion UI components, users can track search progress, understand what data is being retrieved, and see the reasoning behind search refinements.

## Core Design Principles

### Transparency Through Visibility
- **Real-time Updates**: Show search progress as it happens
- **Human-readable Labels**: "Searching for healthcare bills..." instead of raw JSON
- **Contextual Information**: Display search parameters and result counts
- **Iteration Tracking**: Show search refinement progress

### Non-intrusive Feedback
- **Collapsible Interface**: Accordion design for optional detail viewing
- **Progressive Disclosure**: Summary first, details on demand
- **Clean Visual Hierarchy**: Clear separation between tool calls and chat content

## SSE Event Format

### Tool Call Event Structure

```typescript
// SSE message types for tool feedback
interface ToolCallEvent {
  type: 'tool_call';
  data: {
    id: string; // Unique identifier for this tool call
    tool_name: string; // e.g., "search_bills"
    status: ToolCallStatus;
    stage: ToolCallStage;
    metadata: ToolCallMetadata;
    timestamp: string;
  };
}

type ToolCallStatus = 
  | 'starting'
  | 'in_progress' 
  | 'completed'
  | 'failed'
  | 'retrying';

type ToolCallStage = 
  | 'preparing_search'
  | 'executing_query'
  | 'processing_results'
  | 'refining_search'
  | 'finalizing';

interface ToolCallMetadata {
  // For search tools
  query?: string;
  iteration?: number;
  max_iterations?: number;
  filters_applied?: string[];
  results_found?: number;
  total_results?: number;
  
  // For context discovery tools
  context_type?: 'sponsors' | 'topics' | 'statuses';
  options_found?: number;
  
  // For content retrieval tools
  content_id?: string;
  content_type?: 'bill' | 'executive_action';
  
  // Error information
  error_message?: string;
  retry_count?: number;
}
```

### Event Sequence Examples

```typescript
// Example: Iterative bill search
const searchEventSequence = [
  {
    type: 'tool_call',
    data: {
      id: 'search_001',
      tool_name: 'search_bills',
      status: 'starting',
      stage: 'preparing_search',
      metadata: {
        query: 'healthcare legislation',
        iteration: 1,
        max_iterations: 20
      },
      timestamp: '2025-01-15T10:30:00Z'
    }
  },
  {
    type: 'tool_call',
    data: {
      id: 'search_001',
      tool_name: 'search_bills',
      status: 'in_progress',
      stage: 'executing_query',
      metadata: {
        query: 'healthcare legislation',
        iteration: 1,
        filters_applied: ['status:active', 'chamber:both']
      },
      timestamp: '2025-01-15T10:30:01Z'
    }
  },
  {
    type: 'tool_call',
    data: {
      id: 'search_001',
      tool_name: 'search_bills',
      status: 'in_progress',
      stage: 'processing_results',
      metadata: {
        iteration: 1,
        results_found: 15,
        total_results: 15
      },
      timestamp: '2025-01-15T10:30:02Z'
    }
  },
  {
    type: 'tool_call',
    data: {
      id: 'search_001',
      tool_name: 'search_bills',
      status: 'in_progress',
      stage: 'refining_search',
      metadata: {
        iteration: 2,
        query: 'healthcare medicare medicaid legislation',
        total_results: 15
      },
      timestamp: '2025-01-15T10:30:03Z'
    }
  },
  {
    type: 'tool_call',
    data: {
      id: 'search_001',
      tool_name: 'search_bills',
      status: 'completed',
      stage: 'finalizing',
      metadata: {
        iteration: 3,
        total_results: 28,
        final_query: 'healthcare medicare medicaid aca legislation'
      },
      timestamp: '2025-01-15T10:30:05Z'
    }
  }
];
```

## Frontend State Management

### Tool Call State Store

```typescript
// Tool call state management with Zustand
interface ToolCallState {
  activeToolCalls: Map<string, ToolCall>;
  completedToolCalls: ToolCall[];
  isExpanded: Map<string, boolean>;
  
  // Actions
  addToolCall: (toolCall: ToolCall) => void;
  updateToolCall: (id: string, update: Partial<ToolCall>) => void;
  completeToolCall: (id: string) => void;
  toggleExpanded: (id: string) => void;
  clearToolCalls: () => void;
}

interface ToolCall {
  id: string;
  tool_name: string;
  status: ToolCallStatus;
  stage: ToolCallStage;
  start_time: Date;
  end_time?: Date;
  events: ToolCallEvent[];
  summary: ToolCallSummary;
}

interface ToolCallSummary {
  title: string;
  description: string;
  progress_percentage: number;
  results_preview?: string;
  error_message?: string;
}

export const useToolCallStore = create<ToolCallState>((set, get) => ({
  activeToolCalls: new Map(),
  completedToolCalls: [],
  isExpanded: new Map(),

  addToolCall: (toolCall) => set((state) => {
    const newActiveToolCalls = new Map(state.activeToolCalls);
    newActiveToolCalls.set(toolCall.id, toolCall);
    return { activeToolCalls: newActiveToolCalls };
  }),

  updateToolCall: (id, update) => set((state) => {
    const newActiveToolCalls = new Map(state.activeToolCalls);
    const existing = newActiveToolCalls.get(id);
    if (existing) {
      newActiveToolCalls.set(id, { ...existing, ...update });
    }
    return { activeToolCalls: newActiveToolCalls };
  }),

  completeToolCall: (id) => set((state) => {
    const toolCall = state.activeToolCalls.get(id);
    if (!toolCall) return state;

    const newActiveToolCalls = new Map(state.activeToolCalls);
    newActiveToolCalls.delete(id);

    return {
      activeToolCalls: newActiveToolCalls,
      completedToolCalls: [...state.completedToolCalls, { 
        ...toolCall, 
        end_time: new Date() 
      }]
    };
  }),

  toggleExpanded: (id) => set((state) => {
    const newIsExpanded = new Map(state.isExpanded);
    newIsExpanded.set(id, !newIsExpanded.get(id));
    return { isExpanded: newIsExpanded };
  }),

  clearToolCalls: () => set({
    activeToolCalls: new Map(),
    completedToolCalls: [],
    isExpanded: new Map()
  })
}));
```

### SSE Event Processing

```typescript
// SSE event handler for tool call updates
export class ToolCallEventProcessor {
  constructor(private toolCallStore: ToolCallState) {}

  processToolCallEvent(event: ToolCallEvent): void {
    const { id, tool_name, status, stage, metadata } = event.data;

    // Get or create tool call
    let toolCall = this.toolCallStore.activeToolCalls.get(id);
    
    if (!toolCall) {
      toolCall = this.createToolCall(event);
      this.toolCallStore.addToolCall(toolCall);
    }

    // Update tool call with new event
    const updatedToolCall = this.updateToolCallWithEvent(toolCall, event);
    this.toolCallStore.updateToolCall(id, updatedToolCall);

    // Mark as completed if status is final
    if (status === 'completed' || status === 'failed') {
      this.toolCallStore.completeToolCall(id);
    }
  }

  private createToolCall(event: ToolCallEvent): ToolCall {
    return {
      id: event.data.id,
      tool_name: event.data.tool_name,
      status: event.data.status,
      stage: event.data.stage,
      start_time: new Date(event.data.timestamp),
      events: [event],
      summary: this.generateSummary(event)
    };
  }

  private updateToolCallWithEvent(
    toolCall: ToolCall, 
    event: ToolCallEvent
  ): Partial<ToolCall> {
    return {
      status: event.data.status,
      stage: event.data.stage,
      events: [...toolCall.events, event],
      summary: this.generateSummary(event, toolCall.events)
    };
  }

  private generateSummary(
    latestEvent: ToolCallEvent, 
    previousEvents: ToolCallEvent[] = []
  ): ToolCallSummary {
    const { tool_name, status, stage, metadata } = latestEvent.data;
    
    const summaryGenerators = {
      search_bills: () => this.generateSearchSummary(latestEvent, previousEvents),
      get_available_sponsors: () => this.generateContextSummary(latestEvent, 'sponsors'),
      get_bill_details: () => this.generateDetailsSummary(latestEvent),
      search_executive_actions: () => this.generateExecutiveSearchSummary(latestEvent)
    };

    const generator = summaryGenerators[tool_name] || (() => this.generateGenericSummary(latestEvent));
    return generator();
  }

  private generateSearchSummary(
    event: ToolCallEvent, 
    previousEvents: ToolCallEvent[]
  ): ToolCallSummary {
    const { status, stage, metadata } = event.data;
    
    const titles = {
      preparing_search: 'Preparing search...',
      executing_query: 'Searching bills...',
      processing_results: 'Processing results...',
      refining_search: 'Refining search...',
      finalizing: 'Search complete'
    };

    const title = titles[stage] || 'Searching...';
    
    let description = '';
    let progress = 0;

    if (metadata.query) {
      description = `Query: "${metadata.query}"`;
    }

    if (metadata.iteration && metadata.max_iterations) {
      progress = (metadata.iteration / metadata.max_iterations) * 100;
      description += ` (iteration ${metadata.iteration}/${metadata.max_iterations})`;
    }

    if (metadata.results_found !== undefined) {
      description += ` - Found ${metadata.results_found} results`;
    }

    if (status === 'completed' && metadata.total_results) {
      description = `Found ${metadata.total_results} bills total`;
      progress = 100;
    }

    return {
      title,
      description,
      progress_percentage: progress,
      results_preview: this.generateResultsPreview(metadata),
      error_message: metadata.error_message
    };
  }

  private generateResultsPreview(metadata: ToolCallMetadata): string | undefined {
    if (metadata.total_results && metadata.total_results > 0) {
      return `${metadata.total_results} bills found`;
    }
    
    if (metadata.options_found && metadata.context_type) {
      return `${metadata.options_found} ${metadata.context_type} available`;
    }

    return undefined;
  }
}
```

## UI Components

### Tool Call Accordion Component

```tsx
// Tool call feedback accordion component
import { ChevronDown, ChevronRight, Search, Database, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ToolCallAccordionProps {
  toolCall: ToolCall;
  isExpanded: boolean;
  onToggle: () => void;
}

export const ToolCallAccordion: React.FC<ToolCallAccordionProps> = ({
  toolCall,
  isExpanded,
  onToggle
}) => {
  const getToolIcon = (toolName: string) => {
    const iconMap = {
      search_bills: Search,
      search_executive_actions: Search,
      get_bill_details: FileText,
      get_available_sponsors: Database,
      get_available_topics: Database
    };
    const IconComponent = iconMap[toolName] || Search;
    return <IconComponent className="h-4 w-4" />;
  };

  const getStatusColor = (status: ToolCallStatus) => {
    const colorMap = {
      starting: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      retrying: 'bg-orange-100 text-orange-800'
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDuration = (startTime: Date, endTime?: Date) => {
    const end = endTime || new Date();
    const duration = end.getTime() - startTime.getTime();
    return `${(duration / 1000).toFixed(1)}s`;
  };

  return (
    <Card className="my-2 border-l-4 border-l-blue-500">
      <CardHeader 
        className="pb-2 cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getToolIcon(toolCall.tool_name)}
            <div>
              <h4 className="font-medium text-sm">{toolCall.summary.title}</h4>
              <p className="text-xs text-gray-600">{toolCall.summary.description}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(toolCall.status)}>
              {toolCall.status.replace('_', ' ')}
            </Badge>
            
            {toolCall.summary.progress_percentage > 0 && (
              <div className="w-16">
                <Progress 
                  value={toolCall.summary.progress_percentage} 
                  className="h-2"
                />
              </div>
            )}
            
            <span className="text-xs text-gray-500">
              {formatDuration(toolCall.start_time, toolCall.end_time)}
            </span>
            
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          <ToolCallDetails toolCall={toolCall} />
        </CardContent>
      )}
    </Card>
  );
};
```

### Tool Call Details Component

```tsx
// Detailed view of tool call events
interface ToolCallDetailsProps {
  toolCall: ToolCall;
}

export const ToolCallDetails: React.FC<ToolCallDetailsProps> = ({ toolCall }) => {
  return (
    <div className="space-y-3">
      {/* Results Preview */}
      {toolCall.summary.results_preview && (
        <div className="bg-green-50 p-3 rounded border">
          <h5 className="font-medium text-sm text-green-800 mb-1">Results</h5>
          <p className="text-sm text-green-700">{toolCall.summary.results_preview}</p>
        </div>
      )}

      {/* Error Message */}
      {toolCall.summary.error_message && (
        <div className="bg-red-50 p-3 rounded border">
          <h5 className="font-medium text-sm text-red-800 mb-1">Error</h5>
          <p className="text-sm text-red-700">{toolCall.summary.error_message}</p>
        </div>
      )}

      {/* Event Timeline */}
      <div>
        <h5 className="font-medium text-sm mb-2">Timeline</h5>
        <div className="space-y-2">
          {toolCall.events.map((event, index) => (
            <div key={index} className="flex items-start gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{event.data.stage}</span>
                  <Badge variant="outline" className="text-xs">
                    {event.data.status}
                  </Badge>
                </div>
                
                {/* Event Metadata */}
                {event.data.metadata && (
                  <div className="mt-1 text-xs text-gray-600">
                    <EventMetadata metadata={event.data.metadata} />
                  </div>
                )}
              </div>
              
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {new Date(event.data.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const EventMetadata: React.FC<{ metadata: ToolCallMetadata }> = ({ metadata }) => {
  const items = [];

  if (metadata.query) {
    items.push(`Query: "${metadata.query}"`);
  }
  
  if (metadata.iteration) {
    items.push(`Iteration: ${metadata.iteration}`);
  }
  
  if (metadata.results_found !== undefined) {
    items.push(`Results: ${metadata.results_found}`);
  }
  
  if (metadata.filters_applied?.length > 0) {
    items.push(`Filters: ${metadata.filters_applied.join(', ')}`);
  }

  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <div key={index}>{item}</div>
      ))}
    </div>
  );
};
```

### Tool Call Container

```tsx
// Container component for all tool call feedback
export const ToolCallFeedback: React.FC = () => {
  const { activeToolCalls, completedToolCalls, isExpanded, toggleExpanded } = useToolCallStore();

  // Show only recent completed tool calls (last 5)
  const recentCompleted = completedToolCalls.slice(-5);
  
  // Convert Map to Array for rendering
  const activeToolCallsArray = Array.from(activeToolCalls.values());

  const allToolCalls = [...activeToolCallsArray, ...recentCompleted];

  if (allToolCalls.length === 0) {
    return null;
  }

  return (
    <div className="my-4 space-y-2">
      <h3 className="text-sm font-medium text-gray-700 mb-2">
        Search Activity
      </h3>
      
      {allToolCalls.map((toolCall) => (
        <ToolCallAccordion
          key={toolCall.id}
          toolCall={toolCall}
          isExpanded={isExpanded.get(toolCall.id) || false}
          onToggle={() => toggleExpanded(toolCall.id)}
        />
      ))}
    </div>
  );
};
```

## Backend Implementation

### SSE Tool Event Emission

```typescript
// Backend service for emitting tool call events
export class ToolCallEventEmitter {
  constructor(private sseWriter: SSEWriter) {}

  emitToolCallStart(
    toolId: string,
    toolName: string,
    metadata: Partial<ToolCallMetadata> = {}
  ): void {
    this.sseWriter.write({
      type: 'tool_call',
      data: {
        id: toolId,
        tool_name: toolName,
        status: 'starting',
        stage: 'preparing_search',
        metadata,
        timestamp: new Date().toISOString()
      }
    });
  }

  emitToolCallProgress(
    toolId: string,
    stage: ToolCallStage,
    metadata: Partial<ToolCallMetadata> = {}
  ): void {
    this.sseWriter.write({
      type: 'tool_call',
      data: {
        id: toolId,
        tool_name: '', // Will be filled by client state
        status: 'in_progress',
        stage,
        metadata,
        timestamp: new Date().toISOString()
      }
    });
  }

  emitToolCallComplete(
    toolId: string,
    metadata: Partial<ToolCallMetadata> = {}
  ): void {
    this.sseWriter.write({
      type: 'tool_call',
      data: {
        id: toolId,
        tool_name: '',
        status: 'completed',
        stage: 'finalizing',
        metadata,
        timestamp: new Date().toISOString()
      }
    });
  }

  emitToolCallError(
    toolId: string,
    error: string,
    retryCount?: number
  ): void {
    this.sseWriter.write({
      type: 'tool_call',
      data: {
        id: toolId,
        tool_name: '',
        status: retryCount ? 'retrying' : 'failed',
        stage: 'finalizing',
        metadata: {
          error_message: error,
          retry_count: retryCount
        },
        timestamp: new Date().toISOString()
      }
    });
  }
}
```

### Integration with MCP Service

```typescript
// Modified MCP service with tool call feedback
export class MCPServiceWithFeedback extends MCPService {
  constructor(
    private eventEmitter: ToolCallEventEmitter
  ) {
    super();
  }

  async callToolWithFeedback(
    toolName: string, 
    args: any
  ): Promise<any> {
    const toolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Emit start event
      this.eventEmitter.emitToolCallStart(toolId, toolName, {
        query: args.query,
        iteration: args.iteration
      });

      // For search tools, emit progress updates
      if (toolName === 'search_bills' || toolName === 'search_executive_actions') {
        return await this.callSearchToolWithFeedback(toolId, toolName, args);
      }

      // For other tools, simple call
      this.eventEmitter.emitToolCallProgress(toolId, 'executing_query');
      const result = await this.callTool(toolName, args);
      
      this.eventEmitter.emitToolCallComplete(toolId, {
        results_found: Array.isArray(result) ? result.length : 1
      });

      return result;

    } catch (error) {
      this.eventEmitter.emitToolCallError(toolId, error.message);
      throw error;
    }
  }

  private async callSearchToolWithFeedback(
    toolId: string,
    toolName: string,
    args: any
  ): Promise<any> {
    // Emit query execution
    this.eventEmitter.emitToolCallProgress(toolId, 'executing_query', {
      query: args.query,
      iteration: args.iteration,
      filters_applied: this.extractFilters(args)
    });

    const result = await this.callTool(toolName, args);

    // Emit results processing
    this.eventEmitter.emitToolCallProgress(toolId, 'processing_results', {
      results_found: result.results?.length || 0,
      total_results: result.total_count
    });

    // Check if refinement is needed
    if (result.needsRefinement && args.iteration < 20) {
      this.eventEmitter.emitToolCallProgress(toolId, 'refining_search', {
        iteration: args.iteration + 1,
        total_results: result.total_count
      });
    } else {
      this.eventEmitter.emitToolCallComplete(toolId, {
        total_results: result.total_count,
        final_query: args.query
      });
    }

    return result;
  }

  private extractFilters(args: any): string[] {
    const filters = [];
    
    if (args.sponsors?.length > 0) {
      filters.push(`sponsors:${args.sponsors.length}`);
    }
    
    if (args.status) {
      filters.push(`status:${args.status}`);
    }
    
    if (args.date_range) {
      filters.push('date_range:applied');
    }
    
    return filters;
  }
}
```

This tool call feedback system provides comprehensive real-time visibility into search operations, helping users understand what's happening behind the scenes while maintaining a clean, non-intrusive interface.