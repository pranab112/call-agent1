
import React, { useState, useEffect } from 'react';
import KnowledgePanel from './components/KnowledgePanel';
import CRMPanel from './components/CRMPanel';
import CallHistoryPanel from './components/CallHistoryPanel';
import AgentInterface from './components/AgentInterface';
import ConnectPanel from './components/ConnectPanel';
import { KnowledgeBase, CustomerProfile, InteractionRecord } from './types';
import { db } from './utils/db';

const DEFAULT_KNOWLEDGE: KnowledgeBase = {
    companyName: "Your Office",
    content: `COMPANY DETAILS:
[Paste your office details here]
Name: Tech Solutions Nepal
Location: Kathmandu
Hours: 9 AM - 6 PM

SERVICES:
1. Web Development
2. App Development
3. AI Consulting

FAQ:
Q: What is the price?
A: It depends on the project, usually starting from Rs 50,000.

INSTRUCTIONS:
- You are a polite receptionist.
- Speak Nepali if the user speaks Nepali.
- Keep answers short.`
};

// Determine API Base URL robustly
// If running on localhost:5173 (Vite Dev), point to localhost:5050
// If running on port 5050 or Cloud (Production), use relative path
const isLocalDev = typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port === '5173';
const API_BASE = isLocalDev ? 'http://localhost:5050' : '';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'config' | 'crm' | 'logs' | 'connect'>('connect');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Knowledge Base State
  const [knowledge, setKnowledge] = useState<KnowledgeBase>(() => {
      return db.getKnowledge(DEFAULT_KNOWLEDGE);
  });

  // INITIAL SYNC: Ensure backend has data immediately on load
  useEffect(() => {
      const sync = async () => {
         try {
             await fetch(`${API_BASE}/settings`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     companyName: knowledge.companyName,
                     knowledge: knowledge.content
                 })
             });
             console.log("✅ Initial Data Sync Complete");
         } catch (e) {
             console.log("⏳ Waiting for backend server...");
         }
      };
      sync();
  }, []);

  // Sync on Change
  useEffect(() => {
      db.saveKnowledge(knowledge);
      const timeoutId = setTimeout(async () => {
         try {
             await fetch(`${API_BASE}/settings`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     companyName: knowledge.companyName,
                     knowledge: knowledge.content
                 })
             });
         } catch (e) {}
      }, 1000);
      return () => clearTimeout(timeoutId);
  }, [knowledge]);

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);

  useEffect(() => {
    const data = db.init();
    setCustomers(data);
  }, []);

  const handleCustomerUpdate = (updatedCustomers: CustomerProfile[]) => {
      setCustomers(updatedCustomers);
      db.saveCustomers(updatedCustomers);
  };

  const handleCallComplete = (customerId: string, record: InteractionRecord, newCustomerProfile?: CustomerProfile) => {
      if (customerId === 'TEMP' && newCustomerProfile) {
          const newId = `C-${Date.now()}`;
          const newCustomer: CustomerProfile = { ...newCustomerProfile, id: newId, history: [record], lastInteraction: 'Just now' };
          handleCustomerUpdate([newCustomer, ...customers]);
      } else {
          const updatedCustomers = customers.map(c => c.id === customerId ? { ...c, history: [...c.history, record], lastInteraction: 'Just now' } : c);
          handleCustomerUpdate(updatedCustomers);
      }
  };

  const handleResetDB = () => {
    if(window.confirm("Reset all data?")) {
        const resetData = db.reset(DEFAULT_KNOWLEDGE);
        setCustomers(resetData);
        setKnowledge(DEFAULT_KNOWLEDGE);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-black overflow-hidden relative">
      {isSidebarOpen && <div className="absolute inset-0 bg-black/80 z-30 md:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />}

      <div className={`absolute md:relative z-40 h-full bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${activeTab === 'crm' || activeTab === 'logs' ? 'w-[85vw] md:w-[900px]' : 'w-[85vw] md:w-[400px]'}`}>
         <div className="flex flex-col border-b border-slate-800 bg-slate-900/50 p-4 gap-4 shrink-0">
             <div className="flex items-center justify-between px-2">
                 <h1 className="text-white font-bold text-sm tracking-tight">AI Receptionist</h1>
                 <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
             </div>
             <div className="grid grid-cols-4 bg-slate-950/50 p-1 rounded-xl border border-slate-800 gap-1">
                <button onClick={() => setActiveTab('config')} className={`py-2 rounded-lg text-[10px] font-bold uppercase ${activeTab === 'config' ? 'bg-slate-800 text-blue-400' : 'text-slate-500'}`}>Setup</button>
                <button onClick={() => setActiveTab('connect')} className={`py-2 rounded-lg text-[10px] font-bold uppercase ${activeTab === 'connect' ? 'bg-slate-800 text-yellow-400' : 'text-slate-500'}`}>Connect</button>
                <button onClick={() => setActiveTab('crm')} className={`py-2 rounded-lg text-[10px] font-bold uppercase ${activeTab === 'crm' ? 'bg-slate-800 text-purple-400' : 'text-slate-500'}`}>CRM</button>
                <button onClick={() => setActiveTab('logs')} className={`py-2 rounded-lg text-[10px] font-bold uppercase ${activeTab === 'logs' ? 'bg-slate-800 text-green-400' : 'text-slate-500'}`}>Logs</button>
             </div>
         </div>

         <div className="flex-1 overflow-hidden relative flex flex-col">
             {activeTab === 'config' ? <KnowledgePanel knowledge={knowledge} setKnowledge={setKnowledge} disabled={false} /> : 
              activeTab === 'connect' ? <ConnectPanel /> :
              activeTab === 'crm' ? <CRMPanel customers={customers} onUpdate={handleCustomerUpdate} /> : 
              <CallHistoryPanel customers={customers} />}
             
             {(activeTab === 'crm' || activeTab === 'logs' || activeTab === 'config') && (
                 <div className="p-4 bg-slate-900/95 border-t border-slate-800 shrink-0">
                     <button onClick={handleResetDB} className="w-full py-3 text-[10px] text-red-400 border border-red-900/30 bg-red-950/20 rounded-lg uppercase font-bold">Reset Database</button>
                 </div>
             )}
         </div>
      </div>

      <div className="flex-1 h-full relative bg-slate-950 flex flex-col items-center justify-center p-4">
         <div className="absolute top-4 left-4 z-10 md:hidden">
             <button onClick={() => setIsSidebarOpen(true)} className="text-slate-300 bg-slate-800/80 p-2.5 rounded-xl"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
         </div>
         <AgentInterface knowledge={knowledge} customers={customers} onCallComplete={handleCallComplete} />
      </div>
    </div>
  );
};

export default App;
