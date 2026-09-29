const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');

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
