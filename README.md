# 🤖 Cloud-Native WhatsApp Automation & AI Assistant Service

An enterprise-ready, event-driven WhatsApp messaging engine built with **Node.js**, **Baileys WebSocket API**, and **Google Gemini AI**. Features custom **MongoDB cloud session persistence** to ensure zero-downtime authentication across serverless/containerized deployments (such as Render).

---

## 🚀 Key Architectural Features

- **🧠 Google Gemini AI Integration:** Automated natural language conversation handling, dynamic prompt memory, contextual multi-turn replies, and rate-limit guardrails.
- **☁️ Cloud-Native Session Persistence:** Custom-built MongoDB Auth State adapter (`useMongoDBAuthState`) synchronizing encryption credentials and sync keys via atomic bulk writes—surviving cold restarts on cloud hosts.
- **🔄 Resilient WebSocket Engine:** Built on `@whiskeysockets/baileys` with exponential backoff, auto-reconnection handling, and socket state synchronization.
- **⏱️ Human Takeover & Mute Logic:** Allows manual operator intervention by automatically suspending AI auto-responses for 5 minutes when a human takes over the conversation.
- **🛡️ Broadcast Filter & Guardrails:** Filters out `@broadcast` statuses and high-frequency noise to optimize API quotas and protect rate limits.
- **🌐 REST Management API:** Embedded Express.js server providing health checks and operational telemetry endpoints.

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (ES6+ / Asynchronous Event Loop)
- **Protocols:** WebSockets, HTTPS, REST APIs
- **Database:** MongoDB (via official `mongodb` client)
- **AI / LLM:** Google Gemini API (Flash models)
- **Logging & Diagnostics:** Pino logger
- **Deployment Target:** Render / Docker container compatible

---

## 📋 System Architecture

```text
               +------------------------------------+
               |         WhatsApp Network           |
               +-----------------+------------------+
                                 |  (WebSockets)
                                 v
               +------------------------------------+
               |      Baileys Socket Manager        |
               +-----------------+------------------+
                                 |
         +-----------------------+-----------------------+
         |                                               |
         v                                               v
+------------------+                           +--------------------+
|  MongoDB Session | (Persistent Auth Keys)    | Message Dispatcher |
|  Cache on Cloud  |                           +---------+----------+
+------------------+                                     |
                                                         v
                                               +--------------------+
                                               |  Gemini AI Engine  |
                                               |  (Context Memory)  |
                                               +--------------------+
```

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js (v18 or higher)
- MongoDB Connection URI
- Google Gemini API Key

### 2. Installation
```bash
git clone https://github.com/solokool66/whatsapp_bot.git
cd whatsapp_bot
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/
GEMINI_API_KEY=your_gemini_api_key
```

### 4. Running the Service
```bash
# Start the automation server
node index.js
```
Scan the terminal QR code using your WhatsApp Linked Devices menu on first launch. Credentials will be securely cached to MongoDB for subsequent runs.

---

## 📄 License
This project is licensed under the MIT License.
