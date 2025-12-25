
import React, { useState, useEffect, useRef } from 'react';
import KnowledgePanel from './components/KnowledgePanel';
import CRMPanel from './components/CRMPanel';
import CallHistoryPanel from './components/CallHistoryPanel';
import ConnectPanel from './components/ConnectPanel';
import AgentInterface from './components/AgentInterface';
import { KnowledgeBase, CustomerProfile, InteractionRecord, SipConfig } from './types';
import { db } from './utils/db';
import * as SIP from 'sip.js';

const DEFAULT_KNOWLEDGE: KnowledgeBase = {
    companyName: "नमस्ते टेक्नोलोजी (Namaste Tech)",
    content: `Description: Nepal's leading software company.`
};

const DEFAULT_SIP_CONFIG: SipConfig = {
    username: '',
    password: '',
    domain: 'sip.linphone.org',
    websocketUrl: 'wss://sip.linphone.org',
    isConnected: false
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'config' | 'crm' | 'logs' | 'connect'>('config');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [knowledge, setKnowledge] = useState<KnowledgeBase>(() => db.getKnowledge(DEFAULT_KNOWLEDGE));
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [sipStream, setSipStream] = useState<MediaStream | null>(null);
  
  // SIP State
  const [sipConfig, setSipConfig] = useState<SipConfig>(DEFAULT_SIP_CONFIG);
  const [sipStatus, setSipStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'REGISTERED' | 'ERROR'>('DISCONNECTED');
  const [sipError, setSipError] = useState<string | null>(null);
  const userAgentRef = useRef<SIP.UserAgent | null>(null);

  useEffect(() => {
    db.saveKnowledge(knowledge);
  }, [knowledge]);

  useEffect(() => {
    const data = db.init();
    setCustomers(data);
  }, []);

  // Handle SIP Connection / Disconnection
  useEffect(() => {
    if (sipConfig.isConnected && sipConfig.username) {
        if (userAgentRef.current) return;

        setSipStatus('CONNECTING');
        
        try {
            const uri = SIP.UserAgent.makeURI(`sip:${sipConfig.username}@${sipConfig.domain}`);
            if (!uri) throw new Error("Invalid SIP URI");

            const options: SIP.UserAgentOptions = {
                uri: uri,
                transportOptions: { 
                    server: sipConfig.websocketUrl,
                    connectionTimeout: 10
                },
                authorizationUsername: sipConfig.username,
                authorizationPassword: sipConfig.password,
                logLevel: 'error',
                delegate: {
                    onInvite: (invitation) => {
                        console.log("Incoming Call Received!");
                        // We will handle the acceptance in the Agent UI or auto-accept
                        invitation.accept().then(() => {
                            const sessionDescriptionHandler = invitation.sessionDescriptionHandler as any;
                            if (sessionDescriptionHandler && sessionDescriptionHandler.peerConnection) {
                                // Get the remote stream from the peer connection
                                const remoteStream = new MediaStream();
                                sessionDescriptionHandler.peerConnection.getReceivers().forEach((receiver: any) => {
                                    if (receiver.track) remoteStream.addTrack(receiver.track);
                                });
                                setSipStream(remoteStream);
                            }
                        });
                        
                        invitation.stateChange.addListener((state) => {
                            if (state === SIP.SessionState.Terminated) {
                                setSipStream(null);
                            }
                        });
                    }
                }
            };

            const userAgent = new SIP.UserAgent(options);
            userAgentRef.current = userAgent;

            userAgent.start().then(() => {
                const registerer = new SIP.Registerer(userAgent);
                registerer.stateChange.addListener((newState) => {
                    if (newState === SIP.RegistererState.Registered) {
                        setSipStatus('REGISTERED');
                        setSipError(null);
                    }
                });
                return registerer.register();
            }).catch(err => {
                setSipStatus('ERROR');
                setSipError(err.message);
                setSipConfig(prev => ({ ...prev, isConnected: false }));
            });

        } catch (e: any) {
            setSipStatus('ERROR');
            setSipError(e.message);
            setSipConfig(prev => ({ ...prev, isConnected: false }));
        }

    } else {
        if (userAgentRef.current) {
            userAgentRef.current.stop();
            userAgentRef.current = null;
        }
        setSipStatus('DISCONNECTED');
        setSipStream(null);
    }
  }, [sipConfig.isConnected, sipConfig.username, sipConfig.password, sipConfig.domain, sipConfig.websocketUrl]);

  const handleCustomerUpdate = (updatedCustomers: CustomerProfile[]) => {
      setCustomers(updatedCustomers);
      db.saveCustomers(updatedCustomers);
  };

  const handleCallComplete = (customerId: string, record: InteractionRecord, newCustomerProfile?: CustomerProfile) => {
      // Standard call completion logic
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-black overflow-hidden relative">
      <div className={`transition-all duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} absolute md:relative z-40 h-full bg-slate-900 border-r border-slate-800 w-[85vw] md:w-[400px] flex flex-col`}>
         <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-col gap-4">
            <h1 className="text-white font-bold text-sm tracking-tight flex items-center gap-2">
               <div className="w-6 h-6 rounded bg-blue-600"></div> Studio Receptionist
            </h1>
            <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800">
               {['config', 'connect', 'crm', 'logs'].map(tab => (
                 <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase ${activeTab === tab ? 'bg-slate-800 text-blue-400' : 'text-slate-500'}`}>
                    {tab}
                 </button>
               ))}
            </div>
         </div>
         <div className="flex-1 overflow-hidden">
            {activeTab === 'config' && <KnowledgePanel knowledge={knowledge} setKnowledge={setKnowledge} disabled={false} />}
            {activeTab === 'connect' && (
                <ConnectPanel 
                    sipConfig={sipConfig} 
                    setSipConfig={setSipConfig} 
                    status={sipStatus}
                    error={sipError}
                />
            )}
            {activeTab === 'crm' && <CRMPanel customers={customers} onUpdate={handleCustomerUpdate} />}
            {activeTab === 'logs' && <CallHistoryPanel customers={customers} />}
         </div>
      </div>

      <div className="flex-1 h-full bg-slate-950 flex flex-col items-center justify-center p-4">
         <AgentInterface 
            knowledge={knowledge} 
            customers={customers}
            onCallComplete={handleCallComplete}
            externalStream={sipStream} 
         />
         <div className="mt-8 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${sipStatus === 'REGISTERED' ? 'bg-green-500 animate-pulse' : 'bg-slate-700'}`}></div>
            <p className="text-slate-600 text-[10px] uppercase tracking-widest font-bold">
                {sipStream ? "📞 Linphone Audio Connected" : `SIP Status: ${sipStatus}`}
            </p>
         </div>
      </div>
    </div>
  );
};

export default App;
