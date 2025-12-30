
import React, { useState, useEffect } from 'react';

// Configuration placeholders for display
const USER_CONFIG = {
    sipDomainFull: "your-domain.sip.twilio.com",
    sipUser: "aiagent",
    defaultUrl: "https://your-app-url.railway.app"
};

// Check for dev mode robustly
const isLocalDev = typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port === '5173';
const API_BASE = isLocalDev ? 'http://localhost:5050' : '';

const ConnectPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pstn' | 'sip' | 'auto'>('sip');
  const [publicUrl, setPublicUrl] = useState(USER_CONFIG.defaultUrl);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  
  // Auto-Setup State
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupResult, setSetupResult] = useState<{success: boolean, message: string} | null>(null);

  // Check Local Server Status
  useEffect(() => {
    const checkServer = async () => {
      setServerStatus('checking');
      try {
        const url = `${API_BASE}/health`; 
        const res = await fetch(url);
        if(res.ok) setServerStatus('online');
        else setServerStatus('offline');
      } catch (e) {
        // If we are in production (static serving), the page itself is loaded from the server, so it's likely online.
        if (!isLocalDev) setServerStatus('online');
        else setServerStatus('offline');
      }
    };
    
    checkServer();
    const interval = setInterval(checkServer, 5000); 
    return () => clearInterval(interval);
  }, []);

  const handleAutoSetup = async () => {
      setIsSettingUp(true);
      setSetupResult(null);
      try {
          const res = await fetch(`${API_BASE}/setup-twilio`, { method: 'POST' });
          const data = await res.json();
          if (res.ok && data.success) {
              setSetupResult({ success: true, message: `Success! Twilio linked to: ${data.sipDomain}` });
          } else {
              setSetupResult({ success: false, message: data.error || "Configuration failed." });
          }
      } catch (e: any) {
          setSetupResult({ success: false, message: e.message || "Network Error" });
      } finally {
          setIsSettingUp(false);
      }
  };

  const webhookUrl = `${publicUrl.replace(/\/$/, '')}/incoming-call`;

  return (
    <div className="flex flex-col h-full bg-slate-900 w-full overflow-y-auto custom-scrollbar">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-950/30">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
           <span className="text-2xl">⚡</span>
           Connection Setup
        </h2>
        
        {/* Connection Type Toggles */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 mt-4">
            <button 
                onClick={() => setActiveTab('sip')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${activeTab === 'sip' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
                Manual (SIP)
            </button>
            <button 
                onClick={() => setActiveTab('auto')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${activeTab === 'auto' ? 'bg-slate-800 text-purple-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
                Auto-Setup
            </button>
            <button 
                onClick={() => setActiveTab('pstn')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${activeTab === 'pstn' ? 'bg-slate-800 text-green-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
                Manual (Phone)
            </button>
        </div>
      </div>

      <div className="p-6 space-y-8">

        {/* SHARED: SERVER HEALTH CHECK */}
        <section className="bg-slate-800/40 rounded-xl p-4 border border-slate-700">
             <div className="flex justify-between items-center mb-2">
                 <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Backend Server
                 </h3>
                 <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-2 ${serverStatus === 'online' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    <div className={`w-2 h-2 rounded-full ${serverStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    {serverStatus === 'online' ? 'Online' : 'Offline'}
                 </div>
             </div>
             
             {/* Public URL Input */}
             <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block">
                    Public Server URL
                </label>
                <input 
                    type="text" 
                    value={publicUrl}
                    onChange={(e) => setPublicUrl(e.target.value)}
                    placeholder="https://your-app.railway.app OR https://xxxx.ngrok.io"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 outline-none font-mono placeholder:text-slate-600 transition-all"
                />
                <p className="text-[10px] text-slate-600 mt-1">
                    This is your Railway or Cloudflare URL. Env variable: <code>SERVER_URL</code>
                </p>
             </div>
        </section>

        {/* TAB: SIP (Active Default) */}
        {activeTab === 'sip' && (
            <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4 mb-4">
                     <h3 className="text-sm font-bold text-blue-400 mb-2 flex items-center gap-2">
                         📞 Client Demo Mode
                     </h3>
                     <p className="text-[11px] text-slate-300 leading-relaxed">
                         Share these credentials with your client. They can use any free SIP softphone (like <strong>Linphone</strong> or <strong>Zoiper</strong>) to call this AI immediately.
                     </p>
                </div>

                <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold tracking-wider">
                        SIP Credentials
                    </p>
                    <div className="bg-black p-4 rounded border border-slate-800 text-sm font-mono text-slate-300 space-y-3 select-all">
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-500">Username</span>
                            <span className="text-purple-400 font-bold">{USER_CONFIG.sipUser}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-500">Password</span>
                            <span className="text-slate-500 italic">&lt;Set in Environment Variables&gt;</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-500">Domain</span>
                            <span className="text-yellow-400 font-bold text-right">{USER_CONFIG.sipDomainFull}</span>
                        </div>
                        <div className="flex justify-between pt-1">
                            <span className="text-slate-500">Transport</span>
                            <span className="text-slate-400 font-bold text-right">UDP / TCP</span>
                        </div>
                    </div>
                </div>
            </section>
        )}

        {/* TAB: AUTO SETUP */}
        {activeTab === 'auto' && (
             <section className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
                 <div className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-4">
                     <h3 className="text-sm font-bold text-purple-400 mb-2">🚀 One-Click Configuration</h3>
                     <p className="text-[11px] text-slate-400 leading-relaxed">
                         If you have set your Environment Variables in Railway, click the button below. The server will automatically link your Twilio Phone Number and SIP Domain to this app.
                     </p>
                 </div>

                 <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-4">
                     <div>
                         <span className="text-[10px] font-bold text-slate-500 uppercase">Status</span>
                         {setupResult ? (
                             <div className={`mt-2 p-3 rounded border text-xs font-bold ${setupResult.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                                 {setupResult.message}
                             </div>
                         ) : (
                             <p className="text-xs text-slate-500 mt-1">Ready to configure...</p>
                         )}
                     </div>

                     <button 
                        onClick={handleAutoSetup}
                        disabled={isSettingUp || serverStatus !== 'online'}
                        className={`w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2
                            ${isSettingUp 
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20 active:scale-95'
                            }`}
                     >
                         {isSettingUp ? (
                             <>
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                Configuring...
                             </>
                         ) : (
                             <>Configure Twilio Automatically</>
                         )}
                     </button>
                     
                     {serverStatus !== 'online' && (
                         <p className="text-[10px] text-red-400 text-center">
                             ⚠️ Server is offline. Cannot configure.
                         </p>
                     )}
                 </div>
             </section>
        )}
        
        {/* TAB: PSTN PHONE NUMBER */}
        {activeTab === 'pstn' && (
            <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h3 className="text-sm font-bold text-slate-200 mb-3">Manual Phone Setup</h3>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                    <ol className="list-decimal list-inside text-[11px] text-slate-400 space-y-3">
                        <li>Go to <strong>Twilio Console</strong> &gt; <strong>Phone Numbers</strong>.</li>
                        <li>Select <strong>your phone number</strong>.</li>
                        <li>
                            Set <strong>"A Call Comes In"</strong> to <strong>Webhook</strong>.
                            <div className="mt-1 pl-4 text-green-400 font-mono text-[10px] break-all">{webhookUrl}</div>
                        </li>
                        <li>Click <strong>Save</strong>.</li>
                    </ol>
                </div>
            </section>
        )}

      </div>
    </div>
  );
};

export default ConnectPanel;
