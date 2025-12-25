
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { ConnectionState, KnowledgeBase, TranscriptItem, CustomerProfile, InteractionRecord } from '../types';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';

interface AgentInterfaceProps {
  knowledge: KnowledgeBase;
  customers: CustomerProfile[];
  onCallComplete: (customerId: string, record: InteractionRecord, newCustomerProfile?: CustomerProfile) => void;
  externalStream?: MediaStream | null;
}

type CallState = 'IDLE' | 'RINGING' | 'ACTIVE' | 'TRANSFERRING' | 'SUMMARY';

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

const AgentInterface: React.FC<AgentInterfaceProps> = ({ knowledge, customers, onCallComplete, externalStream }) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [volume, setVolume] = useState<number>(0);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  
  const [activeCustomer, setActiveCustomer] = useState<CustomerProfile | null>(null);
  const [sentimentScore, setSentimentScore] = useState<number>(50);
  
  // Refs for Audio Processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-trigger when SIP call arrives
  useEffect(() => {
    if (externalStream && callState === 'IDLE') {
        setCallState('ACTIVE');
        connectToGemini(externalStream);
    } else if (!externalStream && callState === 'ACTIVE') {
        disconnect(true);
    }
  }, [externalStream]);

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

  const connectToGemini = async (streamInput?: MediaStream) => {
    if (connectionState === ConnectionState.CONNECTED) return;

    try {
      setConnectionState(ConnectionState.CONNECTING);
      addTranscript('system', '📞 Bridging SIP Audio to AI...');

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;

      let stream: MediaStream;
      if (streamInput) {
          stream = streamInput;
      } else {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const systemInstruction = `You are a helpful office receptionist for ${knowledge.companyName}. Speak Nepali politely. Content: ${knowledge.content}`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [transferTool] }],
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            addTranscript('system', '✅ AI Receptionist Online');
            if (!inputAudioContextRef.current || !streamRef.current) return;
            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += Math.abs(inputData[i]);
              setVolume((sum / inputData.length) * 5);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
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
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
            }
          },
          onerror: (err) => console.error(err),
          onclose: () => disconnect(true)
        }
      });
      sessionRef.current = sessionPromise;
    } catch (e: any) {
      setConnectionState(ConnectionState.ERROR);
      cleanupAudio();
    }
  };

  const cleanupAudio = () => {
    if (processorRef.current) processorRef.current.disconnect();
    if (streamRef.current && !externalStream) streamRef.current.getTracks().forEach(t => t.stop());
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
  };

  const disconnect = (showSummary = false) => {
    cleanupAudio();
    setConnectionState(ConnectionState.DISCONNECTED);
    setCallState(showSummary ? 'SUMMARY' : 'IDLE');
  };

  return (
    <div className="flex items-center justify-center h-full w-full p-4">
      <div className="relative w-full max-w-[360px] h-[720px] bg-black rounded-[3rem] border-8 border-slate-900 shadow-2xl overflow-hidden ring-1 ring-slate-800 flex flex-col">
        
        {/* Dynamic Island */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-b-xl z-50 flex items-center justify-center">
            {callState === 'ACTIVE' && (
                <div className="flex items-center gap-2 animate-pulse">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                    <span className="text-[8px] text-white font-bold">REC</span>
                </div>
            )}
        </div>

        {/* Interface Content */}
        {callState === 'IDLE' && (
            <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-slate-900">
                <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center mb-6 border border-slate-700">
                    <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </div>
                <h2 className="text-white font-bold text-lg mb-2">Ready for Calls</h2>
                <p className="text-slate-500 text-center text-xs px-4">
                    Call your AI account from your phone to start the conversation.
                </p>
                <div className="mt-8 px-4 py-2 bg-slate-800 rounded-full border border-slate-700 text-[10px] text-slate-400 font-mono">
                    {externalStream ? "Incoming detected..." : "Waiting for SIP registration..."}
                </div>
            </div>
        )}

        {callState === 'ACTIVE' && (
            <div className="h-full w-full flex flex-col bg-slate-900 pt-16">
                 <div className="flex flex-col items-center mb-8">
                     <div className="w-24 h-24 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold animate-pulse">
                            AI
                        </div>
                     </div>
                     <h3 className="text-white font-bold text-xl">Receptionist</h3>
                     <span className="text-green-500 text-xs font-mono uppercase mt-1 tracking-widest">On Call</span>
                 </div>

                 <div className="flex-1 px-6 overflow-y-auto custom-scrollbar" ref={scrollRef}>
                    <div className="space-y-4">
                        {transcript.map((t, i) => (
                            <div key={i} className={`flex flex-col ${t.role === 'agent' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs ${t.role === 'agent' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-300 rounded-tl-sm'}`}>
                                    {t.text}
                                </div>
                            </div>
                        ))}
                    </div>
                 </div>

                 <div className="p-10 flex justify-center">
                    <button onClick={() => disconnect(true)} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-xl shadow-red-900/40">
                         <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                 </div>
            </div>
        )}

        {callState === 'SUMMARY' && (
            <div className="h-full w-full bg-slate-950 flex flex-col items-center justify-center p-8">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-white font-bold text-xl mb-6">Call Completed</h2>
                <button onClick={() => setCallState('IDLE')} className="w-full py-4 bg-slate-800 text-white rounded-2xl font-bold">Close Report</button>
            </div>
        )}

      </div>
    </div>
  );
};

export default AgentInterface;
