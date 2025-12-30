
import Twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

// Configuration strictly from Environment Variables
const CONFIG = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    serverUrl: process.env.SERVER_URL || process.env.NGROK_URL,
    sipDomainName: process.env.SIP_DOMAIN_NAME || "aivoicereceptionist",
    sipUser: process.env.SIP_USER || "aiagent",
    sipPass: process.env.SIP_PASS
};

if (!CONFIG.accountSid || !CONFIG.authToken || !CONFIG.serverUrl || !CONFIG.sipPass) {
    console.error("❌ Missing required environment variables. Please check your .env file.");
    process.exit(1);
}

const client = Twilio(CONFIG.accountSid, CONFIG.authToken);
const WEBHOOK_URL = `${CONFIG.serverUrl.replace(/\/$/, '')}/incoming-call`;
const DOMAIN_NAME = CONFIG.sipDomainName.toLowerCase().replace(/[^a-z0-9-]/g, '');

async function setup() {
    console.log("🚀 Starting Twilio Setup...");
    console.log(`   Account SID: ${CONFIG.accountSid.substring(0,6)}...`);
    console.log(`   Target Webhook: ${WEBHOOK_URL}`);

    try {
        // 1. UPDATE ACTIVE PHONE NUMBERS
        console.log("\n1️⃣  Configuring Phone Numbers...");
        const numbers = await client.incomingPhoneNumbers.list({ limit: 5 });
        
        if (numbers.length === 0) {
            console.warn("   ⚠️ No active phone numbers found on this account.");
        } else {
            for (const number of numbers) {
                await client.incomingPhoneNumbers(number.sid).update({
                    voiceUrl: WEBHOOK_URL,
                    voiceMethod: 'POST'
                });
                console.log(`   ✅ Linked ${number.phoneNumber} to AI Server.`);
            }
        }

        // 2. CREATE/UPDATE SIP DOMAIN
        console.log(`\n2️⃣  Configuring SIP Domain: ${DOMAIN_NAME}.sip.twilio.com`);
        const domains = await client.sip.domains.list();
        let sipDomain = domains.find(d => d.domainName === DOMAIN_NAME);

        if (sipDomain) {
            console.log("   🔄 Domain exists. Updating...");
            sipDomain = await client.sip.domains(sipDomain.sid).update({
                voiceUrl: WEBHOOK_URL,
                voiceMethod: 'POST',
                sipRegistration: true
            });
        } else {
            console.log("   ✨ Creating new SIP Domain...");
            sipDomain = await client.sip.domains.create({
                domainName: DOMAIN_NAME,
                voiceUrl: WEBHOOK_URL,
                voiceMethod: 'POST',
                sipRegistration: true
            });
        }
        console.log("   ✅ SIP Domain Configured.");

        // 3. CREATE CREDENTIAL LIST & USER
        console.log("\n3️⃣  Configuring SIP Credentials (for Linphone)...");
        const lists = await client.sip.credentialLists.list();
        let credList = lists.find(l => l.friendlyName === 'AI_Office_Users');

        if (!credList) {
            credList = await client.sip.credentialLists.create({ friendlyName: 'AI_Office_Users' });
        }

        // Check if user exists in list, if not add
        try {
            await client.sip.credentialLists(credList.sid).credentials.create({
                username: CONFIG.sipUser,
                password: CONFIG.sipPass
            });
            console.log(`   ✅ User '${CONFIG.sipUser}' created.`);
        } catch (e) {
            console.log(`   ℹ️  User '${CONFIG.sipUser}' might already exist (skipping).`);
        }

        // 4. MAP CREDENTIAL LIST TO DOMAIN
        // Check mappings
        const mappings = await client.sip.domains(sipDomain.sid).auth.registrations.credentialListMappings.list();
        if (!mappings.find(m => m.friendlyName === 'AI_Office_Users')) {
             await client.sip.domains(sipDomain.sid).auth.registrations.credentialListMappings.create({
                 credentialListSid: credList.sid
             });
             console.log("   ✅ Linked Credentials to Domain.");
        } else {
             console.log("   ✅ Credentials already linked.");
        }

        console.log("\n========================================================");
        console.log("🎉 SETUP COMPLETE!");
        console.log("========================================================");
        console.log("👉 LINPHONE CONFIGURATION (If using Softphone):");
        console.log(`   Username:  ${CONFIG.sipUser}`);
        console.log(`   Password:  (Hidden)`);
        console.log(`   Domain:    ${DOMAIN_NAME}.sip.twilio.com`);
        console.log(`   Transport: UDP or TCP`);
        console.log("========================================================");

    } catch (error) {
        console.error("\n❌ SETUP FAILED:", error.message);
        if (error.code === 20404) console.error("   (Check your Server URL - is it correct?)");
        if (error.status === 401) console.error("   (Check your SID and Auth Token in .env)");
    }
}

setup();
