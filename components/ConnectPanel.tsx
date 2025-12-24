import React, { useState } from 'react';

const ConnectPanel: React.FC = () => {
  const [view, setView] = useState<'architecture' | 'code'>('architecture');
  const websocketUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/media-stream`;
  
  const serverCodeSnippet = `// server.js (Production Ready)
import Fastify from 'fastify';
import fastifyWs from '@fastify/websocket';
import { GoogleGenAI } from '@google/genai';

const fastify = Fastify();
fastify.register(fastifyWs);

fastify.register(async (fastify) => {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    console.log("📞 Incoming Call");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let sessionPromise = null;

    // Helper to safely kill AI session
    const cleanup = async () => {
        if(sessionPromise) {
            try {
                const session = await sessionPromise;
                session.close(); // Force close Gemini
                console.log("Cleaned up AI Session");
            } catch(e) { console.log("Session already closed"); }
        }
    };

    // 1. Connection Logic
    connection.socket.on('message', async (msg) => {
        const data = JSON.parse(msg);
        
        if (data.event === 'start') {
             sessionPromise = ai.live.connect({ 
                 model: 'gemini-2.5-flash...',
                 callbacks: {
                     onmessage: (resp) => {
                         // Check if socket is still open before sending back
                         if(connection.socket.readyState === 1) {
                             connection.socket.send(resp.audioData);
                         }
                     }
                 }
             });
        }
        
        if (data.event === 'stop') {
             console.log("Call Ended Normally");
             cleanup();
        }
    });

    // 2. HANDLE ABRUPT DISCONNECTS (e.g. Signal Loss)
    connection.socket.on('close', () => {
        console.log("⚠️ Client disconnected abruptly");
        cleanup();
    });

    connection.socket.on('error', () => {
        cleanup();
    });
  });
});

fastify.listen({ port: 5050, host: '0.0.0.0' }, () => {
  console.log("✅ AI System Online");
});`;

  return (
    <div className="flex flex-col h-full bg-slate-900 w-full overflow-y-auto custom-scrollbar">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
           <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
           System Integration
        </h2>
        <p className="text-sm text-slate-400">Where is the AI "Receiver"?</p>
      </div>

      {/* Toggle */}
      <div className="px-6 pt-6">
        <div className="flex bg-slate-800 rounded-lg p-1 w-fit">
            <button 
                onClick={() => setView('architecture')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${view === 'architecture' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
                Architecture
            </button>
            <button 
                onClick={() => setView('code')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${view === 'code' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
                Server Code (The Receiver)
            </button>
        </div>
      </div>

      <div className="p-6 space-y-8">

        {view === 'architecture' ? (
        <>
            {/* 1. Network Config */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Connection Details
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
                    <p className="text-[10px] text-slate-500 mt-1">
                        <strong>Important:</strong> This web app does NOT receive the call directly. Your server receives it at this URL.
                    </p>
                </div>
            </div>
            </div>

            {/* 2. Visual Flow */}
            <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 text-center">Where is the system?</h3>
            <div className="relative flex flex-col items-center gap-4 py-4">
                {/* Vertical Line */}
                <div className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-600 to-transparent left-1/2 -z-10"></div>
                
                {/* Caller */}
                <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 w-64 text-center relative shadow-lg opacity-50">
                    <div className="text-lg mb-1">🇳🇵 Caller</div>
                    <div className="text-[9px] text-slate-500">Phone Network</div>
                </div>

                <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>

                {/* PBX */}
                <div className="bg-blue-900/10 border border-blue-500/30 rounded-lg p-3 w-64 text-center relative">
                    <div className="text-lg mb-1">📠 PBX / SIP Gateway</div>
                    <div className="text-xs font-bold text-blue-400">Audio Router</div>
                    <div className="text-[8px] text-slate-500 mt-1 font-mono">Converts SIP to WebSocket</div>
                </div>

                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>

                {/* THE SYSTEM */}
                <div className="bg-indigo-900 border-2 border-indigo-500 rounded-xl p-4 w-72 text-center relative shadow-[0_0_20px_rgba(99,102,241,0.3)] animate-pulse">
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded rotate-90 transform origin-center">THIS IS IT</div>
                    <div className="text-2xl mb-2">🖥️</div>
                    <div className="text-sm font-bold text-white">THE AI SYSTEM</div>
                    <div className="text-xs text-indigo-200 font-mono bg-black/30 rounded px-2 py-1 mt-1">server.js</div>
                    <div className="text-[9px] text-indigo-300 mt-2 leading-relaxed">
                        This is the Node.js application running on your server (AWS/GCP/On-Prem). 
                        It receives the WebSocket connection from the PBX.
                    </div>
                </div>
            </div>
            </div>
        </>
        ) : (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
             <div className="mb-4 bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-lg flex gap-3 items-start">
                <span className="text-lg">⚠️</span>
                <div>
                    <h4 className="text-xs font-bold text-yellow-500 uppercase">Deployment Required</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        This code cannot run in the browser. You must deploy the <code className="text-yellow-200">server.js</code> file to a backend server (e.g., VPS, Cloud Run, EC2) that is accessible by your SIP Gateway.
                    </p>
                </div>
             </div>

             <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-mono">server.js</span>
                    <button className="text-[10px] text-blue-400 hover:text-white uppercase font-bold">Copy Code</button>
                </div>
                <pre className="p-4 overflow-x-auto text-[10px] md:text-xs font-mono text-slate-300 leading-relaxed">
                    {serverCodeSnippet}
                </pre>
             </div>
        </div>
        )}

      </div>
    </div>
  );
};

export default ConnectPanel;