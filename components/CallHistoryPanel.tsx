import React from 'react';
import { CustomerProfile } from '../types';

interface CallHistoryPanelProps {
  customers: CustomerProfile[];
}

const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({ customers }) => {
  // Flatten all history into one list
  const allLogs = customers.flatMap(c => 
    c.history.map(h => ({
      ...h,
      customerName: c.name,
      customerPhone: c.phone
    }))
  ).sort((a, b) => {
      // Try to sort by ID timestamp if possible, else just reverse order roughly
      const timeA = parseInt(a.id.split('-')[1]) || 0;
      const timeB = parseInt(b.id.split('-')[1]) || 0;
      return timeB - timeA;
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 w-full overflow-hidden">
      <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
           <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           Call Logs
        </h2>
        <p className="text-sm text-slate-400">Global history of all incoming and outgoing calls.</p>
      </div>

      <div className="overflow-y-auto custom-scrollbar flex-1 p-4">
        {allLogs.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <p className="text-xs italic">No calls recorded yet.</p>
             </div>
        ) : (
            <div className="space-y-2">
                {allLogs.map((log) => (
                    <div key={log.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 flex items-center justify-between hover:bg-slate-800 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${log.status === 'Resolved' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                {log.type === 'Inbound' ? '↙' : '↗'}
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">{log.customerName}</h3>
                                <div className="text-[10px] text-slate-400 font-mono">{log.customerPhone} • {log.date}</div>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                            <div className="text-right hidden md:block">
                                <div className="text-[10px] uppercase font-bold text-slate-500">Duration</div>
                                <div className="text-xs text-slate-300 font-mono">{log.duration}</div>
                            </div>
                            <div className="text-right hidden md:block">
                                <div className="text-[10px] uppercase font-bold text-slate-500">Sentiment</div>
                                <div className={`text-xs font-bold ${log.sentimentScore > 60 ? 'text-green-400' : log.sentimentScore < 40 ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {log.sentimentScore}%
                                </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${log.status === 'Resolved' ? 'bg-green-900/20 border-green-900/50 text-green-400' : 'bg-purple-900/20 border-purple-900/50 text-purple-400'}`}>
                                {log.status}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default CallHistoryPanel;