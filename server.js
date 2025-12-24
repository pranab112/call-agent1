import Fastify from 'fastify';
import fastifyWs from '@fastify/websocket';
import fastifyFormBody from '@fastify/formbody';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import Twilio from 'twilio';
import Redis from 'ioredis';

dotenv.config();

const fastify = Fastify({
    logger: { level: 'error' } // Reduce logging overhead at scale
});

fastify.register(fastifyWs);
fastify.register(fastifyFormBody);

const PORT = process.env.PORT || 5050;
const API_KEY = process.env.API_KEY; 
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Twilio Config
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER; 
const HUMAN_OPERATOR_NUMBER = process.env.HUMAN_OPERATOR_NUMBER || process.env.MY_REAL_PHONE_NUMBER; 

const client = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// --- SCALING INFRASTRUCTURE ---

// 1. Redis Connection (Shared State for Horizontal Scaling)
// If Redis fails, the pod should probably crash/restart in K8s, or fallback to memory (risky at scale)
const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        if (times > 5) return null; // Stop retrying after 5 attempts
        return Math.min(times * 50, 2000);
    },
    // Mock for local development without Redis
    lazyConnect: true 
});

redis.on('error', (err) => {
    if (process.env.NODE_ENV !== 'production') console.warn("Redis warning (running in fallback mode):", err.message);
});

// 2. Async Queue Simulation (e.g., BullMQ)
// Offload expensive database writes or analytics from the realtime WebSocket loop
const analyticsQueue = {
    add: async (jobName, data) => {
        // In production: await realQueue.add(jobName, data);
        console.log(`[Queue] Job added: ${jobName}`, data.callSid);
    }
};

// --- AUDIO PROCESSING UTILS ---
// Optimized bitwise operations for high throughput
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

// --- ROUTES ---

// Kubernetes Liveness/Readiness Probes
fastify.get('/health', async (req, reply) => {
    try {
        // Check Redis connectivity
        if (redis.status === 'ready' || redis.status === 'connecting') {
             return { status: 'ok', workerId: process.pid };
        }
        // Fallback if strictly mocking
        return { status: 'ok', mode: 'local' };
    } catch (e) {
        reply.code(503).send({ status: 'error', details: e.message });
    }
});

fastify.post('/make-call', async (req, reply) => {
    const { to, systemInstruction } = req.body;
    if (!to) return reply.status(400).send({ error: 'Missing phone number' });

    try {
        const call = await client.calls.create({
            to: to,
            from: TWILIO_PHONE_NUMBER,
            url: `https://${req.headers.host}/incoming-call`
        });

        // STATELESS: Store instruction in Redis instead of local Map
        // Expires in 5 minutes to prevent memory leaks in Redis
        try {
            await redis.set(`call:${call.sid}:instruction`, systemInstruction, 'EX', 300);
        } catch (e) {
            // Fallback for local dev without Redis
            global.mockCache = global.mockCache || new Map();
            global.mockCache.set(call.sid, systemInstruction);
        }

        reply.send({ success: true, callSid: call.sid });
    } catch (error) {
        console.error("Twilio Error:", error);
        reply.status(500).send({ error: error.message });
    }
});

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

// --- WEBSOCKET CONTROLLER ---
fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        let sessionPromise = null;
        let streamSid = null;
        let callSid = null;

        connection.socket.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

                if (data.event === 'start') {
                    streamSid = data.start.streamSid;
                    callSid = data.start.callSid;

                    // STATELESS: Fetch instruction from Redis
                    let instruction = "You are a helpful AI receptionist.";
                    try {
                        const cached = await redis.get(`call:${callSid}:instruction`);
                        if (cached) instruction = cached;
                    } catch (e) {
                         if (global.mockCache) instruction = global.mockCache.get(callSid) || instruction;
                    }

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
                            onopen: () => {
                                // console.log("Gemini Connected"); // Commented out for perf at scale
                            },
                            onmessage: async (msg) => {
                                if (connection.socket.readyState !== 1) return; // Prevent writing to closed socket

                                // Handle Interruption
                                if (msg.serverContent?.interrupted) {
                                    connection.socket.send(JSON.stringify({ 
                                        event: 'clear', 
                                        streamSid: streamSid 
                                    }));
                                    return;
                                }

                                // Handle Audio
                                if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                                    const rawAudio = msg.serverContent.modelTurn.parts[0].inlineData.data;
                                    const twilioAudio = processGeminiAudio(rawAudio);
                                    connection.socket.send(JSON.stringify({
                                        event: 'media',
                                        streamSid: streamSid,
                                        media: { payload: twilioAudio }
                                    }));
                                }

                                // Handle Tools
                                if (msg.toolCall) {
                                    const call = msg.toolCall.functionCalls.find(fc => fc.name === 'transferCall');
                                    if (call) {
                                        let targetNumber = HUMAN_OPERATOR_NUMBER;
                                        if(call.args.extension && call.args.extension.length > 6) {
                                            targetNumber = call.args.extension;
                                        }
                                        
                                        // Offload logging to Queue
                                        analyticsQueue.add('log-transfer', { callSid, targetNumber });

                                        try {
                                            await client.calls(callSid).update({
                                                twiml: `<Response><Say>Transferring.</Say><Dial>${targetNumber}</Dial></Response>`
                                            });
                                            connection.socket.close();
                                        } catch (err) { 
                                            console.error("Transfer failed", err);
                                        }
                                    }
                                }
                            },
                            onclose: () => {
                                // Cleanup logic
                            },
                            onerror: (err) => {
                                // Log error to monitoring service (Sentry/Datadog)
                                console.error("Gemini Error:", err.message); 
                            }
                        }
                    });

                } else if (data.event === 'media' && sessionPromise) {
                    const pcm16k = processTwilioAudio(data.media.payload);
                    const b64pcm = pcm16k.toString('base64');
                    
                    // Non-blocking send
                    sessionPromise.then(session => {
                        session.sendRealtimeInput({ 
                            media: { mimeType: "audio/pcm;rate=16000", data: b64pcm } 
                        });
                    }).catch(() => {
                        // Suppress unhandled promise rejections during disconnects
                    });

                } else if (data.event === 'stop') {
                    if (sessionPromise) {
                        sessionPromise.then(session => session.close()).catch(() => {});
                    }
                    // Async: Process Call Summary
                    analyticsQueue.add('process-summary', { callSid });
                }
            } catch (e) {
                console.error("Socket Error:", e);
            }
        });

        connection.socket.on('close', async () => {
            if (sessionPromise) {
                try {
                    const session = await sessionPromise;
                    session.close();
                } catch (e) {}
            }
            // Clear Redis Key Early
            if (callSid) {
                try { await redis.del(`call:${callSid}:instruction`); } catch(e) {}
            }
        });
    });
});

// Graceful Shutdown for Kubernetes
const shutdown = async () => {
    console.log('Shutting down server...');
    await fastify.close();
    if(redis.status === 'ready') await redis.quit();
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`Server listening on port ${PORT} [PID: ${process.pid}]`);
});
