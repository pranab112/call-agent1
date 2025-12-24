import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { ConnectionState, KnowledgeBase, TranscriptItem, CustomerProfile, InteractionRecord } from '../types';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';

interface AgentInterfaceProps {
  knowledge: KnowledgeBase;
  customers: CustomerProfile[];
  onCallComplete: (customerId: string, record: InteractionRecord) => void;
}

type CallState = 'IDLE' | 'RINGING' | 'ACTIVE' | 'TRANSFERRING' | 'SUMMARY';

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

const AgentInterface: React.FC<AgentInterfaceProps> = ({ knowledge, customers, onCallComplete }) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [volume, setVolume] = useState<number>(0);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [realPhoneLoading, setRealPhoneLoading] = useState(false);
  
  // Enterprise Features State
  const [activeCustomer, setActiveCustomer] = useState<CustomerProfile | null>(null);
  const [sentimentScore, setSentimentScore] = useState<number>(50); // 0 (Bad) to 100 (Good)
  
  // Simulation State
  const [simulatedCallerName, setSimulatedCallerName] = useState("Hari Bahadur");
  const [simulatedCallerNumber, setSimulatedCallerNumber] = useState("+977 9841-123456");
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refs for Visualizer
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  // --- HELPER: Simple Sentiment Analysis ---
  useEffect(() => {
    if (transcript.length === 0) return;
    const lastItem = transcript[transcript.length - 1];
    if (lastItem.role === 'user' && lastItem.isFinal) {
      const text = lastItem.text.toLowerCase();
      // Keywords for demo purposes (English + Nepali Romanized)
      const negativeWords = ['bad', 'slow', 'angry', 'issue', 'problem', 'error', 'broken', 'expensive', 'samasya', 'bigryo', 'bekkar'];
      const positiveWords = ['good', 'great', 'thanks', 'happy', 'fast', 'helpful', 'amazing', 'dhanyabad', 'ramro', 'sahi'];
      
      let change = 0;
      if (negativeWords.some(w => text.includes(w))) change -= 20;
      if (positiveWords.some(w => text.includes(w))) change += 10;
      
      setSentimentScore(prev => Math.min(100, Math.max(0, prev + change)));
    }
  }, [transcript]);

  const getSentimentColor = (score: number) => {
    if (score < 30) return 'text-red-500';
    if (score < 60) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getSentimentLabel = (score: number) => {
    if (score < 30) return 'Frustrated';
    if (score < 60) return 'Neutral';
    return 'Happy';
  };

  const addTranscript = (role: TranscriptItem['role'], text: string, isFinal: boolean = true) => {
    setTranscript(prev => {
      // If the last item is from the same role and not final, update it
      const last = prev[prev.length - 1];
      if (last && last.role === role && !last.isFinal) {
        const newArr = [...prev];
        newArr[newArr.length - 1] = { ...last, text: last.text + text, isFinal };
        return newArr;
      }
      return [...prev, { role, text, timestamp: new Date(), isFinal }];
    });
  };

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  // Lookup customer by phone
  const findCustomer = (phone: string) => {
      // Normalize simple matching for demo
      const normalizedInput = phone.replace(/\s|-/g, '');
      return customers.find(c => c.phone.replace(/\s|-/g, '').includes(normalizedInput) || normalizedInput.includes(c.phone.replace(/\s|-/g, '')));
  };

  // Trigger Real Call via Backend
  const triggerRealCall = async () => {
    const phoneNumber = prompt("Enter the customer's real phone number (e.g. +9779841XXXXXX):", "+977");
    if (!phoneNumber) return;

    setRealPhoneLoading(true);
    addTranscript('system', 'Uploading Data & Requesting Call...');
    
    // CRM Lookup
    const customer = findCustomer(phoneNumber);
    if (customer) {
        setActiveCustomer(customer);
        addTranscript('system', `CRM Match: ${customer.name}`);
    } else {
        setActiveCustomer(null);
        addTranscript('system', `New/Unknown Caller: ${phoneNumber}`);
    }
    setSentimentScore(50);
    
    const dynamicSystemInstruction = `
        You are the AI Voice Receptionist for ${knowledge.companyName}.
        Your goal is to politely and professionally answer phone calls based on the provided office data.
        IMPORTANT LANGUAGE REQUIREMENT: Speak in **Nepali** (नेपाली). Use polite forms ("Hajur", "Tapai").
        OFFICE DATA: ${knowledge.content}
        HUMAN HANDOFF: If the caller asks for a human or specific person, use "transferCall".
        CALLER INFO: You are speaking with ${customer ? customer.name : "a new customer"}.
      `;
    
    try {
        const response = await fetch('http://localhost:5050/make-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: phoneNumber, systemInstruction: dynamicSystemInstruction })
        });
        
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const data = await response.json();
        if (data.success) {
            addTranscript('system', `✅ Call Initiated! SID: ${data.callSid}`);
            alert(`Calling ${phoneNumber}... Answer to speak to the AI.`);
            setCallState('ACTIVE'); // Assume active once backend trigger succeeds (for demo flow)
        } else {
            throw new Error(data.error || 'Unknown server error');
        }
    } catch (e: any) {
        console.error("Call Trigger Error:", e);
        let userMessage = e.message;
        if (e.message.includes("Failed to fetch")) userMessage = "Cannot reach backend (localhost:5050).";
        addTranscript('system', `❌ Error: ${userMessage}`);
        alert(`Failed: ${userMessage}`);
    } finally {
        setRealPhoneLoading(false);
    }
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

  const cleanupAudio = async () => {
    if (processorRef.current) { 
        processorRef.current.disconnect(); 
        processorRef.current = null; 
    }
    if (streamRef.current) { 
        streamRef.current.getTracks().forEach(track => track.stop()); 
        streamRef.current = null; 
    }
    if (inputAudioContextRef.current) { 
        await inputAudioContextRef.current.close().catch(e => console.error("Input AC Close Err", e));
        inputAudioContextRef.current = null; 
    }
    if (audioContextRef.current) { 
        await audioContextRef.current.close().catch(e => console.error("Output AC Close Err", e));
        audioContextRef.current = null; 
    }
    sourcesRef.current.forEach(source => { 
        try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const connectToGemini = async () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) return;

    try {
      setConnectionState(ConnectionState.CONNECTING);
      addTranscript('system', 'Initializing Secure Connection...');

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err: any) {
        addTranscript('system', `❌ Mic Error: ${err.name}`);
        setConnectionState(ConnectionState.ERROR);
        setCallState('IDLE');
        cleanupAudio();
        return; 
      }
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const systemInstruction = `You are the AI Voice Receptionist for ${knowledge.companyName}. OFFICE DATA: ${knowledge.content}. GUIDELINES: Speak Nepali. CALLER: ${activeCustomer ? activeCustomer.name : 'Unknown'}`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [transferTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            addTranscript('system', '✅ Secure Line Connected');
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
             // Handle Agent Transcription
             if (message.serverContent?.outputTranscription?.text) {
               addTranscript('agent', message.serverContent.outputTranscription.text, false);
             }
             
             // Handle User Transcription (Requires config inputAudioTranscription: {})
             if (message.serverContent?.inputTranscription?.text) {
                addTranscript('user', message.serverContent.inputTranscription.text, true);
             }
             
             if (message.toolCall) {
                const responses = message.toolCall.functionCalls.map((fc) => {
                  if (fc.name === 'transferCall') {
                    const { destination, extension } = fc.args as any;
                    addTranscript('system', `TRANSFER INITIATED: ${destination} (Ext: ${extension})`);
                    setTransferTarget({ destination, extension });
                    setCallState('TRANSFERRING');
                    setTimeout(() => { disconnect(true); }, 4000);
                    return { id: fc.id, name: fc.name, response: { result: 'ok' } };
                  }
                  return { id: fc.id, name: fc.name, response: { result: 'Unknown' } };
                });
                sessionPromise.then((session) => session.sendToolResponse({ functionResponses: responses }));
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
             // Ensure we don't trigger disconnect loop if already disconnected
             setConnectionState(prev => {
                if (prev !== ConnectionState.DISCONNECTED && callState !== 'TRANSFERRING') {
                    disconnect(true);
                }
                return ConnectionState.DISCONNECTED;
             });
          },
          onerror: (err: any) => {
            console.error(err);
            addTranscript('system', `❌ Error: ${err.message}`);
            setConnectionState(ConnectionState.ERROR);
            cleanupAudio();
          }
        }
      });
      
      sessionRef.current = sessionPromise;

      sessionPromise.catch((err: any) => {
         addTranscript('system', `❌ Connection Failed: ${err.message}`);
         setConnectionState(ConnectionState.ERROR);
         setCallState('IDLE');
         cleanupAudio();
      });
      
    } catch (e: any) {
      addTranscript('system', `❌ Setup Failed: ${e.message}`);
      setConnectionState(ConnectionState.ERROR);
      setCallState('IDLE');
      cleanupAudio();
    }
  };

  const disconnect = async (showSummary = false) => {
    // 1. Force close the Gemini session
    if (sessionRef.current) {
        try {
            const session = await sessionRef.current;
            session.close();
        } catch (err) {
            console.log("Session already closed or failed to close", err);
        }
        sessionRef.current = null;
    }

    // 2. Cleanup Audio Contexts
    await cleanupAudio();
    setConnectionState(ConnectionState.DISCONNECTED);

    if (showSummary) {
        setCallState('SUMMARY');
    } else {
        setCallState('IDLE');
        setTransferTarget(null);
    }
  };

  const closeSummary = () => {
      // SAVE TO CRM
      if (activeCustomer) {
        const lastAgentMsg = transcript.filter(t => t.role === 'agent').pop()?.text;
        const lastUserMsg = transcript.filter(t => t.role === 'user').pop()?.text;
        const summary = transferTarget ? `Transferred to ${transferTarget.destination}` : (lastUserMsg || "General Inquiry");

        const newRecord: InteractionRecord = {
            id: `INT-${Date.now()}`,
            date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
            type: 'Inbound',
            duration: formatTime(callDuration),
            summary: summary,
            transcript: transcript.filter(t => t.role !== 'system'),
            sentimentScore: sentimentScore,
            status: transferTarget ? 'Transferred' : 'Resolved',
            transferDestination: transferTarget?.destination
        };
        onCallComplete(activeCustomer.id, newRecord);
      }

      setCallState('IDLE');
      setTransferTarget(null);
      setTranscript([]);
      setCallDuration(0);
      setEstimatedCost(0);
      setActiveCustomer(null);
      setSentimentScore(50);
  };

  const startSimulatedCall = () => {
    setTranscript([]);
    setCallDuration(0);
    setEstimatedCost(0);
    setSentimentScore(50);
    
    // Simulate CRM Match
    const found = findCustomer(simulatedCallerNumber);
    if(found) {
        setActiveCustomer(found);
    } else {
        // Create temp profile for visualization
        setActiveCustomer({
            id: 'TEMP',
            name: simulatedCallerName,
            phone: simulatedCallerNumber,
            email: 'unknown@caller.com',
            plan: 'Standard',
            accountValue: 'N/A',
            lastInteraction: 'First Call',
            status: 'New',
            history: []
        });
    }

    setCallState('RINGING');
  };

  const startCountdown = (seconds: number) => {
    // Pick a random number from DB for simulation, or generate random
    if (Math.random() > 0.3 && customers.length > 0) {
        const r = customers[Math.floor(Math.random() * customers.length)];
        setSimulatedCallerName(r.name);
        setSimulatedCallerNumber(r.phone);
    } else {
        const suffix = Math.floor(100000 + Math.random() * 900000);
        setSimulatedCallerName("Unknown Caller");
        setSimulatedCallerNumber(`+977 9841-${suffix}`);
    }
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
      
      // Dynamic color based on sentiment if active
      if (callState === 'ACTIVE') {
         ctx.fillStyle = sentimentScore < 40 ? '#7f1d1d' : sentimentScore > 70 ? '#14532d' : '#1e293b';
      }
      
      ctx.font = 'bold 48px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#94a3b8'; // Text color
      ctx.fillText('AI', centerX, centerY);

      if (connectionState === ConnectionState.CONNECTED && callState !== 'TRANSFERRING') {
        const rings = 3;
        for (let i = 0; i < rings; i++) {
            const r = 80 + breath + (i * 20) + (volume * 100 * (1/(i+1)));
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            // Ring color logic
            ctx.strokeStyle = `rgba(96, 165, 250, ${0.3 - (i * 0.1)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [callState, connectionState, volume, sentimentScore]);

  return (
    <div className="flex items-center justify-center h-full w-full p-4">
      <div className="relative w-full max-w-[360px] h-[720px] bg-black rounded-[3rem] border-8 border-slate-900 shadow-2xl overflow-hidden ring-1 ring-slate-800 flex flex-col select-none">
        
        {/* Dynamic Island / Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-b-xl z-50 flex items-center justify-center">
            {/* Visual Feedback for Connection */}
            {connectionState === ConnectionState.CONNECTED && callState === 'ACTIVE' && (
                <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                    <span className="text-[10px] text-green-500 font-bold tracking-tight">LIVE AUDIO</span>
                </div>
            )}
        </div>
        
        <div className="absolute top-2 w-full px-7 flex justify-between text-white text-[10px] font-medium z-40 select-none opacity-80">
           <span>9:41</span>
           <div className="flex gap-1.5 items-center">
             <span>{currentCarrier}</span>
             <div className="w-5 h-2.5 border border-slate-500 rounded-sm relative ml-1"><div className="absolute top-0 left-0 bg-white h-full w-[80%]"></div></div>
           </div>
        </div>

        {/* --- STATE: IDLE --- */}
        {callState === 'IDLE' && (
          <div className="h-full w-full bg-slate-900 relative flex flex-col items-center pt-24 pb-8 px-6 transition-opacity duration-300">
             <div className="text-6xl font-thin text-white mb-2 tracking-tighter opacity-90">09:41</div>
             <div className="text-slate-400 text-sm font-medium mb-8">Thursday, May 23</div>

             {/* Phone Setup Card */}
             <div className="w-full bg-slate-800/40 backdrop-blur-md rounded-2xl p-4 mb-4 border border-white/5 shadow-xl space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                   <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                   </div>
                   <span className="text-xs font-bold text-slate-200">Simulation Setup</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                     <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">Caller ID Name</label>
                     <input type="text" value={simulatedCallerName} onChange={(e) => setSimulatedCallerName(e.target.value)}
                       className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition-colors placeholder:text-slate-600" placeholder="Name" />
                  </div>
                  <div>
                     <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">Caller Number</label>
                     <input type="text" value={simulatedCallerNumber} onChange={(e) => setSimulatedCallerNumber(e.target.value)}
                       className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono outline-none focus:border-blue-500/50 transition-colors placeholder:text-slate-600" placeholder="+977..." />
                  </div>
                </div>

                <div className="pt-2">
                   {countdown !== null ? (
                       <button disabled className="w-full py-3 bg-blue-600/20 border border-blue-500/50 rounded-xl text-blue-400 font-bold flex items-center justify-center animate-pulse transition-all">
                           Incoming in {countdown}s...
                       </button>
                    ) : (
                       <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => startCountdown(5)} className="py-2.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/30 rounded-xl text-slate-200 text-xs font-medium transition-all active:scale-95">
                             Simulate (5s)
                          </button>
                          <button onClick={startSimulatedCall} className="py-2.5 bg-blue-600 hover:bg-blue-500 border border-blue-400/20 rounded-xl text-white text-xs font-bold transition-all active:scale-95 shadow-lg shadow-blue-900/20">
                             Call Now
                          </button>
                       </div>
                    )}
                </div>
             </div>

             {/* Real Call Action */}
             <div className="mt-auto w-full">
                <button onClick={triggerRealCall} disabled={realPhoneLoading} className="w-full py-4 bg-gradient-to-r from-green-900/40 to-emerald-900/40 hover:from-green-900/60 hover:to-emerald-900/60 backdrop-blur-md border border-green-500/20 rounded-2xl text-green-400 font-medium flex items-center justify-center gap-3 transition-all active:scale-95 group">
                   <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                   </div>
                   <span className="text-sm">Connect Real Phone</span>
                </button>
                <p className="text-[10px] text-slate-500 text-center mt-3">
                   Requires Twilio Server running locally
                </p>
             </div>
          </div>
        )}

        {/* --- STATE: RINGING --- */}
        {callState === 'RINGING' && (
          <div className="h-full w-full bg-slate-900/90 backdrop-blur-xl relative flex flex-col items-center pt-24 pb-12 px-6 animate-in fade-in zoom-in-95 duration-500">
             <div className="flex flex-col items-center gap-2 mb-auto mt-10">
                <span className="text-slate-400 text-xs font-bold tracking-widest uppercase">Incoming Call</span>
                <h2 className="text-3xl text-white font-light tracking-tight text-center">{simulatedCallerName}</h2>
                <span className="text-slate-500 text-sm tracking-wide">{simulatedCallerNumber}</span>
                
                {activeCustomer && activeCustomer.id !== 'TEMP' && (
                    <div className="mt-6 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl flex flex-col items-center backdrop-blur-md">
                        <span className="text-blue-400 text-[10px] font-bold tracking-wider uppercase mb-1">CRM Match Found</span>
                        <div className="flex gap-2 text-xs text-slate-300">
                             <span>{activeCustomer.plan} Plan</span>
                             <span>•</span>
                             <span>{activeCustomer.status}</span>
                        </div>
                    </div>
                )}
             </div>
             
             <div className="w-full flex justify-between items-center px-8 mb-16">
                <div className="flex flex-col items-center gap-3">
                   <button onClick={declineCall} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-xl shadow-red-900/20 hover:bg-red-600 transition-all active:scale-90">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11H8c-1.1 0-2-.9-2-2s.9-2 2-2h8c1.1 0 2 .9 2 2s-.9 2-2 2z"/></svg>
                   </button>
                   <span className="text-white text-xs font-medium opacity-80">Decline</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                   <button onClick={answerCall} className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white shadow-xl shadow-green-900/20 hover:bg-green-600 transition-all active:scale-90 animate-bounce-short">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.061 15.061 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1.01A11.36 11.36 0 018.59 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg>
                   </button>
                   <span className="text-white text-xs font-medium opacity-80">Accept</span>
                </div>
             </div>
          </div>
        )}

        {/* --- STATE: ACTIVE --- */}
        {(callState === 'ACTIVE' || callState === 'TRANSFERRING') && (
          <div className="h-full w-full bg-slate-900 relative flex flex-col items-center pt-10 pb-4 animate-in slide-in-from-bottom-full duration-500">
             
             {/* CRM Smart Overlay */}
             {activeCustomer && (
                <div className="w-[90%] bg-slate-800/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 mb-4 shadow-2xl z-20 animate-in slide-in-from-top-4 duration-700">
                    <div className="flex justify-between items-start mb-3 border-b border-slate-700/50 pb-3">
                         <div className="overflow-hidden">
                             <h4 className="text-white font-bold text-sm truncate">{activeCustomer.name}</h4>
                             <span className="text-[10px] text-slate-400 uppercase tracking-wider">{activeCustomer.id}</span>
                         </div>
                         <div className={`px-2 py-1 rounded text-[10px] font-bold shrink-0 ${activeCustomer.plan === 'Enterprise' ? 'bg-purple-900/50 text-purple-200 border border-purple-700/30' : 'bg-blue-900/50 text-blue-200 border border-blue-700/30'}`}>
                             {activeCustomer.plan}
                         </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-900/50 rounded p-1.5">
                            <span className="block text-[9px] text-slate-500 uppercase font-semibold">History</span>
                            <span className="text-[10px] text-slate-300 truncate block">{activeCustomer.history.length} Interactions</span>
                        </div>
                        <div className="bg-slate-900/50 rounded p-1.5">
                            <span className="block text-[9px] text-slate-500 uppercase font-semibold">Acct Value</span>
                            <span className="text-[10px] text-green-400 font-mono">{activeCustomer.accountValue}</span>
                        </div>
                    </div>
                </div>
             )}

             {/* Call Header */}
             <div className="flex flex-col items-center gap-1 mb-2 z-10">
                {callState === 'TRANSFERRING' ? (
                   <>
                    <h3 className="text-lg text-blue-400 font-medium animate-pulse">Transferring...</h3>
                    <span className="text-white text-md">{transferTarget?.destination}</span>
                   </>
                ) : (
                   <>
                    <span className="text-slate-400 text-xs tracking-widest font-mono bg-slate-800/50 px-2 py-0.5 rounded text-[10px]">{formatTime(callDuration)}</span>
                    <div className="flex items-center gap-2 mt-2 px-3 py-1 bg-slate-800/80 backdrop-blur rounded-full border border-slate-700/30">
                        <div className={`w-1.5 h-1.5 rounded-full ${getSentimentColor(sentimentScore)}`}></div>
                        <span className={`text-[10px] font-bold ${getSentimentColor(sentimentScore)}`}>
                            {getSentimentLabel(sentimentScore)} ({sentimentScore}%)
                        </span>
                    </div>
                   </>
                )}
             </div>

             {/* Live Transcript / Chat View */}
             <div className="flex-1 w-full px-4 overflow-y-auto custom-scrollbar relative z-0 mb-4 mask-image-linear-gradient" ref={scrollRef}>
                 <div className="flex flex-col gap-3 pb-2 pt-4">
                    {transcript.length === 0 && (
                        <div className="flex flex-col items-center justify-center mt-10 opacity-50">
                            <div className="w-8 h-8 rounded-full border-2 border-t-transparent border-slate-500 animate-spin mb-2"></div>
                            <div className="text-center text-slate-500 text-xs">Listening...</div>
                        </div>
                    )}
                    {transcript.map((item, i) => (
                        <div key={i} className={`flex flex-col max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300 ${item.role === 'user' ? 'self-start items-start' : item.role === 'agent' ? 'self-end items-end' : 'self-center items-center w-full'}`}>
                            {item.role !== 'system' && <span className="text-[9px] text-slate-500 mb-0.5 ml-1 mr-1 capitalize opacity-70">{item.role === 'agent' ? 'AI Receptionist' : simulatedCallerName}</span>}
                            <div className={`px-3 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm 
                                ${item.role === 'user' ? 'bg-slate-800 text-slate-200 rounded-tl-sm' : 
                                  item.role === 'agent' ? 'bg-blue-600 text-white rounded-tr-sm' : 
                                  'bg-transparent text-slate-500 text-[10px] text-center w-full italic border-t border-b border-slate-800/50 py-1 my-1'}`}>
                                {item.text}
                            </div>
                        </div>
                    ))}
                 </div>
             </div>

             {/* Visualizer */}
             <div className="h-20 w-full flex items-center justify-center shrink-0 mb-6">
                 <canvas ref={canvasRef} width={100} height={100} className="w-[80px] h-[80px]" />
             </div>

             {/* Controls */}
             <div className="grid grid-cols-3 gap-6 mb-6 px-8 w-full place-items-center">
                 <button className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-700 transition-colors">
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                 </button>
                 
                 <button onClick={() => disconnect(true)} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-xl shadow-red-900/30 hover:bg-red-600 transition-all active:scale-95">
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11H8c-1.1 0-2-.9-2-2s.9-2 2-2h8c1.1 0 2 .9 2 2s-.9 2-2 2z"/></svg>
                 </button>

                 <button className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-700 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                 </button>
             </div>
          </div>
        )}

        {/* --- STATE: SUMMARY (Post-Call Analytics) --- */}
        {callState === 'SUMMARY' && (
            <div className="h-full w-full bg-slate-950 relative flex flex-col pt-12 pb-6 px-4 animate-in fade-in duration-500">
                <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold text-white">Call Report</h2>
                    <span className="text-xs text-slate-500 font-mono">{new Date().toLocaleTimeString()}</span>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center">
                        <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Duration</div>
                        <div className="text-2xl text-white font-light tracking-tight">{formatTime(callDuration)}</div>
                    </div>
                    <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center">
                        <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Sentiment</div>
                        <div className={`text-2xl font-bold ${getSentimentColor(sentimentScore)}`}>{sentimentScore}%</div>
                    </div>
                    
                    <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 col-span-2">
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-slate-400 text-[10px] uppercase font-bold">Performance Score</div>
                            <span className="text-[10px] text-green-400 bg-green-900/30 px-2 py-1 rounded border border-green-900/50">Excellent</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                             <div className="bg-gradient-to-r from-blue-500 to-green-500 h-full w-[96%]"></div>
                        </div>
                    </div>
                </div>

                {/* Success Message for CRM */}
                {activeCustomer && (
                     <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-4 flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                             <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                         </div>
                         <div>
                             <p className="text-sm font-bold text-green-400">Synced to CRM</p>
                             <p className="text-[10px] text-slate-400 leading-tight">Interaction recorded for <br/> <span className="text-slate-300">{activeCustomer.name}</span></p>
                         </div>
                     </div>
                )}

                <button onClick={closeSummary} className="mt-auto w-full py-4 bg-white text-black rounded-2xl font-bold text-sm hover:bg-slate-200 transition-colors shadow-lg">
                    Done
                </button>
            </div>
        )}

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white rounded-full opacity-30"></div>
      </div>
    </div>
  );
};

export default AgentInterface;