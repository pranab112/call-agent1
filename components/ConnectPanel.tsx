
import React, { useState, useEffect } from 'react';

const ConnectPanel: React.FC = () => {
  const [publicUrl, setPublicUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Check Local Server Status
  useEffect(() => {
    const checkServer = async () => {
      setServerStatus('checking');
      try {
        const res = await fetch('http://localhost:5050/');
        if(res.ok) setServerStatus('online');
        else setServerStatus('offline');
      } catch (e) {
        setServerStatus('offline');
      }
    };
    
    checkServer();
    const interval = setInterval(checkServer, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  // Generate the Webhook URL
  const webhookUrl = publicUrl 
    ? `${publicUrl.replace(/\/$/, '')}/incoming-call` 
    : 'https://your-ngrok-url.app/incoming-call';

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 w-full overflow-y-auto custom-scrollbar">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-950/30">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
           <span className="text-2xl">⚡</span>
           Twilio Setup Wizard
        </h2>
        <p className="text-[11px] text-slate-400 font-medium mt-1">Follow these steps to connect your phone number.</p>
      </div>

      <div className="p-6 space-y-8">

        {/* STEP 0: SERVER HEALTH CHECK */}
        <section className="bg-slate-800/40 rounded-xl p-4 border border-slate-700">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    1. Backend Server Status
                 </h3>
                 <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-2 ${serverStatus === 'online' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    <div className={`w-2 h-2 rounded-full ${serverStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    {serverStatus === 'online' ? 'System Online' : serverStatus === 'checking' ? 'Checking...' : 'Offline'}
                 </div>
             </div>

             {serverStatus === 'offline' && (
                 <div className="bg-black/30 rounded-lg p-3 space-y-3">
                     <p className="text-[10px] text-red-300 font-bold">⚠️ Server not detected on port 5050.</p>
                     <div>
                        <p className="text-[10px] text-slate-500 mb-1">Run this command in a new terminal:</p>
                        <div className="bg-slate-950 border border-slate-800 rounded p-2 text-[10px] font-mono text-slate-300 select-all">
                            node server.js
                        </div>
                     </div>
                     <div>
                        <p className="text-[10px] text-slate-500 mb-1">Missing packages? Install first:</p>
                        <div className="bg-slate-950 border border-slate-800 rounded p-2 text-[10px] font-mono text-slate-300 select-all">
                            npm install fastify @fastify/websocket @fastify/formbody @google/genai dotenv twilio
                        </div>
                     </div>
                 </div>
             )}
        </section>

        {/* STEP 1: NGROK CONFIG */}
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                2. Public URL (Ngrok)
            </h3>
            
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <div className="mb-4">
                    <p className="text-[10px] text-slate-400 mb-2">
                        Twilio needs a public URL to reach your local computer. Run this in a <strong>separate terminal</strong>:
                    </p>
                    <div className="bg-black border border-slate-800 rounded p-2 flex justify-between items-center group">
                        <code className="text-[10px] font-mono text-green-400">ngrok http 5050</code>
                        <span className="text-[9px] text-slate-600 uppercase font-bold">Terminal Command</span>
                    </div>
                </div>

                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2">
                    Paste the "Forwarding" URL from ngrok here:
                </label>
                <input 
                    type="text" 
                    value={publicUrl}
                    onChange={(e) => setPublicUrl(e.target.value)}
                    placeholder="https://xxxx-xx-xx-xx.ngrok-free.app"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-3 text-sm text-white focus:border-blue-500 outline-none font-mono placeholder:text-slate-600"
                />
            </div>
        </section>

        {/* STEP 2: GENERATE WEBHOOK */}
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100">
            <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                3. Configure Twilio
            </h3>

            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-end mb-2">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block">
                        Generated Webhook URL
                    </label>
                </div>
                
                <div className="flex gap-2 mb-4">
                    <div className="flex-1 bg-black/50 border border-slate-800 rounded-lg px-3 py-3 text-xs text-green-400 font-mono truncate select-all relative overflow-hidden">
                        {webhookUrl}
                        {!publicUrl && <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center text-slate-500 italic text-[10px]">Enter Ngrok URL above</div>}
                    </div>
                    <button 
                        onClick={handleCopy}
                        disabled={!publicUrl}
                        className={`px-4 rounded-lg text-xs font-bold text-white transition-all ${isCopied ? 'bg-green-600' : 'bg-slate-700 hover:bg-slate-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isCopied ? 'Copied' : 'Copy'}
                    </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Instructions</p>
                    <ol className="list-decimal list-inside text-[11px] text-slate-400 space-y-2">
                        <li>Go to <strong>Twilio Console</strong> &gt; <strong>Phone Numbers</strong>.</li>
                        <li>Click your Active Number.</li>
                        <li>Scroll to <strong>Voice & Fax</strong>.</li>
                        <li>Under <strong>"A Call Comes In"</strong>, select <strong>Webhook</strong>.</li>
                        <li>Paste the URL above.</li>
                        <li>Set method to <strong>HTTP POST</strong> and click Save.</li>
                    </ol>
                </div>
            </div>
        </section>

        <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-xl text-center">
             <p className="text-[10px] text-blue-300">
                Once setup is complete, call your Twilio number. <br/>
                The backend server will handle the call using Gemini Live.
             </p>
        </div>

      </div>
    </div>
  );
};

export default ConnectPanel;
