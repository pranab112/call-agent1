
export interface KnowledgeBase {
  companyName: string;
  content: string;
}

export interface LogEntry {
  source: 'user' | 'agent' | 'system';
  message: string;
  timestamp: Date;
}

export interface TranscriptItem {
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

export interface InteractionRecord {
  id: string;
  date: string;
  type: 'Inbound' | 'Outbound';
  duration: string;
  summary: string; // The last transcript item or a generated summary
  transcript: TranscriptItem[];
  sentimentScore: number;
  status: 'Resolved' | 'Follow-up Needed' | 'Transferred';
  transferDestination?: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string; // Key for lookup
  email: string;
  plan: 'Standard' | 'Premium' | 'Enterprise';
  accountValue: string;
  lastInteraction: string;
  status: 'Active' | 'Churn Risk' | 'New';
  history: InteractionRecord[];
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface SipConfig {
  username: string;
  password?: string;
  domain: string;
  websocketUrl: string;
  isConnected: boolean;
}
