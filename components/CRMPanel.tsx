import React, { useState, useEffect } from 'react';
import { CustomerProfile, InteractionRecord } from '../types';

interface CRMPanelProps {
  customers: CustomerProfile[];
}

const CRMPanel: React.FC<CRMPanelProps> = ({ customers }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Auto-select first customer if none selected and customers exist
  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  const getSentimentColor = (score: number) => {
    if (score < 30) return 'text-red-400';
    if (score < 60) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-500/10 border-green-500/20 text-green-400';
      case 'Churn Risk': return 'bg-red-500/10 border-red-500/20 text-red-400';
      case 'New': return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
      default: return 'bg-slate-800 text-slate-400';
    }
  };

  return (
    <div className="flex h-full bg-slate-900 w-full overflow-hidden flex-col md:flex-row">
      
      {/* Customer List Column */}
      <div className="w-full md:w-[35%] border-r border-slate-800 flex flex-col bg-slate-900">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            Customers ({customers.length})
          </h2>
        </div>
        <div className="overflow-y-auto custom-scrollbar flex-1 p-2 space-y-1">
          {customers.map(customer => (
            <div 
              key={customer.id}
              onClick={() => setSelectedCustomerId(customer.id)}
              className={`p-3 rounded-lg cursor-pointer transition-all duration-200 border ${selectedCustomerId === customer.id ? 'bg-slate-800 border-blue-500/50 shadow-md' : 'bg-transparent border-transparent hover:bg-slate-800/50 hover:border-slate-700'}`}
            >
              <div className="flex justify-between items-start mb-1">
                 <h3 className={`text-sm font-bold ${selectedCustomerId === customer.id ? 'text-white' : 'text-slate-300'}`}>{customer.name}</h3>
                 <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getStatusStyle(customer.status)}`}>{customer.status}</span>
              </div>
              <p className="text-slate-500 text-[11px] font-mono mb-2">{customer.phone}</p>
              <div className="flex items-center gap-3">
                 <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                    {customer.plan}
                 </span>
                 {customer.history.length > 0 && (
                     <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {customer.history.length} calls
                     </span>
                 )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Customer Detail Column */}
      <div className="flex-1 flex flex-col bg-slate-950 relative">
        {selectedCustomer ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-slate-800 bg-slate-900/30">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center border border-slate-600 shadow-lg text-lg font-bold text-white">
                      {selectedCustomer.name.charAt(0)}
                   </div>
                   <div>
                       <h1 className="text-xl font-bold text-white">{selectedCustomer.name}</h1>
                       <div className="flex items-center gap-2 mt-1">
                          <p className="text-slate-400 text-xs">{selectedCustomer.email}</p>
                          <span className="text-slate-600 text-[10px]">•</span>
                          <p className="text-slate-400 text-xs font-mono">{selectedCustomer.phone}</p>
                       </div>
                   </div>
                </div>
                <div className="text-right bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-800">
                   <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Account Value</div>
                   <div className="text-lg font-mono text-green-400 font-bold">{selectedCustomer.accountValue}</div>
                </div>
              </div>
            </div>

            {/* Interaction History */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                
               {/* Transfer History Section (if exists) */}
               {selectedCustomer.history.some(h => h.status === 'Transferred') && (
                 <div className="px-6 py-4 bg-purple-900/5 border-b border-purple-900/10">
                    <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2 opacity-80">
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                       Recent Transfers
                    </h3>
                    <div className="flex flex-wrap gap-2">
                       {selectedCustomer.history.filter(h => h.status === 'Transferred').map(record => (
                          <div key={record.id} className="bg-slate-900 border border-purple-500/20 rounded-lg p-2.5 flex items-center gap-3 shadow-sm min-w-[200px]">
                             <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                                <span className="text-xs">📞</span>
                             </div>
                             <div>
                                <div className="text-slate-200 text-xs font-bold">{record.transferDestination || 'Unknown'}</div>
                                <div className="text-[10px] text-slate-500">{record.date.split(',')[0]}</div>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
               )}

               <div className="p-6">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-800 pb-2">Interaction Timeline</h3>
                 
                 <div className="space-y-0 relative">
                    {selectedCustomer.history.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-2 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30">
                            <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-sm">No interaction history found.</p>
                        </div>
                    )}
                    
                    {/* Vertical Line */}
                    {selectedCustomer.history.length > 0 && (
                        <div className="absolute left-[19px] top-2 bottom-4 w-px bg-slate-800 z-0"></div>
                    )}

                    {[...selectedCustomer.history].reverse().map((record) => (
                      <div key={record.id} className="relative pl-12 pb-8 group z-10">
                         {/* Timeline Dot */}
                         <div className={`absolute left-[13px] top-1 w-3.5 h-3.5 rounded-full border-2 bg-slate-950 z-10 
                            ${record.status === 'Resolved' ? 'border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 
                              record.status === 'Transferred' ? 'border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]' : 
                              'border-red-500'}`}>
                         </div>
                         
                         <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 hover:bg-slate-900 hover:border-slate-700 transition-all shadow-sm">
                             <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                   <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${record.status === 'Resolved' ? 'bg-green-500/10 text-green-400 border-green-500/20' : record.status === 'Transferred' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                      {record.status}
                                   </span>
                                   <span className="text-slate-500 text-xs font-mono">{record.date}</span>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-950 rounded-lg px-2 py-1 border border-slate-800">
                                    <div className={`w-1.5 h-1.5 rounded-full ${getSentimentColor(record.sentimentScore).replace('text-', 'bg-')}`}></div>
                                    <span className={`text-[10px] font-bold ${getSentimentColor(record.sentimentScore)}`}>
                                        Sentiment: {record.sentimentScore}
                                    </span>
                                </div>
                             </div>

                             <div className="mb-3">
                                <p className="text-slate-300 text-sm font-medium leading-relaxed">
                                    {record.summary}
                                </p>
                             </div>

                             <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono border-t border-slate-800/50 pt-2">
                                <span>Duration: {record.duration}</span>
                                <span>Type: {record.type}</span>
                                <span className="text-slate-600">ID: {record.id}</span>
                             </div>
                             
                             {/* Mini Transcript Preview */}
                             {record.transcript.length > 0 && (
                                <div className="mt-3 bg-black/20 rounded-lg p-3 border border-slate-800/30">
                                   <div className="space-y-1.5">
                                      {record.transcript.slice(0, 2).map((t, idx) => (
                                         <div key={idx} className="flex gap-2 text-[10px]">
                                            <span className={`shrink-0 w-8 font-bold ${t.role === 'agent' ? 'text-blue-400' : 'text-slate-400'}`}>{t.role === 'agent' ? 'AI' : 'User'}</span>
                                            <span className="text-slate-400 truncate opacity-80">{t.text}</span>
                                         </div>
                                      ))}
                                   </div>
                                   {record.transcript.length > 2 && (
                                       <div className="mt-1 text-[9px] text-blue-500/50 cursor-pointer hover:text-blue-400 transition-colors">
                                           + {record.transcript.length - 2} more lines
                                       </div>
                                   )}
                                </div>
                             )}
                         </div>
                      </div>
                    ))}
                 </div>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 p-8 text-center">
             <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4 shadow-inner">
                <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
             </div>
             <h3 className="text-slate-400 font-bold">Select a Customer</h3>
             <p className="text-xs mt-1 max-w-[200px]">View detailed profile, history, and real-time call analytics.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CRMPanel;