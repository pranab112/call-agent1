import React from 'react';

const ConnectPanel: React.FC = () => {
  const websocketUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/media-stream`;
  
  return (
    <div className="flex flex-col h-full bg-slate-900 w-full overflow-y-auto custom-scrollbar">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
           <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
           Ncell SIP Integration
        </h2>
        <p className="text-sm text-slate-400">Connect your Ncell SIP Trunk to the AI Agent.</p>
      </div>

      <div className="p-6 space-y-8">

        {/* 1. Configuration Block */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
           <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
             Network Configuration
           </h3>

           <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">SIP Trunk IP (Ncell)</label>
                     <code className="block bg-black/50 border border-slate-700 rounded px-3 py-2 text-xs text-slate-300 font-mono">
                        10.x.x.x / Public IP
                     </code>
                  </div>
                  <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Port</label>
                     <code className="block bg-black/50 border border-slate-700 rounded px-3 py-2 text-xs text-slate-300 font-mono">
                        5060 (UDP/TCP)
                     </code>
                  </div>
              </div>

              <div>
                 <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Media Stream WebSocket URL</label>
                 <div className="flex gap-2">
                    <code className="flex-1 bg-black/50 border border-slate-700 rounded px-3 py-2 text-xs text-purple-300 font-mono truncate select-all">
                       {websocketUrl}
                    </code>
                    <button 
                       onClick={() => navigator.clipboard.writeText(websocketUrl)}
                       className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold text-white transition-colors"
                    >
                       Copy
                    </button>
                 </div>
                 <p className="text-[10px] text-slate-500 mt-1">Configure your PBX (Asterisk/FreeSWITCH) to stream audio here.</p>
              </div>
           </div>
        </div>

        {/* 2. Visual Flow */}
        <div>
           <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 text-center">Data Flow Architecture</h3>
           <div className="relative flex flex-col items-center gap-4 py-4">
               {/* Vertical Line */}
               <div className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-600 to-transparent left-1/2 -z-10"></div>
               
               {/* Caller */}
               <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 w-56 text-center relative shadow-lg shadow-slate-900/50">
                  <div className="text-lg mb-1">🇳🇵</div>
                  <div className="text-xs font-bold text-white">Caller (Nepal)</div>
                  <div className="text-[9px] text-slate-500">+977 98XXXXXXXX</div>
               </div>

               <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>

               {/* Ncell */}
               <div className="bg-purple-900/10 border border-purple-500/30 rounded-lg p-3 w-56 text-center relative">
                  <div className="text-lg mb-1">📡</div>
                  <div className="text-xs font-bold text-purple-400">Ncell SIP Trunk</div>
                  <div className="text-[9px] text-purple-300/50">Public Network</div>
               </div>

               <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>

               {/* PBX */}
               <div className="bg-blue-900/10 border border-blue-500/30 rounded-lg p-3 w-56 text-center relative">
                  <div className="text-lg mb-1">📠</div>
                  <div className="text-xs font-bold text-blue-400">Your PBX / Gateway</div>
                  <div className="text-[9px] text-blue-300/50">Asterisk / FreeSWITCH</div>
                  <div className="text-[8px] text-slate-500 mt-1 font-mono">SIP -&gt; WebSocket</div>
               </div>

               <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>

               {/* Server Middleware */}
               <div className="bg-slate-900 border border-indigo-500/30 rounded-lg p-3 w-56 text-center relative">
                  <div className="text-lg mb-1">🖥️</div>
                  <div className="text-xs font-bold text-indigo-300">AI Middleware</div>
                  <div className="text-[9px] text-indigo-300/50">Node.js Server</div>
                  <div className="text-[8px] text-slate-500 mt-1 font-mono">Audio Buffer &amp; Auth</div>
               </div>

               <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>

               {/* Gemini */}
               <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-400/50 rounded-lg p-3 w-56 text-center relative shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <div className="text-lg mb-1">✨</div>
                  <div className="text-xs font-bold text-white">Google Gemini Live</div>
                  <div className="text-[9px] text-blue-200">Gemini 2.5 Flash</div>
                  <div className="mt-2 text-[8px] bg-black/40 rounded px-1 py-0.5 border border-white/10 text-slate-300 text-left">
                     Processing: Audio Understanding &amp; Generation
                  </div>
               </div>
           </div>
        </div>

        {/* 3. Setup Instructions */}
        <div>
           <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Required Actions</h3>
           <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">1.</span>
                  <span>Contact Ncell Enterprise Support to whitelist your server's Public IP address for the SIP Trunk.</span>
              </li>
              <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">2.</span>
                  <span>Configure your <strong>PBX (Asterisk/FreeSWITCH)</strong> to accept SIP INVITEs from Ncell's Proxy IP.</span>
              </li>
              <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">3.</span>
                  <span>Set up an "Audio Socket" or "External Media" pipe in your PBX dialplan to stream audio to the <strong>WebSocket URL</strong> provided above.</span>
              </li>
           </ul>
        </div>

      </div>
    </div>
  );
};

export default ConnectPanel;