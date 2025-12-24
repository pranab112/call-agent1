
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { ConnectionState, KnowledgeBase, TranscriptItem, CustomerProfile, InteractionRecord } from '../types';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';

interface AgentInterfaceProps {
  knowledge: KnowledgeBase;
  customers: CustomerProfile[];
  onCallComplete: (customerId: string, record: InteractionRecord, newCustomerProfile?: CustomerProfile) => void;
  externalStream?: MediaStream | null; // New: Allow external audio (SIP/Linphone)
}

type CallState = 'IDLE' | 'RINGING' | 'ACTIVE' | 'TRANSFERRING' | 'SUMMARY';

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

const AgentInterface: React.FC<AgentInterfaceProps> = ({ knowledge, customers, onCallComplete, externalStream }) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [volume, setVolume] = useState<number>(0);
  const [callDuration, setCallDuration] = useState<number>(0);
  
  const [simulatedCallerName, setSimulatedCallerName] = useState("Linphone User");
  const [simulatedCallerNumber, setSimulatedCallerNumber] = useState("sip:external");

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-answer if external stream is provided (SIP call coming in)
  useEffect(() => {
    if (externalStream && callState === 'IDLE') {
      setCallState('RINGING');
      setSimulatedCallerName("Incoming SIP Call");
    }
  }, [externalStream]);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  // Duration Timer
  useEffect(() => {
    let interval: any;
    if (callState === 'ACTIVE' && connectionState === ConnectionState.CONNECTED) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState, connectionState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const addTranscript = (role: TranscriptItem['role'], text: string, isFinal: boolean = true) => {
    setTranscript(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && !last.isFinal) {
        const newArr = [...prev];
        newArr[newArr.length - 1] = { ...last, text: last.text + text, isFinal };
        return newArr;
      }
      return [...prev, { role, text, timestamp: new Date(), isFinal }];
    });
  };

  const cleanupAudio = async () => {
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (streamRef.current && !externalStream) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (inputAudioContextRef.current) { await inputAudioContextRef.current.close(); inputAudioContextRef.current = null; }
    if (audioContextRef.current) { await audioContextRef.current.close(); audioContextRef.current = null; }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const connectToGemini = async () => {
    try {
      setConnectionState(ConnectionState.CONNECTING);
      
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = new AudioCtx({ sampleRate: 24000 });

      // Use External SIP Stream if available, otherwise fallback to local MIC
      const stream = externalStream || await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const systemInstruction = `
        You are the AI Voice Receptionist for ${knowledge.companyName}.
        OFFICE DATA: ${knowledge.content}
        GUIDELINES: 
        - Speak naturally. Help the caller based on office data.
        - You can transfer calls using transferCall tool.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          tools: [{ functionDeclarations: [transferTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        },
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            addTranscript('system', '✅ System Bridged');
            
            if (!inputAudioContextRef.current || !streamRef.current) return;
            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += Math.abs(inputData[i]);
              setVolume((sum / inputData.length) * 10);
              
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription?.text) {
              addTranscript('agent', message.serverContent.outputTranscription.text, false);
            }
            if (message.serverContent?.inputTranscription?.text) {
              addTranscript('user', message.serverContent.inputTranscription.text, true);
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
          },
          onerror: (err) => {
            setConnectionState(ConnectionState.ERROR);
            cleanupAudio();
          }
        }
      });
      sessionRef.current = sessionPromise;
    } catch (e: any) {
      setConnectionState(ConnectionState.ERROR);
      cleanupAudio();
    }
  };

  const disconnect = async (showSummary = false) => {
    if (sessionRef.current) {
        try { (await sessionRef.current).close(); } catch(e) {}
        sessionRef.current = null;
    }
    await cleanupAudio();
    setConnectionState(ConnectionState.DISCONNECTED);
    setCallState(showSummary ? 'SUMMARY' : 'IDLE');
  };

  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="relative w-[360px] h-[740px] bg-black rounded-[3.5rem] border-[10px] border-slate-900 shadow-2xl overflow-hidden flex flex-col ring-1 ring-slate-800">
        
        {/* Dynamic Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-8 bg-black rounded-b-2xl z-50 flex items-center justify-center">
            {connectionState === ConnectionState.CONNECTED && (
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-[9px] text-green-500 font-bold uppercase tracking-widest">Active Call</span>
                </div>
            )}
        </div>

        {/* --- IDLE STATE --- */}
        {callState === 'IDLE' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900 animate-in fade-in duration-500">
             <div className="text-5xl font-light text-white mb-2">09:41</div>
             <div className="text-slate-400 text-sm mb-12">Waiting for Call...</div>

             <div className="w-full bg-slate-800/40 rounded-2xl p-6 border border-slate-700/50 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-900/40">
                   <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </div>
                <h3 className="text-white font-bold text-center">Ready for Linphone</h3>
                <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest leading-relaxed">
                   Dial from Linphone to test the studio bridge directly.
                </p>
                <button 
                  onClick={() => setCallState('RINGING')} 
                  className="mt-4 px-6 py-2 bg-slate-800 rounded-full text-xs text-white hover:bg-slate-700 transition-colors"
                >
                   Simulate Local Call
                </button>
             </div>
          </div>
        )}

        {/* --- RINGING STATE --- */}
        {callState === 'RINGING' && (
          <div className="flex-1 flex flex-col items-center pt-24 pb-12 bg-slate-900/95 animate-in zoom-in-95 duration-500">
             <div className="text-slate-400 text-xs font-bold tracking-widest uppercase mb-2">Incoming Call</div>
             <h2 className="text-3xl text-white font-medium mb-1">{simulatedCallerName}</h2>
             <div className="text-slate-500 font-mono mb-auto">{simulatedCallerNumber}</div>

             <div className="w-full flex justify-around px-8">
                <button onClick={() => setCallState('IDLE')} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-xl">
                   <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11H8c-1.1 0-2-.9-2-2s.9-2 2-2h8c1.1 0 2 .9 2 2s-.9 2-2 2z"/></svg>
                </button>
                <button onClick={() => { setCallState('ACTIVE'); connectToGemini(); }} className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white shadow-xl animate-bounce">
                   <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.061 15.061 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1.01A11.36 11.36 0 018.59 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg>
                </button>
             </div>
          </div>
        )}

        {/* --- ACTIVE STATE --- */}
        {(callState === 'ACTIVE' || callState === 'TRANSFERRING') && (
           <div className="flex-1 flex flex-col bg-slate-900 pt-16 pb-8 animate-in slide-in-from-bottom-full duration-700">
              <div className="text-center mb-8">
                 <h3 className="text-xl text-white font-bold mb-1">{simulatedCallerName}</h3>
                 <div className="text-slate-400 text-xs font-mono">{formatTime(callDuration)}</div>
              </div>

              {/* Visualizer */}
              <div className="h-40 flex items-center justify-center mb-8 relative">
                 <div className={`absolute w-32 h-32 rounded-full border-4 border-blue-500/20 animate-ping`}></div>
                 <canvas ref={canvasRef} width={250} height={250} className="w-60 h-60 relative z-10" />
              </div>

              {/* Transcript */}
              <div className="flex-1 px-6 overflow-y-auto custom-scrollbar flex flex-col gap-3 mb-8" ref={scrollRef}>
                 {transcript.map((t, i) => (
                    <div key={i} className={`flex flex-col max-w-[85%] ${t.role === 'user' ? 'self-start' : t.role === 'agent' ? 'self-end' : 'self-center w-full'}`}>
                       <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${t.role === 'user' ? 'bg-slate-800 text-white rounded-tl-sm shadow-sm' : t.role === 'agent' ? 'bg-blue-600 text-white rounded-tr-sm shadow-md' : 'text-slate-500 italic text-center text-[10px]'}`}>
                          {t.text}
                       </div>
                    </div>
                 ))}
              </div>

              <div className="flex justify-center">
                 <button onClick={() => disconnect(true)} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all">
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11H8c-1.1 0-2-.9-2-2s.9-2 2-2h8c1.1 0 2 .9 2 2s-.9 2-2 2z"/></svg>
                 </button>
              </div>
           </div>
        )}

        {/* --- SUMMARY STATE --- */}
        {callState === 'SUMMARY' && (
           <div className="flex-1 flex flex-col p-8 bg-slate-950 animate-in fade-in duration-500">
              <h2 className="text-2xl font-bold text-white mb-6">Call Success</h2>
              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 mb-4">
                 <span className="text-[10px] text-slate-500 uppercase font-bold">Total Duration</span>
                 <p className="text-xl text-white font-mono">{formatTime(callDuration)}</p>
              </div>
              <button onClick={() => setCallState('IDLE')} className="mt-auto w-full py-4 bg-white text-black rounded-2xl font-bold active:scale-95 transition-all">Close Report</button>
           </div>
        )}

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/20 rounded-full"></div>
      </div>
    </div>
  );
};

export default AgentInterface;
