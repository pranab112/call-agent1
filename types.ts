export interface KnowledgeBase {
  companyName: string;
  content: string;
}

export interface LogEntry {
  source: 'user' | 'agent' | 'system';
  message: string;
  timestamp: Date;
}

// Re-exporting necessary types from library if needed, or defining local shapes for state
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}