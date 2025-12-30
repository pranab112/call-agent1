
import Fastify from 'fastify';
import fastifyWs from '@fastify/websocket';
import fastifyFormBody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import Twilio from 'twilio';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

// ============================================================================
// AI VOICE SERVER (Production Ready)
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: true });
fastify.register(fastifyWs);
fastify.register(fastifyFormBody);

// CONFIGURATION
const PORT = process.env.PORT || 5050;

// Auto-detect Railway URL or fall back to manual/localhost
const SERVER_URL = process.env.SERVER_URL || 
                   (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null) || 
                   process.env.NGROK_URL || 
                   `http://localhost:${PORT}`;

const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const API_KEY = process.env.API_KEY; 

// TWILIO CLIENT
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = (TWILIO_SID && TWILIO_TOKEN) ? Twilio(TWILIO_SID, TWILIO_TOKEN) : null;

// --- SQLITE DATABASE ---
const db = new Database('office_agent.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const loadSettings = () => {
    try {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('knowledge_base');
        if (row) return JSON.parse(row.value);
    } catch (e) {
        console.error("DB Load Error:", e);
    }
    return {
        companyName: "Default Office",
        knowledge: `You are a helpful receptionist. No specific data provided yet.`
    };
};

let systemContext = loadSettings();

// --- SERVE STATIC FRONTEND (Production) ---
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    fastify.register(fastifyStatic, {
        root: distPath,
        prefix: '/',
    });
    console.log("📂 Serving static frontend from ./dist");
} else {
    console.log("⚠️ ./dist folder not found. Run 'npm run build' for production frontend.");
}

// --- CORS (For Dev) ---
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

// --- AUDIO PROCESSING ---
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

const processTwilioAudio = (base64Data) => {
    const mulawBuffer = Buffer.from(base64Data, 'base64');
    const pcmBuffer = new Int16Array(mulawBuffer.length);
    for (let i = 0; i < mulawBuffer.length; i++) {
        pcmBuffer[i] = muLawToLinear(mulawBuffer[i]);
    }
    const upsampled = new Int16Array(pcmBuffer.length * 2);
    for (let i = 0; i < pcmBuffer.length; i++) {
        upsampled[i * 2] = pcmBuffer[i];
        upsampled[i * 2 + 1] = pcmBuffer[i];
    }
    return Buffer.from(upsampled.buffer);
};

const processGeminiAudio = (rawPcmData) => {
    const pcmBuffer = Buffer.from(rawPcmData, 'base64');
    const int16Data = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength / 2);
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

fastify.get('/health', async () => ({ status: 'online', service: 'Voice AI' }));

fastify.post('/settings', async (req, reply) => {
    const { companyName, knowledge } = req.body;
    systemContext.companyName = companyName || systemContext.companyName;
    systemContext.knowledge = knowledge || systemContext.knowledge;
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run('knowledge_base', JSON.stringify(systemContext));
    return { success: true };
});

fastify.post('/make-call', async (req, reply) => {
    const { to } = req.body;
    if (!twilioClient) return reply.code(500).send({ error: "Twilio credentials missing on server" });
    
    try {
        const call = await twilioClient.calls.create({
            to: to,
            from: TWILIO_PHONE_NUMBER, 
            url: `${SERVER_URL.replace(/\/$/, '')}/incoming-call`, 
        });
        return { success: true, callSid: call.sid };
    } catch (error) {
        return reply.code(500).send({ success: false, error: error.message });
    }
});

// AUTO-SETUP ENDPOINT (For Railway/Cloud)
fastify.post('/setup-twilio', async (req, reply) => {
    if (!twilioClient) return reply.code(500).send({ error: "Twilio credentials missing on server" });
    
    const webhookUrl = `${SERVER_URL.replace(/\/$/, '')}/incoming-call`;
    const sipDomainName = "aivoicereceptionist"; // You can make this dynamic if needed
    const sipUser = process.env.SIP_USER || "aiagent";
    const sipPass = process.env.SIP_PASS; // MUST BE IN ENV
    
    if (!sipPass) {
        return reply.code(400).send({ success: false, error: "SIP_PASS environment variable is missing" });
    }
    
    try {
        console.log(`Configuring Twilio with Webhook: ${webhookUrl}`);

        // 1. Update Phone Numbers
        const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 5 });
        for (const number of numbers) {
            await twilioClient.incomingPhoneNumbers(number.sid).update({
                voiceUrl: webhookUrl,
                voiceMethod: 'POST'
            });
        }

        // 2. SIP Domain
        const domains = await twilioClient.sip.domains.list();
        let sipDomain = domains.find(d => d.domainName === sipDomainName);
        if (sipDomain) {
            sipDomain = await twilioClient.sip.domains(sipDomain.sid).update({
                voiceUrl: webhookUrl,
                voiceMethod: 'POST',
                sipRegistration: true
            });
        } else {
            sipDomain = await twilioClient.sip.domains.create({
                domainName: sipDomainName,
                voiceUrl: webhookUrl,
                voiceMethod: 'POST',
                sipRegistration: true
            });
        }

        // 3. SIP Credentials
        const lists = await twilioClient.sip.credentialLists.list();
        let credList = lists.find(l => l.friendlyName === 'AI_Office_Users');
        if (!credList) credList = await twilioClient.sip.credentialLists.create({ friendlyName: 'AI_Office_Users' });

        try {
            await twilioClient.sip.credentialLists(credList.sid).credentials.create({ username: sipUser, password: sipPass });
        } catch (e) { /* Ignore if exists */ }

        // 4. Map Credentials to Domain
        const mappings = await twilioClient.sip.domains(sipDomain.sid).auth.registrations.credentialListMappings.list();
        if (!mappings.find(m => m.friendlyName === 'AI_Office_Users')) {
            await twilioClient.sip.domains(sipDomain.sid).auth.registrations.credentialListMappings.create({ credentialListSid: credList.sid });
        }

        return { success: true, message: "Twilio Configured Successfully", sipDomain: `${sipDomainName}.sip.twilio.com` };

    } catch (error) {
        console.error("Setup Error:", error);
        return reply.code(500).send({ success: false, error: error.message });
    }
});

fastify.all('/incoming-call', async (req, reply) => {
    const host = req.headers.host; 
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const protocol = isLocal ? 'ws' : 'wss';
    
    const twiml = `
    <Response>
        <Connect>
            <Stream url="${protocol}://${host}/media-stream" />
        </Connect>
    </Response>
    `;
    reply.type('text/xml').send(twiml);
});

fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log("⚡ Stream Connected");
        
        let sessionPromise = null;
        let streamSid = null;

        const startGeminiSession = () => {
            if (sessionPromise) return sessionPromise;
            if (!API_KEY) { console.error("❌ API Key Missing"); return; }

            const instruction = `
            Role: Receptionist for ${systemContext.companyName}.
            Data: ${systemContext.knowledge}
            Tone: Polite, Professional.
            Language: Nepali (Primary) or English.
            `;

            const ai = new GoogleGenAI({ apiKey: API_KEY });
            sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: instruction,
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                },
                callbacks: {
                    onopen: () => console.log("✨ AI Connected"),
                    onmessage: async (msg) => {
                        if (connection.socket.readyState !== 1) return;
                        
                        if (msg.serverContent?.interrupted && streamSid) {
                            connection.socket.send(JSON.stringify({ event: 'clear', streamSid: streamSid }));
                            return;
                        }

                        if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                            const rawAudio = msg.serverContent.modelTurn.parts[0].inlineData.data;
                            const twilioAudio = processGeminiAudio(rawAudio);
                            if (streamSid) {
                                connection.socket.send(JSON.stringify({
                                    event: 'media', streamSid: streamSid, media: { payload: twilioAudio }
                                }));
                            }
                        }
                    },
                    onerror: (err) => console.error("AI Error:", err.message),
                    onclose: () => console.log("AI Closed")
                }
            });
            return sessionPromise;
        };

        connection.socket.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                if (data.event === 'start') {
                    streamSid = data.start.streamSid;
                    startGeminiSession();
                } 
                else if (data.event === 'media' && sessionPromise) {
                    const session = await sessionPromise;
                    const pcmData = processTwilioAudio(data.media.payload);
                    session.sendRealtimeInput({ 
                        media: { mimeType: "audio/pcm;rate=16000", data: pcmData.toString('base64') } 
                    });
                } 
                else if (data.event === 'stop') {
                    if(sessionPromise) (await sessionPromise).close();
                }
            } catch (e) { }
        });
    });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`✅ Server running on port ${PORT}`);
});
