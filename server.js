import Fastify from 'fastify';
import fastifyWs from '@fastify/websocket';
import fastifyFormBody from '@fastify/formbody';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import Twilio from 'twilio';

dotenv.config();

const fastify = Fastify();
fastify.register(fastifyWs);
fastify.register(fastifyFormBody);

const PORT = process.env.PORT || 5050;
const API_KEY = process.env.API_KEY; 
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER; 
const HUMAN_OPERATOR_NUMBER = process.env.HUMAN_OPERATOR_NUMBER || process.env.MY_REAL_PHONE_NUMBER; 

const client = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const activeCalls = new Map();

// --- AUDIO UTILS (Transcoding for Telephony) --- //
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
        if (idx + 2 < input.length) {
             output[i] = (input[idx] + input[idx+1] + input[idx+2]) / 3;
        } else {
             output[i] = input[idx];
        }
    }
    return Buffer.from(output.buffer);
};

const upsampleTo16k = (buffer) => {
    const input = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
    const output = new Int16Array(input.length * 2);
    for (let i = 0; i < input.length; i++) {
        output[i * 2] = input[i];
        if (i < input.length - 1) {
            output[i * 2 + 1] = (input[i] + input[i + 1]) / 2;
        } else {
            output[i * 2 + 1] = input[i];
        }
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

const transferTool = {
    name: "transferCall",
    parameters: {
        type: "OBJECT",
        properties: {
            destination: { type: "STRING", description: "The department or person name" },
            extension: { type: "STRING", description: "The phone number or extension to transfer to" }
        },
        required: ["destination", "extension"]
    }
};

fastify.post('/make-call', async (req, reply) => {
    const { to, systemInstruction } = req.body;
    if (!to) return reply.status(400).send({ error: 'Missing phone number' });

    try {
        const call = await client.calls.create({
            to: to,
            from: TWILIO_PHONE_NUMBER,
            url: `https://${req.headers.host}/incoming-call`
        });
        activeCalls.set(call.sid, systemInstruction);
        setTimeout(() => activeCalls.delete(call.sid), 5 * 60 * 1000);
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

fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log("Twilio Media Stream Connected");

        const ai = new GoogleGenAI({ apiKey: API_KEY });
        let streamSid = null;
        let callSid = null;
        // Use promise pattern to prevent dropping early audio packets
        let sessionPromise = null; 

        connection.socket.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                if (data.event === 'start') {
                    streamSid = data.start.streamSid;
                    callSid = data.start.callSid;
                    const instruction = activeCalls.get(callSid);
                    
                    // Initialize immediately and assign to sessionPromise
                    sessionPromise = ai.live.connect({
                        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                        config: {
                            responseModalities: [Modality.AUDIO],
                            systemInstruction: instruction || "You are a helpful AI receptionist.",
                            tools: [{ functionDeclarations: [transferTool] }],
                            speechConfig: {
                                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                            },
                        },
                        callbacks: {
                            onopen: () => console.log("Gemini Session Open"),
                            onmessage: async (msg) => {
                                // 1. HANDLE INTERRUPTION (Fixes "Stuck" AI)
                                if (msg.serverContent?.interrupted) {
                                    console.log("Interruption detected - Clearing Twilio Buffer");
                                    connection.socket.send(JSON.stringify({ 
                                        event: 'clear', 
                                        streamSid: streamSid 
                                    }));
                                    return;
                                }

                                // 2. AUDIO PROCESSING
                                if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                                    const rawAudio = msg.serverContent.modelTurn.parts[0].inlineData.data;
                                    const twilioAudio = processGeminiAudio(rawAudio);
                                    
                                    connection.socket.send(JSON.stringify({
                                        event: 'media',
                                        streamSid: streamSid,
                                        media: { payload: twilioAudio }
                                    }));
                                }

                                // 3. TOOL HANDLING
                                if (msg.toolCall) {
                                    const call = msg.toolCall.functionCalls.find(fc => fc.name === 'transferCall');
                                    if (call) {
                                        let targetNumber = HUMAN_OPERATOR_NUMBER;
                                        if(call.args.extension && call.args.extension.length > 6) {
                                            targetNumber = call.args.extension;
                                        }
                                        console.log(`Transferring ${callSid} to ${targetNumber}`);
                                        try {
                                            await client.calls(callSid).update({
                                                twiml: `<Response><Say>Transferring.</Say><Dial>${targetNumber}</Dial></Response>`
                                            });
                                            connection.socket.close();
                                        } catch (err) { console.error(err); }
                                    }
                                }
                            },
                            onclose: () => console.log("Gemini Closed")
                        }
                    });

                } else if (data.event === 'media' && sessionPromise) {
                    // Normalize audio and use .then() to ensure packet isn't dropped if still connecting
                    const pcm16k = processTwilioAudio(data.media.payload);
                    const b64pcm = pcm16k.toString('base64');
                    
                    sessionPromise.then(session => {
                        session.sendRealtimeInput({ 
                            media: { mimeType: "audio/pcm;rate=16000", data: b64pcm } 
                        });
                    });
                } else if (data.event === 'stop') {
                    if (sessionPromise) {
                        sessionPromise.then(session => session.close()).catch(() => {});
                    }
                }
            } catch (e) { console.error(e); }
        });

        connection.socket.on('close', async () => {
            console.log("Twilio Socket Closed");
            if (sessionPromise) {
                try {
                    const session = await sessionPromise;
                    session.close();
                    console.log("Closed Gemini Session");
                } catch (e) {
                    console.error("Error closing Gemini session", e);
                }
            }
        });
    });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`Call Center Server listening on port ${PORT}`);
});