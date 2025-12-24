import Fastify from 'fastify';
import fastifyWs from '@fastify/websocket';
import fastifyFormBody from '@fastify/formbody';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import Twilio from 'twilio';
import Redis from 'ioredis';

dotenv.config();

// ============================================================================
// AI VOICE SYSTEM - SERVER ENTRY POINT
// This is the process that must run on your cloud/on-prem server to receive calls.
// ============================================================================

const fastify = Fastify({
    logger: { level: 'error' } 
});

fastify.register(fastifyWs);
fastify.register(fastifyFormBody);

const PORT = process.env.PORT || 5050;
const API_KEY = process.env.API_KEY; 
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// NOISE GATE CONFIGURATION
// Adjust this value based on your SIP line quality.
// 500 = Sensitive (hears whispers), 2000 = Strict (needs loud voice)
const NOISE_THRESHOLD = 800; 

// Legacy Twilio Support
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const client = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// --- 1. INFRASTRUCTURE & SCALING ---
const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        if (times > 5) return null; 
        return Math.min(times * 50, 2000);
    },
    lazyConnect: true 
});

redis.on('error', (err) => {
    if (process.env.NODE_ENV !== 'production') console.warn("Redis warning (running in fallback mode):", err.message);
});

// --- 2. AUDIO PROCESSING HELPERS ---

// Calculate Volume (Root Mean Square) to detect voice vs background noise
const calculateRMS = (pcmBuffer) => {
    let sumSquares = 0;
    const int16Data = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
    const len = int16Data.length;
    if (len === 0) return 0;
    
    for(let i = 0; i < len; i++) {
        const sample = int16Data[i];
        sumSquares += (sample * sample);
    }
    return Math.sqrt(sumSquares / len);
};

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
    if (sample < 0) {
        sample = -sample;
        mask = 0x7F;
    } else {
        mask = 0xFF;
    }
    if (sample > MAX) sample = MAX;
    sample += BIAS;
    let exponent = 7;
    for (let i = 7; i >= 0; i--) {
        if ((sample >> (i + 3)) > 0) {
            exponent = i;
            break;
        }
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    return ~(mask ^ ((exponent << 4) | mantissa));
};

const downsampleTo8k = (buffer) => {
    const input = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
    const output = new Int16Array(Math.floor(input.length / 3));
    for (let i = 0; i < output.length; i++) {
        const idx = i * 3;
        output[i] = (idx + 2 < input.length) 
            ? (input[idx] + input[idx+1] + input[idx+2]) / 3
            : input[idx];
    }
    return Buffer.from(output.buffer);
};

const upsampleTo16k = (buffer) => {
    const input = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
    const output = new Int16Array(input.length * 2);
    for (let i = 0; i < input.length; i++) {
        output[i * 2] = input[i];
        output[i * 2 + 1] = (i < input.length - 1) 
            ? (input[i] + input[i + 1]) / 2 
            : input[i];
    }
    return Buffer.from(output.buffer);
};

const processTwilioAudio = (base64Data) => {
    const mulawBuffer = Buffer.from(base64Data, 'base64');
    const pcmBuffer = new Int16Array(mulawBuffer.length);
    for (let i = 0; i < mulawBuffer.length; i++) {
        pcmBuffer[i] = muLawToLinear(mulawBuffer[i]);
    }
    return upsampleTo16k(Buffer.from(pcmBuffer.buffer));
};

const processGeminiAudio = (rawPcmData) => {
    const pcmBuffer = Buffer.from(rawPcmData, 'base64');
    const downsampled = downsampleTo8k(pcmBuffer);
    const input = new Int16Array(downsampled.buffer);
    const mulawOutput = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
        mulawOutput[i] = linearToMuLaw(input[i]);
    }
    return Buffer.from(mulawOutput).toString('base64');
};

// --- 3. HEALTH CHECK ---
fastify.get('/health', async (req, reply) => {
    return { status: 'System Online', receiver: true };
});

// --- 4. SIGNALING ROUTE (Optional for SIP) ---
fastify.all('/incoming-call', async (req, reply) => {
    const twiml = `
    <Response>
        <Say language="ne-NP">Namaste. Connecting to AI.</Say>
        <Connect>
            <Stream url="wss://${req.headers.host}/media-stream" />
        </Connect>
    </Response>
    `;
    reply.type('text/xml').send(twiml);
});

// --- 5. THE "RECEIVER" - WEBSOCKET ROUTE ---
fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        let sessionPromise = null;
        let streamSid = null;
        let callSid = null;
        let isCleanedUp = false;

        console.log("📞 System: Call Connected via WebSocket");

        // --- UNIFIED CLEANUP FUNCTION ---
        // This runs if the call ends normally OR if the socket breaks
        const cleanupSession = async () => {
            if (isCleanedUp) return;
            isCleanedUp = true;

            console.log(`🛑 Cleanup: Closing resources for Call ${callSid || 'Unknown'}`);
            
            if (sessionPromise) {
                try {
                    const session = await sessionPromise;
                    session.close();
                    console.log("   -> Gemini Session Closed");
                } catch (e) {
                    console.log("   -> Gemini Session already closed or not ready");
                }
            }
        };

        connection.socket.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

                if (data.event === 'start') {
                    streamSid = data.start.streamSid;
                    callSid = data.start.callSid;
                    
                    let instruction = "You are a helpful office receptionist for Namaste Tech.";

                    sessionPromise = ai.live.connect({
                        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                        config: {
                            responseModalities: [Modality.AUDIO],
                            systemInstruction: instruction,
                            tools: [{ functionDeclarations: [{
                                name: "transferCall",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        destination: { type: "STRING" },
                                        extension: { type: "STRING" }
                                    },
                                    required: ["destination", "extension"]
                                }
                            }] }],
                            speechConfig: {
                                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                            },
                        },
                        callbacks: {
                            onopen: () => console.log("✨ System: Gemini AI Connected"),
                            onmessage: async (msg) => {
                                // If socket is already closed, stop processing
                                if (connection.socket.readyState !== 1) return;

                                if (msg.serverContent?.interrupted) {
                                    connection.socket.send(JSON.stringify({ 
                                        event: 'clear', 
                                        streamSid: streamSid 
                                    }));
                                    return;
                                }

                                if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                                    const rawAudio = msg.serverContent.modelTurn.parts[0].inlineData.data;
                                    const telephonyAudio = processGeminiAudio(rawAudio);
                                    
                                    try {
                                        connection.socket.send(JSON.stringify({
                                            event: 'media',
                                            streamSid: streamSid,
                                            media: { payload: telephonyAudio }
                                        }));
                                    } catch (err) {
                                        // Socket likely closed mid-send
                                        cleanupSession();
                                    }
                                }

                                if (msg.toolCall) {
                                    const call = msg.toolCall.functionCalls.find(fc => fc.name === 'transferCall');
                                    if (call) {
                                        console.log(`🔀 System: Transferring call to ${call.args.extension}`);
                                    }
                                }
                            },
                            onerror: (err) => console.error("Gemini Error:", err.message)
                        }
                    });

                } else if (data.event === 'media' && sessionPromise) {
                    // --- NOISE GATE IMPLEMENTATION ---
                    // 1. Process Audio
                    const pcm16k = processTwilioAudio(data.media.payload);
                    
                    // 2. Check Volume (RMS)
                    const rms = calculateRMS(pcm16k);
                    
                    // 3. Only send if volume is above threshold
                    if (rms > NOISE_THRESHOLD) {
                        const b64pcm = pcm16k.toString('base64');
                        sessionPromise.then(session => {
                            session.sendRealtimeInput({ 
                                media: { mimeType: "audio/pcm;rate=16000", data: b64pcm } 
                            });
                        }).catch(() => {
                             // If sending to Gemini fails, the session might be dead
                             cleanupSession();
                        });
                    }

                } else if (data.event === 'stop') {
                    console.log("📞 System: Call Ended Normally (Stop Event)");
                    cleanupSession();
                }
            } catch (e) {
                console.error("Socket Error:", e);
                cleanupSession();
            }
        });

        // --- HANDLE ABRUPT DISCONNECTIONS ---
        connection.socket.on('close', () => {
            console.log("⚠️ System: WebSocket Client Disconnected Abruptly");
            cleanupSession();
        });

        connection.socket.on('error', (err) => {
            console.error("⚠️ System: WebSocket Error", err);
            cleanupSession();
        });
    });
});

const shutdown = async () => {
    console.log('Shutting down AI System...');
    await fastify.close();
    if(redis.status === 'ready') await redis.quit();
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// START THE SYSTEM
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`✅ SYSTEM ONLINE: Listening for Calls on port ${PORT}`);
});