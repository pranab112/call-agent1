
export interface KnowledgeBase {
  companyName: string;
  content: string;
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
  summary: string;
  transcript: TranscriptItem[];
  sentimentScore: number;
  status: 'Resolved' | 'Follow-up Needed' | 'Transferred';
  transferDestination?: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  plan: 'Standard' | 'Premium' | 'Enterprise';
  accountValue: string;
  lastInteraction: string;
  status: 'Active' | 'Churn Risk' | 'New';
  history: InteractionRecord[];
}

export interface SipConfig {
    username: string;
    password?: string;
    domain: string;
    websocketUrl: string;
    isConnected: boolean;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}
