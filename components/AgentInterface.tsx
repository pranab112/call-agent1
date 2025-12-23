import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { ConnectionState, KnowledgeBase, LogEntry } from '../types';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';

interface AgentInterfaceProps {
  knowledge: KnowledgeBase;
}

type CallState = 'IDLE' | 'RINGING' | 'ACTIVE' | 'TRANSFERRING';

// Gemini API Estimated Cost (Audio Input + Output processing)
const COST_PER_MINUTE = 0.08;

const transferTool: FunctionDeclaration = {
  name: "transferCall",
  parameters: {
    type: Type.OBJECT,
    properties: {
      destination: { type: Type.STRING, description: "The name of the person or department receiving the call." },
      extension: { type: Type.STRING, description: "The extension number or phone number to transfer to." }
    },
    required: ["destination", "extension"]
  },
  description: "Transfer the active phone call to a specific internal extension or a real human operator."
};

const AgentInterface: React.FC<AgentInterfaceProps> = ({ knowledge }) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [volume, setVolume] = useState<number>(0);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [realPhoneLoading, setRealPhoneLoading] = useState(false);
  
  // Simulation State
  const [simulatedCallerName, setSimulatedCallerName] = useState("New Client");
  const [simulatedCallerNumber, setSimulatedCallerNumber] = useState("+977 9841-555-000");
  const [currentCarrier, setCurrentCarrier] = useState("NTC 5G");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<{destination: string, extension: string} | null>(null);

  // Refs for Audio Processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);

  // Refs for Visualizer
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  const addLog = (source: LogEntry['source'], message: string) => {
    setLogs(prev => [...prev.slice(-4), { source, message, timestamp: new Date() }]);
  };

  // Trigger Real Call via Backend
  const triggerRealCall = async () => {
    const phoneNumber = prompt("Enter the customer's real phone number (e.g. +9779841XXXXXX):", "+977");
    if (!phoneNumber) return;

    setRealPhoneLoading(true);
    addLog('system', 'Uploading Company Data & Initiating Call...');
    
    // CONSTRUCT DYNAMIC INSTRUCTION
    const dynamicSystemInstruction = `
        You are the AI Voice Receptionist for ${knowledge.companyName}.
        Your goal is to politely and professionally answer phone calls based on the provided office data.
        
        IMPORTANT LANGUAGE REQUIREMENT:
        - You must strictly speak in **Nepali** (नेपाली).
        - Use polite forms ("Hajur", "Tapai").
        
        OFFICE DATA:
        ${knowledge.content}
        
        HUMAN HANDOFF / TRANSFER POLICIES:
        - If the caller asks for a human, gets frustrated, or has a complex query not in the data, use the "transferCall" tool immediately.
        - If the caller asks for a specific person listed in the data, use "transferCall" with their extension.
        - Extension "100" or "0" is usually the Human Operator.
      `;
    
    try {
        const response = await fetch('http://localhost:5050/make-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                to: phoneNumber,
                systemInstruction: dynamicSystemInstruction
            })
        });
        
        const data = await response.json();
        if (data.success) {
            addLog('system', `Call Sent! SID: ${data.callSid}`);
            alert(`Calling ${phoneNumber}... The AI will act as ${knowledge.companyName}.`);
        } else {
            addLog('system', `Error: ${data.error}`);
            alert('Make sure server.js is running on port 5050 and Twilio env vars are set.');
        }
    } catch (e) {
        console.error(e);
        addLog('system', 'Failed to connect to backend server.');
        alert('Could not connect to localhost:5050. Run "node server.js" first.');
    } finally {
        setRealPhoneLoading(false);
    }
  };

  const generateNepaliNumber = () => {
    const isNtc = Math.random() > 0.5;
    const prefix = isNtc 
        ? ['984', '985', '986'][Math.floor(Math.random() * 3)] 
        : ['980', '981', '982'][Math.floor(Math.random() * 3)];
    
    const randomSuffix = Math.floor(100000 + Math.random() * 900000); // 6 digits
    const formatted = `+977 ${prefix}-${randomSuffix.toString().slice(0,3)}-${randomSuffix.toString().slice(3)}`;
    
    setSimulatedCallerNumber(formatted);
    setCurrentCarrier(isNtc ? "NTC 5G" : "Ncell 4G");
  };

  // Timer for countdown to ring
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
        const timerId = setTimeout(() => {
            setCountdown(prev => (prev !== null ? prev - 1 : null));
        }, 1000);
        return () => clearTimeout(timerId);
    } else {
        setCountdown(null);
        startSimulatedCall();
    }
  }, [countdown]);

  // Timer for call duration and cost
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (callState === 'ACTIVE' && connectionState === ConnectionState.CONNECTED) {
      interval = setInterval(() => {
        setCallDuration(prev => {
           const newDuration = prev + 1;
           setEstimatedCost((newDuration / 60) * COST_PER_MINUTE);
           return newDuration;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState, connectionState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const cleanupAudio = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const connectToGemini = async () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) return;

    try {
      setConnectionState(ConnectionState.CONNECTING);
      addLog('system', 'Initializing audio...');

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const systemInstruction = `
        You are the AI Voice Receptionist for ${knowledge.companyName}.
        OFFICE DATA:
        ${knowledge.content}
        GUIDELINES: Speak Nepali.
      `;

      addLog('system', 'Connecting to Gemini...');

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [transferTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            addLog('system', 'Call Connected');

            if (!inputAudioContextRef.current || !streamRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += Math.abs(inputData[i]);
              const avg = sum / inputData.length;
              setVolume(avg * 5);

              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
             if (message.serverContent?.outputTranscription?.text) {
               addLog('agent', message.serverContent.outputTranscription.text);
             }
             
             if (message.toolCall) {
                const responses = message.toolCall.functionCalls.map((fc) => {
                  if (fc.name === 'transferCall') {
                    const { destination, extension } = fc.args as any;
                    addLog('system', `Transferring to ${destination} (Ext: ${extension})...`);
                    setTransferTarget({ destination, extension });
                    setCallState('TRANSFERRING');
                    setTimeout(() => { disconnect(); }, 4000);
                    return { id: fc.id, name: fc.name, response: { result: 'ok' } };
                  }
                  return { id: fc.id, name: fc.name, response: { result: 'Unknown' } };
                });
                sessionPromise.then((session) => {
                  session.sendToolResponse({ functionResponses: responses });
                });
             }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              sourcesRef.current.add(source);
              nextStartTimeRef.current += audioBuffer.duration;
            }
            
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              if (audioContextRef.current) nextStartTimeRef.current = audioContextRef.current.currentTime;
            }
          },
          onclose: () => {
             setConnectionState(ConnectionState.DISCONNECTED);
             setCallState('IDLE');
             setTransferTarget(null);
             cleanupAudio();
          },
          onerror: (err) => {
            console.error(err);
            setConnectionState(ConnectionState.ERROR);
            cleanupAudio();
          }
        }
      });
      sessionRef.current = sessionPromise;
    } catch (e) {
      console.error(e);
      setConnectionState(ConnectionState.ERROR);
      setCallState('IDLE');
      cleanupAudio();
    }
  };

  const disconnect = async () => {
    cleanupAudio();
    setConnectionState(ConnectionState.DISCONNECTED);
    setCallState('IDLE');
    setTransferTarget(null);
  };

  const startSimulatedCall = () => {
    setCallDuration(0);
    setEstimatedCost(0);
    setCallState('RINGING');
  };

  const startCountdown = (seconds: number) => {
    generateNepaliNumber();
    setCountdown(seconds);
  };

  const answerCall = () => {
    setCallState('ACTIVE');
    connectToGemini();
  };

  const declineCall = () => {
    setCallState('IDLE');
  };

  // Visualizer Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (callState !== 'ACTIVE' && callState !== 'TRANSFERRING')) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let t = 0;
    const draw = () => {
      t += 0.1;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      
      const centerX = width / 2;
      const centerY = height / 2;
      const breath = Math.sin(t * 0.5) * 5;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, 80 + breath, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 48px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AI', centerX, centerY);

      if (connectionState === ConnectionState.CONNECTED && callState !== 'TRANSFERRING') {
        const rings = 3;
        for (let i = 0; i < rings; i++) {
            const r = 80 + breath + (i * 20) + (volume * 100 * (1/(i+1)));
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(96, 165, 250, ${0.3 - (i * 0.1)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
      }
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [callState, connectionState, volume]);

  return (
    <div className="flex items-center justify-center h-full bg-slate-950 p-4 md:p-8">
      <div className="relative w-full max-w-[360px] h-[720px] bg-black rounded-[3rem] border-8 border-slate-900 shadow-2xl overflow-hidden ring-1 ring-slate-800">
        
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-b-xl z-50"></div>

        <div className="absolute top-2 w-full px-6 flex justify-between text-white text-[10px] font-medium z-40 select-none">
           <span>9:41</span>
           <div className="flex gap-1.5 items-center">
             <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
             <span>{currentCarrier}</span>
             <div className="w-5 h-2.5 border border-slate-500 rounded-sm relative ml-1"><div className="absolute top-0 left-0 bg-white h-full w-[80%]"></div></div>
           </div>
        </div>

        {callState === 'IDLE' && (
          <div className="h-full w-full bg-slate-900 relative flex flex-col items-center pt-24 pb-8 px-6 transition-opacity duration-300">
             <div className="text-6xl font-thin text-white mb-2 tracking-tighter">09:41</div>
             <div className="text-slate-400 text-sm font-medium mb-8">Thursday, May 23</div>

             <div className="w-full bg-slate-800/60 backdrop-blur-md rounded-2xl p-4 mb-4 border border-white/5 shadow-lg animate-fade-in space-y-3">
                <div className="flex items-center gap-2 mb-2">
                   <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Test Receptionist</span>
                </div>
                
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold">Simulate Incoming Caller</label>
                  <input 
                    type="text" 
                    value={simulatedCallerName}
                    onChange={(e) => setSimulatedCallerName(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-md px-3 py-2 text-sm text-white mt-1 outline-none focus:border-blue-500"
                    placeholder="e.g. Boss, Client Name"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Number will be auto-generated (NTC/Ncell)</p>
                </div>
                
                {countdown !== null ? (
                   <div className="w-full py-3 bg-blue-600/20 border border-blue-500/50 rounded-xl text-blue-400 font-bold flex items-center justify-center animate-pulse">
                      Ringing in {countdown}s...
                   </div>
                ) : (
                   <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => startCountdown(5)}
                        className="py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white text-xs font-bold transition-colors"
                      >
                         Ring in 5s
                      </button>
                      <button 
                        onClick={() => startCountdown(15)}
                        className="py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white text-xs font-bold transition-colors"
                      >
                         Ring in 15s
                      </button>
                   </div>
                )}
                
                <div className="pt-2 border-t border-white/10 mt-2">
                    <button 
                       onClick={triggerRealCall}
                       disabled={realPhoneLoading}
                       className="w-full py-2 bg-green-600/20 border border-green-500/50 hover:bg-green-600/40 rounded-xl text-green-400 text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                       {realPhoneLoading ? 'Connecting...' : '📱 Call My Real Phone (Backend)'}
                    </button>
                    <p className="text-[9px] text-slate-500 mt-1 text-center">Requires node server.js running</p>
                </div>
             </div>

             {estimatedCost > 0 && (
                <div className="w-full bg-slate-800/40 rounded-xl p-3 mb-4 flex justify-between items-center border border-white/5">
                   <span className="text-xs text-slate-400">Gemini API Cost</span>
                   <span className="text-sm font-mono text-green-400 font-bold">${estimatedCost.toFixed(4)}</span>
                </div>
             )}

             <div className="mt-auto w-full">
                <button 
                   onClick={startSimulatedCall}
                   className="w-full py-4 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 rounded-2xl text-white font-medium flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                   <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                   Ring Now
                </button>
                <p className="text-[10px] text-center text-slate-600 mt-4">
                  Gemini API Rate: ${COST_PER_MINUTE}/min
                </p>
             </div>
          </div>
        )}

        {callState === 'RINGING' && (
          <div className="h-full w-full bg-slate-900/90 backdrop-blur-xl relative flex flex-col items-center pt-24 pb-12 px-6 animate-in fade-in zoom-in-95 duration-300">
             <div className="flex flex-col items-center gap-1 mb-auto">
                <span className="text-slate-400 text-sm font-medium tracking-wide">Nepal Mobile</span>
                <h2 className="text-3xl text-white font-light tracking-tight text-center">{simulatedCallerName}</h2>
                <span className="text-slate-500 text-xs">{simulatedCallerNumber}</span>
             </div>

             <div className="w-full flex justify-between items-center px-4 mb-10">
                <div className="flex flex-col items-center gap-2">
                   <button 
                     onClick={declineCall}
                     className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30 hover:bg-red-600 transition-colors active:scale-90"
                   >
                     <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11H8c-1.1 0-2-.9-2-2s.9-2 2-2h8c1.1 0 2 .9 2 2s-.9 2-2 2z"/></svg>
                   </button>
                   <span className="text-white text-xs font-medium">Decline</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                   <button 
                     onClick={answerCall}
                     className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-500/30 hover:bg-green-600 transition-colors active:scale-90 animate-bounce-short"
                   >
                     <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.061 15.061 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1.01A11.36 11.36 0 018.59 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg>
                   </button>
                   <span className="text-white text-xs font-medium">Accept</span>
                </div>
             </div>
          </div>
        )}

        {(callState === 'ACTIVE' || callState === 'TRANSFERRING') && (
          <div className="h-full w-full bg-slate-900 relative flex flex-col items-center pt-20 pb-8 animate-in slide-in-from-bottom-full duration-500">
             
             <div className="flex flex-col items-center gap-1 mb-8">
                {callState === 'TRANSFERRING' ? (
                   <>
                    <h3 className="text-xl text-blue-400 font-medium animate-pulse">Transferring...</h3>
                    <span className="text-white text-lg">{transferTarget?.destination}</span>
                    <span className="text-slate-400 text-sm">Ext: {transferTarget?.extension}</span>
                   </>
                ) : (
                   <>
                    <h3 className="text-xl text-white font-medium">{simulatedCallerName}</h3>
                    <div className="flex flex-col items-center">
                      <span className="text-slate-400 text-xs tracking-widest">{formatTime(callDuration)}</span>
                      <span className="text-green-500 text-[10px] font-mono mt-1">${estimatedCost.toFixed(3)}</span>
                    </div>
                   </>
                )}
             </div>

             <div className="flex-1 w-full flex items-center justify-center relative mb-8">
                <canvas 
                  ref={canvasRef} 
                  width={300} 
                  height={300}
                  className="w-[280px] h-[280px]"
                />
             </div>

             <div className={`w-full px-8 grid grid-cols-3 gap-y-6 gap-x-4 mb-8 transition-opacity duration-300 ${callState === 'TRANSFERRING' ? 'opacity-50 pointer-events-none' : ''}`}>
                {[
                  { icon: <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>, label: 'Mute' },
                  { icon: <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.53 4.92.42-3.73 3.23L16.23 18z"/>, label: 'Keypad' },
                  { icon: <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>, label: 'Speaker', active: true },
                  { icon: <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>, label: 'FaceTime' },
                  { icon: <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>, label: 'Contacts' },
                ].map((item, i) => (
                   <button key={i} className={`flex flex-col items-center gap-2 ${i === 5 ? 'opacity-0 pointer-events-none' : ''}`}>
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${item.active ? 'bg-white text-slate-900' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
                         <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">{item.icon}</svg>
                      </div>
                      <span className="text-white text-[10px] font-medium">{item.label}</span>
                   </button>
                ))}
             </div>

             <button 
                onClick={disconnect}
                className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30 hover:bg-red-600 transition-colors active:scale-95 mb-4"
             >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11H8c-1.1 0-2-.9-2-2s.9-2 2-2h8c1.1 0 2 .9 2 2s-.9 2-2 2z"/></svg>
             </button>

             <div className="absolute top-24 w-full px-4 flex flex-col gap-2 pointer-events-none">
                {logs.slice(-2).map((log, i) => (
                   <div key={i} className={`text-xs p-2 rounded-lg backdrop-blur-md ${log.source === 'user' ? 'bg-blue-500/50 self-end text-white' : 'bg-slate-800/50 self-start text-slate-300'}`}>
                      {log.message}
                   </div>
                ))}
             </div>
          </div>
        )}

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white rounded-full opacity-30"></div>
      </div>
    </div>
  );
};

export default AgentInterface;