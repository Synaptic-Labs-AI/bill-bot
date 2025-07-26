import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Message, ToolCall, Citation, SSEEvent } from '@/types';

export interface SSEConnection {
  eventSource?: EventSource;
  connectionId: string;
  isConnected: boolean;
  reconnectAttempts: number;
}

interface ChatState {
  // State
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  currentSessionId: string | null;
  
  // SSE Connection
  sseConnection: SSEConnection | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  
  // UI State
  toolCallsExpanded: Record<string, boolean>;
  citationsExpanded: Record<string, boolean>;
  
  // Actions
  startNewSession: () => void;
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  
  // Message management
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendToMessage: (id: string, content: string) => void;
  addToolCall: (messageId: string, toolCall: ToolCall) => void;
  updateToolCall: (messageId: string, toolCallId: string, updates: Partial<ToolCall>) => void;
  addCitation: (messageId: string, citation: Citation) => void;
  
  // UI actions
  toggleToolCalls: (messageId: string) => void;
  toggleCitations: (messageId: string) => void;
  setError: (error: string | null) => void;
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
  
  // SSE handling
  handleSSEEvent: (event: SSEEvent) => void;
}

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      // Initial state
      messages: [],
      isLoading: false,
      isStreaming: false,
      error: null,
      currentSessionId: null,
      sseConnection: null,
      connectionStatus: 'disconnected',
      toolCallsExpanded: {},
      citationsExpanded: {},

      // Start new session
      startNewSession: () => {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        set({
          currentSessionId: sessionId,
          messages: [],
          error: null,
          toolCallsExpanded: {},
          citationsExpanded: {},
          isLoading: false,
          isStreaming: false,
        });
      },

      // Send message and establish SSE connection
      sendMessage: async (content: string) => {
        const state = get();
        const sessionId = state.currentSessionId || crypto.randomUUID();
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (!state.currentSessionId) {
          set({ currentSessionId: sessionId });
        }

        // Add user message
        const userMessageId = get().addMessage({
          content,
          role: 'user',
        });
        
        set({
          isLoading: true,
          error: null,
          connectionStatus: 'connecting',
        });

        try {
          // Create EventSource for SSE
          const eventSource = new EventSource(
            `/api/chat/stream?sessionId=${sessionId}&connectionId=${connectionId}`
          );

          set({
            sseConnection: {
              eventSource,
              connectionId,
              isConnected: true,
              reconnectAttempts: 0,
            },
            connectionStatus: 'connected',
          });

          // Setup event listeners
          eventSource.onopen = () => {
            set({ connectionStatus: 'connected' });
          };

          eventSource.onmessage = (event) => {
            try {
              const sseEvent: SSEEvent = JSON.parse(event.data);
              get().handleSSEEvent(sseEvent);
            } catch (error) {
              console.error('Failed to parse SSE event:', error);
            }
          };

          eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
            set({ 
              connectionStatus: 'error',
              error: 'Connection lost. Please try again.',
              isLoading: false,
              isStreaming: false,
            });
            eventSource.close();
          };

          // Send the message to start processing
          await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: content,
              sessionId,
              connectionId,
            }),
          });

        } catch (error) {
          set({ 
            error: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isLoading: false,
            connectionStatus: 'error',
          });
        }
      },

      stopGeneration: () => {
        const state = get();
        
        if (state.sseConnection?.eventSource) {
          state.sseConnection.eventSource.close();
        }
        
        set({
          isLoading: false,
          isStreaming: false,
          sseConnection: null,
          connectionStatus: 'disconnected',
        });
      },

      clearMessages: () => {
        set({
          messages: [],
          toolCallsExpanded: {},
          citationsExpanded: {},
        });
      },

      // Message management actions
      addMessage: (message) => {
        const id = crypto.randomUUID();
        set(state => ({
          messages: [
            ...state.messages,
            {
              ...message,
              id,
              timestamp: new Date(),
            },
          ],
        }));
        return id;
      },

      updateMessage: (id, updates) => {
        set(state => ({
          messages: state.messages.map(msg =>
            msg.id === id ? { ...msg, ...updates } : msg
          ),
        }));
      },

      appendToMessage: (id, content) => {
        set(state => ({
          messages: state.messages.map(msg =>
            msg.id === id 
              ? { ...msg, content: msg.content + content }
              : msg
          ),
        }));
      },

      addToolCall: (messageId, toolCall) => {
        set(state => ({
          messages: state.messages.map(msg =>
            msg.id === messageId
              ? {
                  ...msg,
                  toolCalls: [...(msg.toolCalls || []), toolCall],
                }
              : msg
          ),
        }));
      },

      updateToolCall: (messageId, toolCallId, updates) => {
        set(state => ({
          messages: state.messages.map(msg =>
            msg.id === messageId
              ? {
                  ...msg,
                  toolCalls: msg.toolCalls?.map(call =>
                    call.id === toolCallId ? { ...call, ...updates } : call
                  ),
                }
              : msg
          ),
        }));
      },

      addCitation: (messageId, citation) => {
        set(state => ({
          messages: state.messages.map(msg =>
            msg.id === messageId
              ? {
                  ...msg,
                  citations: [...(msg.citations || []), citation],
                }
              : msg
          ),
        }));
      },

      // UI actions
      toggleToolCalls: (messageId) => {
        set(state => ({
          toolCallsExpanded: {
            ...state.toolCallsExpanded,
            [messageId]: !state.toolCallsExpanded[messageId],
          },
        }));
      },

      toggleCitations: (messageId) => {
        set(state => ({
          citationsExpanded: {
            ...state.citationsExpanded,
            [messageId]: !state.citationsExpanded[messageId],
          },
        }));
      },

      setError: (error) => {
        set({ error });
      },

      setConnectionStatus: (status) => {
        set({ connectionStatus: status });
      },

      // SSE event handling
      handleSSEEvent: (event) => {
        const state = get();
        
        switch (event.type) {
          case 'start':
            // Assistant message started
            const assistantMessageId = get().addMessage({
              content: '',
              role: 'assistant',
              isStreaming: true,
              toolCalls: [],
              citations: [],
            });
            
            set({ isStreaming: true });
            break;

          case 'content':
            // Append content to the last assistant message
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              get().appendToMessage(lastMessage.id, event.data.content);
            }
            break;

          case 'tool_call':
            // Add or update tool call
            const toolCallData = event.data;
            const currentMessage = state.messages[state.messages.length - 1];
            
            if (currentMessage && currentMessage.role === 'assistant') {
              const existingToolCall = currentMessage.toolCalls?.find(
                call => call.id === toolCallData.id
              );
              
              if (existingToolCall) {
                // Update existing tool call
                get().updateToolCall(currentMessage.id, toolCallData.id, {
                  status: toolCallData.status as any,
                  stage: toolCallData.stage,
                  metadata: toolCallData.metadata,
                });
              } else {
                // Add new tool call
                get().addToolCall(currentMessage.id, {
                  id: toolCallData.id,
                  name: toolCallData.tool_name,
                  arguments: {},
                  status: toolCallData.status as any,
                  stage: toolCallData.stage,
                  timestamp: new Date(),
                  metadata: toolCallData.metadata,
                });
              }
            }
            break;

          case 'citation':
            // Add citation to the last assistant message
            const citationMessage = state.messages[state.messages.length - 1];
            if (citationMessage && citationMessage.role === 'assistant') {
              get().addCitation(citationMessage.id, event.data);
            }
            break;

          case 'error':
            set({
              error: event.data.error,
              isLoading: false,
              isStreaming: false,
            });
            break;

          case 'end':
            // Finalize the assistant message
            const finalMessage = state.messages[state.messages.length - 1];
            if (finalMessage && finalMessage.role === 'assistant') {
              get().updateMessage(finalMessage.id, { 
                isStreaming: false,
                metadata: {
                  tokens: event.data.totalTokens,
                  cost: event.data.cost,
                  duration: event.data.duration,
                },
              });
            }
            
            set({
              isLoading: false,
              isStreaming: false,
            });
            
            // Close SSE connection
            if (state.sseConnection?.eventSource) {
              state.sseConnection.eventSource.close();
            }
            set({ sseConnection: null, connectionStatus: 'disconnected' });
            break;
        }
      },
    }),
    { name: 'chat-store' }
  )
);