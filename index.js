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

// ─── USER SESSION STATE ───
const userSessions = new Map();

// ─── MENU TEMPLATES ───
const AGENT_NUMBER = '2347067154646'; // Agent WhatsApp number

const MAIN_MENU = `🏠 *GKingtopup - Main Menu*
━━━━━━━━━━━━━━━━━━━━━
Welcome! How can we help you today?

1️⃣  Create Account
2️⃣  Login to My Account
3️⃣  Fund My Wallet
4️⃣  Buy Data / Airtime / Bills
5️⃣  Check Transaction Status
6️⃣  FAQs
7️⃣  💬 Chat with Live Agent
0️⃣  🤖 Ask AI Assistant

━━━━━━━━━━━━━━━━━━━━━
Reply with a number to continue
🌐 gkingtopup.com.ng`;

const SERVICES_MENU = `📱 *Buy Services*
━━━━━━━━━━━━━━━━━━━━━
What would you like to buy?

1️⃣  📶 Data Bundle (MTN, Airtel, Glo, 9mobile)
2️⃣  📞 Airtime (All Networks)
3️⃣  📺 Cable TV (DSTV / GOtv / Startimes)
4️⃣  💡 Electricity Token
5️⃣  📝 Exam Pin (WAEC / NECO / JAMB)

0️⃣  🔙 Back to Main Menu
━━━━━━━━━━━━━━━━━━━━━
🌐 gkingtopup.com.ng`;

const FAQS_MENU = `❓ *Frequently Asked Questions*
━━━━━━━━━━━━━━━━━━━━━

1️⃣  How do I fund my wallet?
2️⃣  Is data delivery instant?
3️⃣  How do I become a reseller?
4️⃣  Payment failed but money deducted?
5️⃣  How do I reset my password?

0️⃣  🔙 Back to Main Menu`;

const FAQS_ANSWERS = {
    '1': `💳 *How to Fund Your Wallet*
━━━━━━━━━━━━━━━━━━━━━
1. Log in at gkingtopup.com.ng
2. Click "Fund Wallet"
3. Enter amount & choose payment method
4. Complete payment via Paystack
5. Wallet is credited instantly! ✅

Reply *0* for Main Menu`,

    '2': `⚡ *Data Delivery*
━━━━━━━━━━━━━━━━━━━━━
Yes! All data purchases are delivered *instantly* after payment is confirmed.

If you don't receive within 2 minutes, please contact support.

Reply *0* for Main Menu`,

    '3': `💼 *Become a Reseller*
━━━━━━━━━━━━━━━━━━━━━
Join our reseller program and earn daily!

✅ Buy data at wholesale prices
✅ Sell at your own profit margin
✅ No registration fee
✅ Instant delivery for your customers

Register at: gkingtopup.com.ng
Then upgrade your account to Reseller.

Reply *0* for Main Menu`,

    '4': `⚠️ *Payment Failed / Money Deducted*
━━━━━━━━━━━━━━━━━━━━━
Don't panic! Here's what to do:

1. Check your transaction history on the site
2. If money was deducted but no data received, wait 5 minutes — it often auto-reverses
3. If issue persists after 10 minutes, contact our support team with your transaction ID

Reply *7* to chat with a live agent
Reply *0* for Main Menu`,

    '5': `🔑 *Reset Your Password*
━━━━━━━━━━━━━━━━━━━━━
1. Go to gkingtopup.com.ng
2. Click "Login"
3. Click "Forgot Password?"
4. Enter your email address
5. Check your email for reset link ✅

Reply *0* for Main Menu`
};

async function sendMenu(jid, menuText) {
    await sock.sendMessage(jid, { text: menuText });
}

async function handleMainMenu(from, text) {
    const choice = text.trim();
    switch (choice) {
        case '1':
            await sock.sendMessage(from, { text: `📝 *Create Your Account*\n━━━━━━━━━━━━━━━━━━━━━\nRegister in seconds and start buying data, airtime & more!\n\n👉 https://gkingtopup.com.ng/auth/register.php\n\nReply *menu* to go back.` });
            break;
        case '2':
            await sock.sendMessage(from, { text: `🔐 *Login to Your Account*\n━━━━━━━━━━━━━━━━━━━━━\nAccess your GKingtopup dashboard:\n\n👉 https://gkingtopup.com.ng/auth/login.php\n\nReply *menu* to go back.` });
            break;
        case '3':
            await sock.sendMessage(from, { text: `💳 *Fund Your Wallet*\n━━━━━━━━━━━━━━━━━━━━━\n1. Log in to your account\n2. Click "Fund Wallet"\n3. Choose amount & pay via Paystack\n4. Wallet credited instantly! ✅\n\n👉 https://gkingtopup.com.ng\n\nReply *menu* to go back.` });
            break;
        case '4':
            userSessions.set(from, { state: 'services_menu' });
            await sendMenu(from, SERVICES_MENU);
            break;
        case '5':
            await sock.sendMessage(from, { text: `📋 *Check Transaction Status*\n━━━━━━━━━━━━━━━━━━━━━\nTo check your order:\n\n1. Log in at gkingtopup.com.ng\n2. Go to "Transaction History"\n3. Find your order and check status\n\nIf you have issues, reply *7* to chat with an agent.\n\nReply *menu* to go back.` });
            break;
        case '6':
            userSessions.set(from, { state: 'faqs_menu' });
            await sendMenu(from, FAQS_MENU);
            break;
        case '7':
            await connectToAgent(from);
            break;
        case '0':
            userSessions.set(from, { state: 'ai' });
            await sock.sendMessage(from, { text: `🤖 *AI Assistant Mode*\n━━━━━━━━━━━━━━━━━━━━━\nYou can now ask me anything about GKingtopup!\n\nType *menu* anytime to return to the main menu.` });
            break;
        default:
            await sendMenu(from, MAIN_MENU);
    }
}

async function handleServicesMenu(from, text) {
    const links = {
        '1': 'https://gkingtopup.com.ng (Login → Buy Data)',
        '2': 'https://gkingtopup.com.ng (Login → Buy Airtime)',
        '3': 'https://gkingtopup.com.ng (Login → Cable TV)',
        '4': 'https://gkingtopup.com.ng (Login → Electricity)',
        '5': 'https://gkingtopup.com.ng (Login → Exam Pins)',
    };
    const names = { '1': '📶 Data Bundle', '2': '📞 Airtime', '3': '📺 Cable TV', '4': '💡 Electricity Token', '5': '📝 Exam Pin' };

    if (text === '0') {
        userSessions.set(from, { state: 'main_menu' });
        await sendMenu(from, MAIN_MENU);
    } else if (links[text]) {
        await sock.sendMessage(from, { text: `${names[text]}\n━━━━━━━━━━━━━━━━━━━━━\nTo purchase, please visit:\n\n👉 ${links[text]}\n\nNote: Prices are always up-to-date on the website.\n\nReply *menu* to go back.` });
    } else {
        await sendMenu(from, SERVICES_MENU);
    }
}

async function handleFAQsMenu(from, text) {
    if (text === '0') {
        userSessions.set(from, { state: 'main_menu' });
        await sendMenu(from, MAIN_MENU);
    } else if (FAQS_ANSWERS[text]) {
        await sock.sendMessage(from, { text: FAQS_ANSWERS[text] });
    } else {
        await sendMenu(from, FAQS_MENU);
    }
}

async function connectToAgent(from) {
    const customerPhone = from.replace('@s.whatsapp.net', '').replace('@lid', '');
    
    // Notify the agent
    const agentJid = `${AGENT_NUMBER}@s.whatsapp.net`;
    await sock.sendMessage(agentJid, {
        text: `🔔 *New Customer Support Request*\n━━━━━━━━━━━━━━━━━━━━━\nA customer needs your help!\n📱 Customer Number: +${customerPhone}\n\nPlease reach out to them directly on WhatsApp.`
    });

    // Tell the customer
    userSessions.set(from, { state: 'agent', agentMode: true });
    await sock.sendMessage(from, {
        text: `✅ *Connecting you to a Live Agent*\n━━━━━━━━━━━━━━━━━━━━━\nOur agent has been notified and will contact you shortly on this WhatsApp!\n\n⏱ Expected response time: a few minutes\n\nYou can also reach the agent directly:\n👉 https://wa.me/${AGENT_NUMBER}\n\nType *menu* anytime to return to the main menu.`
    });
}


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

    // ─── RECEIVE INCOMING MESSAGES ───
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

        // Ignore empty messages, group chats, and WhatsApp status broadcasts
        if (!text || from.includes('@g.us') || from.includes('status@broadcast') || from === 'status@broadcast') return;

        console.log(`[Chat] Received message from ${from}: ${text}`);

        const lower = text.toLowerCase();
        const session = userSessions.get(from) || { state: 'ai' };

        // Always allow "menu" or "hi/hello/start" to show the main menu
        if (['menu', 'hi', 'hello', 'start', 'hey'].includes(lower)) {
            userSessions.set(from, { state: 'main_menu' });
            await sendMenu(from, MAIN_MENU);
            return;
        }

        // Route based on session state
        if (session.state === 'main_menu') {
            await handleMainMenu(from, text);
            return;
        }

        if (session.state === 'services_menu') {
            await handleServicesMenu(from, text);
            return;
        }

        if (session.state === 'faqs_menu') {
            await handleFAQsMenu(from, text);
            return;
        }

        // Default: AI Assistant mode
        await sock.sendPresenceUpdate('composing', from);
        const aiReply = await getGeminiReply(text);
        await sock.sendMessage(from, { text: aiReply });
        console.log(`[Chat] Replied to ${from}`);
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
            path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
        return "Hi! 👋 Thanks for reaching out to GKingtopup. Our AI is taking a short break. Please visit https://gkingtopup.com.ng or try again in a moment!";
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

// ─── KEEP-ALIVE SELF-PING (prevents Render free tier from spinning down) ───
const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // Render sets this automatically
function startKeepAlive() {
    if (!RENDER_URL) {
        console.log('[Keep-Alive] RENDER_EXTERNAL_URL not set, skipping self-ping.');
        return;
    }
    setInterval(() => {
        https.get(RENDER_URL, (res) => {
            console.log(`[Keep-Alive] Pinged ${RENDER_URL} — Status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('[Keep-Alive] Ping failed:', err.message);
        });
    }, 10 * 60 * 1000); // Every 10 minutes
    console.log(`[Keep-Alive] Self-ping started. Pinging ${RENDER_URL} every 10 minutes.`);
}

// Start the server
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`WhatsApp Microservice running on port ${PORT}`);
    connectToWhatsApp();
    startKeepAlive();
});
