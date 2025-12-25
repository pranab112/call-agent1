import React, { useState, useEffect } from 'react';
import KnowledgePanel from './components/KnowledgePanel';
import CRMPanel from './components/CRMPanel';
import CallHistoryPanel from './components/CallHistoryPanel';
import ConnectPanel from './components/ConnectPanel';
import AgentInterface from './components/AgentInterface';
import { KnowledgeBase, CustomerProfile, InteractionRecord } from './types';
import { db } from './utils/db';

const DEFAULT_KNOWLEDGE: KnowledgeBase = {
    companyName: "नमस्ते टेक्नोलोजी (Namaste Tech)",
    content: `विवरण:
नमस्ते टेक्नोलोजी नेपालको एक अग्रणी सफ्टवेयर र क्लाउड सेवा प्रदायक कम्पनी हो।

कार्यालय समय:
आइतबार - शुक्रबार: बिहान १०:०० - बेलुका ५:०० बजे सम्म
शनिबार: बिदा

सम्पर्क:
इमेल: support@namastetech.np
फोन: ९८००००००००
ठेगाना: बानेश्वर, काठमाडौँ।

कर्मचारी विवरण:
- राम शर्मा (बिक्री प्रबन्धक): एक्सटेन्सन १०१। हाल मिटिङमा हुनुहुन्छ।
- सीता अर्याल (प्राविधिक प्रमुख): एक्सटेन्सन १०२। उपलब्ध हुनुहुन्छ।
- रिसेप्शन डेस्क: एक्सटेन्सन ०।

प्राय: सोधिने प्रश्नहरू (FAQs):
प्रश्न: पासवर्ड कसरी रिसेट गर्ने?
उत्तर: कृपया हाम्रो वेबसाइट portal.namastetech.np मा जानुहोस् र "Forgot Password" मा क्लिक गर्नुहोस्।

प्रश्न: के तपाईँहरू २४ घण्टा सेवा दिनुहुन्छ?
उत्तर: हामी विशेष ग्राहकहरूलाई मात्र २४ घण्टा सेवा दिन्छौँ। अन्यका लागि कार्यालय समयमा सम्पर्क गर्नुहोस्।

नीतिहरू (Call Handling Policies):
- यदि फोन गर्ने व्यक्ति रिसाएमा, शान्त रहनुहोस् र सीता अर्याल (Ext 102) लाई कल ट्रान्सफर गर्ने प्रस्ताव गर्नुहोस्।
- यदि कसैले राम शर्मा वा "Sales" सँग कुरा गर्न चाहेमा, उहाँको एक्सटेन्सन १०१ मा कल ट्रान्सफर गर्नुहोस्।
- कर्मचारीहरूको व्यक्तिगत मोबाइल नम्बर नदिनुहोस्, सधैँ "transferCall" टुल प्रयोग गर्नुहोस्।`
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'config' | 'crm' | 'logs' | 'connect'>('config');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Knowledge Base State - Initialize from Local Storage
  const [knowledge, setKnowledge] = useState<KnowledgeBase>(() => {
      return db.getKnowledge(DEFAULT_KNOWLEDGE);
  });

  // Auto-save Knowledge Base when it changes
  useEffect(() => {
      db.saveKnowledge(knowledge);
  }, [knowledge]);

  // Customer Data State - Initialized as empty, loaded from DB via useEffect
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);

  // Load Data from Browser Database on Mount
  useEffect(() => {
    const data = db.init();
    setCustomers(data);
  }, []);

  // Generic handler for updating the customer list (Add/Edit/Delete)
  const handleCustomerUpdate = (updatedCustomers: CustomerProfile[]) => {
      setCustomers(updatedCustomers);
      db.saveCustomers(updatedCustomers);
  };

  const handleCallComplete = (customerId: string, record: InteractionRecord, newCustomerProfile?: CustomerProfile) => {
      // 1. Handle New/Unknown Caller (TEMP ID)
      if (customerId === 'TEMP' && newCustomerProfile) {
          const newId = `C-${Date.now()}`;
          const newCustomer: CustomerProfile = {
              ...newCustomerProfile,
              id: newId,
              history: [record],
              lastInteraction: 'Just now'
          };
          
          // Prepend new customer to list so they appear at the top
          handleCustomerUpdate([newCustomer, ...customers]);
      } 
      // 2. Handle Existing Customer
      else {
          const updatedCustomers = customers.map(c => {
              if (c.id === customerId) {
                  return {
                      ...c,
                      history: [...c.history, record],
                      lastInteraction: 'Just now'
                  };
              }
              return c;
          });
          handleCustomerUpdate(updatedCustomers);
      }
  };

  const handleResetDB = () => {
    if(window.confirm("Are you sure? This will delete all history and reset settings to default.")) {
        const resetData = db.reset(DEFAULT_KNOWLEDGE);
        setCustomers(resetData);
        setKnowledge(DEFAULT_KNOWLEDGE);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-black overflow-hidden relative">
      
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="absolute inset-0 bg-black/80 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Area (Tabs + Panels) */}
      <div className={`
          absolute md:relative z-40 h-full bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col
          transition-all duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${activeTab === 'crm' || activeTab === 'logs' ? 'w-[85vw] md:w-[900px]' : 'w-[85vw] md:w-[400px]'}
      `}>
         
         {/* Navigation Header */}
         <div className="flex flex-col border-b border-slate-800 bg-slate-900/50 p-4 gap-4 shrink-0">
             <div className="flex items-center justify-between px-2">
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </div>
                    <div>
                        <h1 className="text-white font-bold text-sm tracking-tight">Voice Receptionist</h1>
                        <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">System Online</span>
                        </div>
                    </div>
                 </div>
                 {/* Mobile Close Button */}
                 <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
             </div>

             {/* Tab Switcher */}
             <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800">
                <button 
                    onClick={() => setActiveTab('config')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'config' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Setup
                </button>
                <button 
                    onClick={() => setActiveTab('connect')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'connect' ? 'bg-slate-800 text-orange-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Connect
                </button>
                <button 
                    onClick={() => setActiveTab('crm')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'crm' ? 'bg-slate-800 text-purple-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    CRM
                </button>
                <button 
                    onClick={() => setActiveTab('logs')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'logs' ? 'bg-slate-800 text-green-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Logs
                </button>
             </div>
         </div>

         {/* Panel Content */}
         <div className="flex-1 overflow-hidden relative flex flex-col">
             {activeTab === 'config' ? (
                 <KnowledgePanel 
                   knowledge={knowledge} 
                   setKnowledge={setKnowledge} 
                   disabled={false}
                 />
             ) : activeTab === 'connect' ? (
                 <ConnectPanel />
             ) : activeTab === 'crm' ? (
                 <CRMPanel customers={customers} onUpdate={handleCustomerUpdate} />
             ) : (
                 <CallHistoryPanel customers={customers} />
             )}
             
             {/* Database Controls */}
             {(activeTab === 'crm' || activeTab === 'logs' || activeTab === 'config') && (
                 <div className="p-4 bg-slate-900/95 backdrop-blur border-t border-slate-800 shrink-0">
                     <button 
                        onClick={handleResetDB}
                        className="w-full py-3 flex items-center justify-center gap-2 text-[10px] text-red-400 border border-red-900/30 bg-red-950/20 hover:bg-red-900/30 rounded-lg uppercase font-bold tracking-wider transition-colors"
                     >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Reset Database
                     </button>
                 </div>
             )}
         </div>
      </div>

      {/* Main Agent View */}
      <div className="flex-1 h-full relative bg-slate-950 flex flex-col items-center justify-center p-4 transition-all duration-300">
         <div className="absolute top-4 left-4 z-10 md:hidden">
             {/* Mobile Toggle */}
             <button 
                onClick={() => setIsSidebarOpen(true)}
                className="text-slate-300 bg-slate-800/80 backdrop-blur border border-slate-700 p-2.5 rounded-xl hover:bg-slate-700 hover:text-white transition-all shadow-lg"
             >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
             </button>
         </div>
         
         <AgentInterface 
            knowledge={knowledge} 
            customers={customers}
            onCallComplete={handleCallComplete}
         />
         
         <p className="mt-8 text-slate-600 text-xs text-center max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
            This agent uses <span className="text-slate-400">Gemini Live API</span> with Realtime Audio Streaming. 
            <br/>Ensure your microphone permissions are enabled.
         </p>
      </div>
    </div>
  );
};

export default App;