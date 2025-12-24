
import React from 'react';
import { SipConfig } from '../types';

interface ConnectPanelProps {
    sipConfig: SipConfig;
    setSipConfig: React.Dispatch<React.SetStateAction<SipConfig>>;
    status: 'DISCONNECTED' | 'CONNECTING' | 'REGISTERED' | 'ERROR';
    error?: string | null;
}

const ConnectPanel: React.FC<ConnectPanelProps> = ({ sipConfig, setSipConfig, status, error }) => {
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setSipConfig(prev => ({ ...prev, [name]: value }));
  };

  const toggleConnection = () => {
      setSipConfig(prev => ({ ...prev, isConnected: !prev.isConnected }));
  };

  const isNetworkError = error?.includes('1006') || error?.includes('WebSocket');

  return (
    <div className="flex flex-col h-full bg-slate-900 w-full overflow-y-auto custom-scrollbar">
      <div className="p-6 border-b border-slate-800 bg-slate-950/50 backdrop-blur">
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
           <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-sm shadow-lg shadow-orange-900/20">⚡</div>
           SIP Registration
        </h2>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">SIP2SIP Provider</p>
      </div>

      <div className="p-6 space-y-6">
         {/* Status Card */}
         <div className={`p-4 border rounded-2xl flex items-center justify-between ${status === 'REGISTERED' ? 'bg-green-900/10 border-green-500/20' : status === 'ERROR' ? 'bg-red-900/10 border-red-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
            <div>
                <div className={`text-xs font-bold uppercase tracking-wider ${status === 'REGISTERED' ? 'text-green-400' : status === 'ERROR' ? 'text-red-400' : 'text-slate-400'}`}>
                    {status === 'REGISTERED' ? 'Browser Online' : status === 'CONNECTING' ? 'Registering...' : 'Offline'}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                    {status === 'REGISTERED' ? 'Ready to receive calls' : 'Enter SIP credentials below'}
                </div>
            </div>
            <div className={`w-3 h-3 rounded-full ${status === 'REGISTERED' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : status === 'CONNECTING' ? 'bg-yellow-500 animate-pulse' : status === 'ERROR' ? 'bg-red-500' : 'bg-slate-600'}`}></div>
         </div>

         {/* Error Alert Box */}
         {error && (
            <div className="bg-red-950/50 border border-red-500/50 rounded-xl p-4 flex gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="text-red-500 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                    <h3 className="text-red-400 font-bold text-xs uppercase mb-1">Connection Failed</h3>
                    <p className="text-red-200 text-xs font-mono leading-relaxed">{error}</p>
                    {isNetworkError && (
                        <div className="mt-2 pt-2 border-t border-red-500/30">
                            <p className="text-[10px] text-red-300 font-bold uppercase">Troubleshooting:</p>
                            <ul className="text-[10px] text-red-300 list-disc pl-4 mt-1 space-y-1">
                                <li>The browser could not reach <strong>wss://proxy.sipthor.net:443</strong>.</li>
                                <li>Ensure you have a valid account at <strong>sip2sip.info</strong>.</li>
                                <li>SIP2SIP requires you to verify your email before connecting.</li>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
         )}

         {/* Form */}
         <div className="space-y-4 pt-2">
             <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-800 mb-2">
                 <p className="text-[10px] text-slate-400">
                     <strong>Provider:</strong> SIP2SIP.info<br/>
                     This app is configured to use sip2sip.info exclusively.
                 </p>
             </div>

             <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">SIP Username</label>
                <input 
                    type="text" 
                    name="username"
                    value={sipConfig.username}
                    onChange={handleInputChange}
                    placeholder="e.g. pranabpokharel"
                    disabled={sipConfig.isConnected}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-orange-500 outline-none transition-all disabled:opacity-50"
                />
             </div>
             
             <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">SIP Password</label>
                <input 
                    type="password" 
                    name="password"
                    value={sipConfig.password || ''}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    disabled={sipConfig.isConnected}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-orange-500 outline-none transition-all disabled:opacity-50"
                />
             </div>

             {/* Hidden Advanced Fields (But visible if needed to debug) */}
             <div className="grid grid-cols-2 gap-3 opacity-60">
                 <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Domain</label>
                    <input 
                        type="text" 
                        name="domain"
                        value={sipConfig.domain}
                        onChange={handleInputChange}
                        placeholder="sip2sip.info"
                        disabled={sipConfig.isConnected}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-orange-500 outline-none transition-all disabled:opacity-50"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">WSS Server</label>
                    <input 
                        type="text" 
                        name="websocketUrl"
                        value={sipConfig.websocketUrl}
                        onChange={handleInputChange}
                        placeholder="wss://proxy.sipthor.net:443"
                        disabled={sipConfig.isConnected}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 focus:border-orange-500 outline-none transition-all disabled:opacity-50"
                    />
                 </div>
             </div>

             <button 
                onClick={toggleConnection}
                className={`w-full py-4 rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95 ${sipConfig.isConnected ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20' : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/20'}`}
             >
                {sipConfig.isConnected ? 'Disconnect' : 'Connect Browser'}
             </button>
         </div>

         <div className="text-[10px] text-slate-500 text-center px-4 flex flex-col items-center gap-2">
            <p>Don't have a SIP2SIP account?</p>
            <a href="https://sip2sip.info" target="_blank" className="text-blue-400 hover:underline border border-blue-900 bg-blue-900/10 px-3 py-1.5 rounded-lg">
                Register Free at sip2sip.info
            </a>
         </div>
      </div>
    </div>
  );
};

export default ConnectPanel;
