const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const https = require('https');

const app = express();
app.use(express.json());
app.use(cors());

let sock;
let isReady = false;

// Queue system to prevent WhatsApp spam bans
const messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0 || !isReady) return;
    
    isProcessingQueue = true;
    
    while (messageQueue.length > 0) {
        if (!isReady) break; // Stop if disconnected
        
        const { to, message } = messageQueue.shift();
        const jid = `${to}@s.whatsapp.net`;
        
        console.log(`[Queue] Sending message to ${to}...`);
        
        try {
            await sock.sendMessage(jid, { text: message });
            console.log(`[Queue] Successfully sent to ${to}.`);
        } catch (error) {
            console.error(`[Queue] Failed to send to ${to}:`, error);
            // Optionally push back to queue on fail
        }
        
        // Wait 10 seconds between messages to prevent spam bans (6 per min max)
        if (messageQueue.length > 0) {
            console.log(`[Queue] Waiting 10 seconds before next message...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    
    isProcessingQueue = false;
    console.log(`[Queue] All caught up!`);
}

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) // Silence noisy logs
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n\nScan this QR Code with your WhatsApp to link the bot:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            isReady = false;
            // reconnect if not logged out
            if(shouldReconnect) {
                connectToWhatsApp();
            }
        } else if(connection === 'open') {
            console.log('\n✅ WhatsApp connection opened and ready!');
            isReady = true;
            processQueue(); // Resume any pending messages
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ─── RECEIVE INCOMING MESSAGES & REPLY WITH GEMINI AI ───
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        // Ignore if it's our own message or doesn't contain text
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text && !from.includes('@g.us')) { // Ignore group chats
            console.log(`[Chat] Received message from ${from}: ${text}`);
            
            // Send typing indicator (optional, makes it look human)
            await sock.sendPresenceUpdate('composing', from);
            
            // Get AI response
            const aiReply = await getGeminiReply(text);
            
            // Send reply
            await sock.sendMessage(from, { text: aiReply });
            console.log(`[Chat] Replied to ${from}`);
        }
    });
}

// ─── GEMINI AI FUNCTION ───
async function getGeminiReply(userMessage) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const systemPrompt = `You are the official AI customer support assistant for **GKingtopup** — a trusted Nigerian VTU (Virtual Top-Up) platform.

Your job is to:
1. Answer questions about GKingtopup services (data bundles, airtime, electricity bills, cable TV, exam pins)
2. Guide customers on how to register and buy services at https://gkingtopup.com.ng
3. Teach resellers and sub-dealers how to grow their business and make more sales
4. Advise customers on smart data management (how to save data, track usage, etc.)
5. Handle complaints professionally and direct complex issues to support

SERVICES & PRICING GUIDE:
- MTN SME Data: Very cheap, ideal for resellers and sharing
- Airtel, Glo, 9Mobile data bundles available
- Airtime purchase for all networks at discount
- DSTV, GOtv, Startimes subscription
- EKEDC, IKEDC, AEDC electricity token
- WAEC, NECO, JAMB, NABTEB exam pins
- Recharge card printing (bulk pins)

BUSINESS TIPS TO SHARE:
- Resellers can buy data at wholesale price and sell to customers at retail
- Share on WhatsApp status, Facebook groups, schools, hostels
- Offer discounts to loyal customers to retain them
- Create a price list and post it daily on social media
- Partner with phone repair shops, cybercafes to sell to their customers

DATA MANAGEMENT TIPS:
- Turn off background app refresh to save data
- Download videos for offline watching instead of streaming
- Use lite versions of apps (Facebook Lite, YouTube Go)
- Disconnect from WiFi when not using to avoid auto-updates draining mobile data

RULES:
- Always be friendly, helpful, and professional
- Keep responses short and clear (WhatsApp messages)
- Use emojis sparingly to be engaging
- Always end with a call-to-action: guide them to visit https://gkingtopup.com.ng
- If asked for pricing, direct them to the website as prices may change
- If they have a technical issue with an order, tell them to contact support on the website
- Respond in the same language the customer uses (English, Pidgin, Yoruba, Igbo, Hausa)
- Never make up prices — always say "visit our website for current prices"

WEBSITE: https://gkingtopup.com.ng
SUPPORT: Available on the website chat`;

    try {
        if (!GEMINI_API_KEY) {
            console.error("[Gemini Error]: GEMINI_API_KEY is missing from Environment Variables!");
            throw new Error("Missing API Key");
        }

        const payload = JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: { maxOutputTokens: 400, temperature: 0.7 }
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const reply = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) return reject(parsed.error.message);
                        resolve(parsed.candidates?.[0]?.content?.parts?.[0]?.text);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });

        if (!reply) throw new Error("Empty reply from Gemini");
        return reply.trim();
        
    } catch (error) {
        console.error("[Gemini Error]:", error);
        return `[DEBUG]: ${error.toString()}`;
    }
}

// Health check to keep bot alive
app.get('/', (req, res) => {
    res.send("OK Movement WhatsApp Bot is alive!");
});

// API Endpoint for OK Movement to trigger OTP
app.post('/api/send-whatsapp', (req, res) => {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
        return res.status(400).json({ success: false, error: 'Phone and message are required' });
    }

    if (!isReady) {
        return res.status(503).json({ success: false, error: 'WhatsApp is not connected yet. Please scan the QR code on the server.' });
    }

    // Ensure phone number format is 2348000000000
    let formattedPhone = phone;
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '234' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.substring(1);
    }

    // Add to queue
    messageQueue.push({ to: formattedPhone, message });
    console.log(`[API] Message added to queue for ${formattedPhone}. Queue length: ${messageQueue.length}`);
    
    // Start processing if not already running
    processQueue();

    res.json({ success: true, message: 'Message queued for delivery.', queuePosition: messageQueue.length });
});

// Start the server
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`WhatsApp Microservice running on port ${PORT}`);
    connectToWhatsApp();
});
