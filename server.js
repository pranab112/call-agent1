
import Fastify from 'fastify';
import fastifyWs from '@fastify/websocket';
import fastifyFormBody from '@fastify/formbody';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import Twilio from 'twilio';

dotenv.config();

// ============================================================================
// TWILIO AI VOICE SERVER
// Connects Twilio Media Streams (G.711 Mu-Law) to Gemini Live (PCM 16/24kHz)
// ============================================================================

const fastify = Fastify({ logger: { level: 'error' } });
fastify.register(fastifyWs);
fastify.register(fastifyFormBody);

const PORT = process.env.PORT || 5050;
const API_KEY = process.env.API_KEY; 

// ENABLE CORS (So the Frontend ConnectPanel can ping this server)
fastify.addHook('onRequest', (request, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === 'OPTIONS') {
        reply.send();
        return;
    }
    done();
});

// --- AUDIO CONVERSION HELPERS ---

// Convert Mu-Law (Twilio) to Linear PCM 16-bit
const muLawToLinear = (ulawByte) => {
    ulawByte = ~ulawByte;
    const sign = (ulawByte & 0x80);
    const exponent = (ulawByte >> 4) & 0x07;
    const mantissa = ulawByte & 0x0F;
    let sample = (2 * mantissa + 33) << (12 - exponent);
    return (sign ? -sample : sample);
};

const linearToMuLaw = (pcmSample) => {
    const BIAS = 0x84;
    const MAX = 32635;
    let mask;
    let sample = pcmSample;
    if (sample < 0) { sample = -sample; mask = 0x7F; } else { mask = 0xFF; }
    if (sample > MAX) sample = MAX;
    sample += BIAS;
    let exponent = 7;
    for (let i = 7; i >= 0; i--) {
        if ((sample >> (i + 3)) > 0) { exponent = i; break; }
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    return ~(mask ^ ((exponent << 4) | mantissa));
};

// Process Twilio Audio: 8kHz Mu-Law -> 16kHz PCM
const processTwilioAudio = (base64Data) => {
    const mulawBuffer = Buffer.from(base64Data, 'base64');
    const pcmBuffer = new Int16Array(mulawBuffer.length);
    for (let i = 0; i < mulawBuffer.length; i++) {
        pcmBuffer[i] = muLawToLinear(mulawBuffer[i]);
    }
    // Simple Upsample 8k -> 16k (Doubling samples)
    const upsampled = new Int16Array(pcmBuffer.length * 2);
    for (let i = 0; i < pcmBuffer.length; i++) {
        upsampled[i * 2] = pcmBuffer[i];
        upsampled[i * 2 + 1] = pcmBuffer[i];
    }
    return Buffer.from(upsampled.buffer);
};

// Process Gemini Audio: 24kHz/16kHz PCM -> 8kHz Mu-Law
const processGeminiAudio = (rawPcmData) => {
    const pcmBuffer = Buffer.from(rawPcmData, 'base64');
    const int16Data = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength / 2);
    
    // Downsample (Ratio 3 for 24kHz -> 8kHz)
    const downsampleRatio = 3; 
    const outputSize = Math.floor(int16Data.length / downsampleRatio);
    const mulawOutput = new Uint8Array(outputSize);
    
    for (let i = 0; i < outputSize; i++) {
        const sample = int16Data[i * downsampleRatio];
        mulawOutput[i] = linearToMuLaw(sample);
    }
    return Buffer.from(mulawOutput).toString('base64');
};

// --- ROUTES ---

// Health Check for Frontend
fastify.get('/', async () => ({ status: 'online', service: 'Twilio AI Voice Server' }));

// TWILIO WEBHOOK HANDLER
fastify.all('/incoming-call', async (req, reply) => {
    console.log("☎️  Incoming Call Detected!");
    const host = req.headers.host;
    const protocol = host.includes('localhost') ? 'ws' : 'wss';
    
    // TwiML to start Media Stream
    const twiml = `
    <Response>
        <Connect>
            <Stream url="${protocol}://${host}/media-stream" />
        </Connect>
    </Response>
    `;
    reply.type('text/xml').send(twiml);
});

// WEBSOCKET HANDLER
fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log("⚡ Twilio Media Stream Connected");
        
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        let sessionPromise = null;
        let streamSid = null;

        // Initialize Gemini Session
        const ensureSession = () => {
            if (sessionPromise) return sessionPromise;
            
            if (!API_KEY) {
                console.error("❌ API_KEY is missing in .env file!");
                return;
            }

            const instruction = `You are a polite office receptionist for Namaste Tech. 
            Speak in Nepali. Keep answers brief and professional. 
            Your goal is to help the caller with office information.`;

            sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: instruction,
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                },
                callbacks: {
                    onopen: () => console.log("✨ Gemini Session Started"),
                    onmessage: async (msg) => {
                        if (connection.socket.readyState !== 1) return;

                        // Handle Interruption (User spoke while AI was speaking)
                        if (msg.serverContent?.interrupted && streamSid) {
                            connection.socket.send(JSON.stringify({ 
                                event: 'clear', 
                                streamSid: streamSid 
                            }));
                            return;
                        }

                        // Handle Audio from Gemini
                        if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                            const rawAudio = msg.serverContent.modelTurn.parts[0].inlineData.data;
                            const twilioAudio = processGeminiAudio(rawAudio);
                            
                            if (streamSid) {
                                connection.socket.send(JSON.stringify({
                                    event: 'media',
                                    streamSid: streamSid,
                                    media: { payload: twilioAudio }
                                }));
                            }
                        }
                    },
                    onerror: (err) => console.error("❌ Gemini Error:", err.message),
                    onclose: () => console.log("🔒 Gemini Session Closed")
                }
            });
            return sessionPromise;
        };

        connection.socket.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

                if (data.event === 'start') {
                    streamSid = data.start.streamSid;
                    console.log(`▶️  Stream Started: ${streamSid}`);
                    ensureSession(); // Start AI immediately
                } 
                else if (data.event === 'media') {
                    if (sessionPromise) {
                        const session = await sessionPromise;
                        // Convert 8k MuLaw -> 16k PCM
                        const pcmData = processTwilioAudio(data.media.payload);
                        session.sendRealtimeInput({ 
                            media: { mimeType: "audio/pcm;rate=16000", data: pcmData.toString('base64') } 
                        });
                    }
                } 
                else if (data.event === 'stop') {
                    console.log("⏹️  Stream Stopped");
                    if (sessionPromise) (await sessionPromise).close();
                }
            } catch (e) {
                console.error("Socket Error:", e);
            }
        });

        connection.socket.on('close', async () => {
            if (sessionPromise) try { (await sessionPromise).close(); } catch(e){}
        });
    });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`✅ Twilio Server Listening on port ${PORT}`);
    console.log(`   (Allowing CORS requests for Dashboard checks)`);
});
