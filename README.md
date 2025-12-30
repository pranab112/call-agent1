
# 📞 AI Voice Receptionist

This guide will help you set up the **AI Voice Agent**. This system uses **Google Gemini Live API** for intelligence, **Twilio** for phone calls, and **SQLite** to save your office data.

---

## ✅ Prerequisites

1.  **Node.js**: Install from [nodejs.org](https://nodejs.org/) (Version 18+ recommended).
2.  **Twilio Account**: You need an Account SID and Auth Token.
3.  **Google Gemini API Key**: Get one from [aistudio.google.com](https://aistudio.google.com).

---

## 🛠️ Step 1: Install Dependencies

Open your terminal (Command Prompt or Terminal) in this project folder and run:

```bash
npm install
```

This installs `fastify`, `twilio`, `better-sqlite3`, `react`, and other necessary tools.

---

## 🔑 Step 2: Configure Environment Variables

Create a new file named `.env` in the root folder and fill it with your credentials (use `.env.example` as a template):

```ini
# --- TWILIO CREDENTIALS ---
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# --- SIP CONFIGURATION ---
SIP_DOMAIN_NAME=aivoicereceptionist
SIP_USER=aiagent
SIP_PASS=YourSecurePassword!

# --- SERVER URL ---
# For Local: Use your Ngrok URL
# For Railway: Use your Railway App URL
SERVER_URL=https://your-app.ngrok-free.dev

# --- AI API KEY ---
API_KEY=AIzaSy...
```

---

## 🚀 Step 3: Run the Server

You need to run two things: the **Backend Server** (handles calls & database) and the **Frontend** (the dashboard).

### 1. Start the Backend (in Terminal 1)
```bash
npm start
```
*You should see: `✅ Server running on port 5050`*

### 2. Start the Frontend (in Terminal 2)
```bash
npm run dev
```
*Open the link shown (usually `http://localhost:5173`) in your browser.*

---

## 🔗 Step 4: Connect Twilio

You can run the setup script to link your Twilio number to this URL automatically.

In a new terminal:
```bash
npm run setup
```
*This will log in to Twilio, update your Phone Number URL and SIP Domain URL to point to your server.*

Alternatively, use the "Auto-Setup" button in the web dashboard's **Connect** tab.

---

## 💾 SQLite Database

The system now uses **SQLite**.
*   A file named `office_agent.db` will be created automatically in your folder when you run `npm start`.
*   **Result**: If you restart your laptop or the server, the AI *remembers* your company instructions!

---

## 🧪 How to Test

1.  **SIP Softphone**: Open **Linphone** or **Zoiper**.
    *   **User**: `aiagent`
    *   **Password**: (The password you set in .env)
    *   **Domain**: `aivoicereceptionist.sip.twilio.com`
    *   **Transport**: UDP or TCP

2.  **Real Phone**:
    *   Call your Twilio Phone Number.
    *   The AI should answer based on your dashboard settings.
