
import React, { useState } from 'react';
import { SipConfig } from '../types';

interface ConnectPanelProps {
    sipConfig: SipConfig;
    setSipConfig: React.Dispatch<React.SetStateAction<SipConfig>>;
    status: 'DISCONNECTED' | 'CONNECTING' | 'REGISTERED' | 'ERROR';
    error?: string | null;
}

type Preset = 'linphone' | 'iptel' | 'sip2sip' | 'local' | 'custom';

const ConnectPanel: React.FC<ConnectPanelProps> = ({ sipConfig, setSipConfig, status, error }) => {
  const [activePreset, setActivePreset] = useState<Preset>('custom');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setSipConfig(prev => ({ ...prev, [name]: value }));
      if (activePreset !== 'custom') setActivePreset('custom');
  };

  const toggleConnection = () => {
      setSipConfig(prev => ({ ...prev, isConnected: !prev.isConnected }));
  };

  const applyPreset = (preset: Preset) => {
      setActivePreset(preset);
      if (preset === 'linphone') {
          setSipConfig(prev => ({
              ...prev,
              domain: 'sip.linphone.org',
              websocketUrl: 'wss://sip.linphone.org',
              isConnected: false
          }));
      } else if (preset === 'iptel') {
          setSipConfig(prev => ({
              ...prev,
              domain: 'iptel.org',
              websocketUrl: 'wss://ws.iptel.org',
              isConnected: false
          }));
      } else if (preset === 'local') {
          setSipConfig(prev => ({
              ...prev,
              domain: 'localhost',
              websocketUrl: 'ws://localhost:8088/ws',
              isConnected: false
          }));
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 w-full overflow-y-auto custom-scrollbar">
      <div className="p-6 border-b border-slate-800 bg-slate-950/50 backdrop-blur">
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
           <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-sm shadow-lg shadow-orange-900/20">⚡</div>
           SIP Registration
        </h2>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">Connect Browser as Phone</p>
      </div>

      <div className="p-6 space-y-6">
         {/* Status Card */}
         <div className={`p-4 border rounded-2xl flex items-center justify-between ${status === 'REGISTERED' ? 'bg-green-900/10 border-green-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
            <div>
                <div className={`text-xs font-bold uppercase tracking-wider ${status === 'REGISTERED' ? 'text-green-400' : 'text-slate-400'}`}>
                    {status === 'REGISTERED' ? 'Browser Online' : status === 'CONNECTING' ? 'Registering...' : 'Offline'}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                    {status === 'REGISTERED' ? 'Ready to receive calls' : 'Enter SIP credentials below'}
                </div>
            </div>
            <div className={`w-3 h-3 rounded-full ${status === 'REGISTERED' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : status === 'CONNECTING' ? 'bg-yellow-500 animate-pulse' : 'bg-slate-600'}`}></div>
         </div>

         {/* Error Alert */}
         {error && (
            <div className="bg-red-950/50 border border-red-500/50 rounded-xl p-3 text-red-400 text-[10px] font-mono">
                Error: {error}
            </div>
         )}

         {/* Presets */}
         <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Service Preset</label>
            <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
               <button onClick={() => applyPreset('linphone')} className={`flex-1 min-w-[80px] py-2 rounded-lg text-[10px] font-bold ${activePreset === 'linphone' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>Linphone</button>
               <button onClick={() => applyPreset('iptel')} className={`flex-1 min-w-[80px] py-2 rounded-lg text-[10px] font-bold ${activePreset === 'iptel' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>IPTel.org</button>
               <button onClick={() => applyPreset('local')} className={`flex-1 min-w-[80px] py-2 rounded-lg text-[10px] font-bold ${activePreset === 'local' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>Local</button>
            </div>
         </div>

         {/* Form */}
         <div className="space-y-4 pt-2">
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

             <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Domain</label>
                    <input 
                        type="text" 
                        name="domain"
                        value={sipConfig.domain}
                        onChange={handleInputChange}
                        placeholder="sip.linphone.org"
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
                        placeholder="wss://sip.linphone.org"
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

         <div className="text-[10px] text-slate-500 text-center px-4 leading-relaxed">
            Note: Your SIP provider must support WebRTC/WebSocket transport. Public providers like Linphone.org work best.
         </div>
      </div>
    </div>
  );
};

export default ConnectPanel;
