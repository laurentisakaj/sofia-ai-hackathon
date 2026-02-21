# Sofia AI — Live Voice Concierge for Hotels

**A real-time, multimodal AI concierge that answers phone calls, speaks with guests via voice, and handles hotel operations through 15 live tools — all powered by Google Gemini.**

> Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) — Category: **Live Agents**

## Live Demo

**[sofia-ai-942607221166.europe-west1.run.app](https://sofia-ai-942607221166.europe-west1.run.app)**

Deployed on Google Cloud Run (europe-west1).

## What Sofia Does

Sofia is a production AI concierge serving 6 hotels in Florence, Italy. She handles real guest interactions across three channels:

- **Voice Mode** — Real-time conversations using Gemini Live API with camera/screen sharing
- **Phone Calls** — Answers actual hotel phone calls via SIP/RTP bridge to Gemini Live (when reception is closed)
- **Web Chat** — Text conversations with rich attachment cards (booking options, maps, tours, itineraries)

### Live Tool Calls (15 tools)

During any conversation, Sofia can execute real actions:

| Tool | What it does |
|------|-------------|
| `check_room_availability` | Real-time hotel pricing across 6 properties via HotelInCloud API |
| `create_personalized_quotation` | Generate booking offers with direct payment links |
| `lookup_reservation` | Search reservations by guest name or booking code (Booking.com, Expedia, etc.) |
| `add_reservation_note` | Add staff notes to existing reservations |
| `get_partner_tours` | Search 50+ Florence tours via Bokun API with per-tour booking links |
| `build_itinerary` | Create visual day-by-day itinerary cards |
| `get_current_weather` | Live weather data for Florence |
| `find_nearby_places` | Google Places API for restaurants, attractions, pharmacies |
| `get_public_transport_info` | Google Directions API for transit routes |
| `get_train_departures` | Real-time train schedules from Florence stations |
| `get_hotel_location` | Maps and directions to any property |
| `get_events_in_florence` | Local calendar events |
| `send_support_message` | Email messages to hotel reception |
| `get_human_handoff_links` | Contact info for human staff |
| `propose_knowledge_update` | AI-suggested additions to hotel knowledge base |

### Multimodal Features

- **Affective Dialog** — Sofia adapts tone based on guest emotional state (stressed guests get calmer responses)
- **Proactive Audio** — Intelligently interjects with helpful info during natural pauses
- **Non-blocking Tool Calls** — Keeps talking while slow API calls execute in background
- **Camera/Screen Sharing** — Guests can show menus, maps, or documents for real-time visual understanding
- **Adjustable Speech Speed** — Normal, slow, or fast speech output

## Architecture

```
                                    Google Cloud Run
                          +---------------------------------+
                          |                                 |
    Guest (Browser)       |   Express.js Server (Node.js)   |
   +-------------+       |                                 |
   | React SPA   |------>|  /api/chat -----> Gemini 3 Flash|
   | Voice Mode  |--WS-->|  /ws/voice ----> Gemini Live API|
   +-------------+       |       |                         |
                          |       v                         |
                          |  executeToolCall() --------+   |
                          |       |                    |   |
                          +-------|--------------------+---+
                                  |                    |
                     +------------+------------+       |
                     |            |            |       |
                     v            v            v       v
              HotelInCloud   Google Maps   Bokun    Open-Meteo
              (Booking API)  (Places API)  (Tours)  (Weather)

    Phone Calls (Production only — not on Cloud Run):
    Guest Phone --> Messagenet SIP --> sip-register.js --> sip-bridge.js
                                            |
                                            v
                                      /ws/phone (WebSocket)
                                            |
                                            v
                                      Gemini Live API
```

### Key Architecture Decisions

- **Server-side AI only** — All Gemini API calls happen on the server. No API keys in the client bundle.
- **Context caching** — The 15k-token system instruction is cached for 1 hour via `GoogleAICacheManager`, saving ~90% on input token costs.
- **Non-blocking function calls** — Slow tools use `behavior: "NON_BLOCKING"` so Sofia continues talking while APIs respond, then interrupts with results.
- **Phone index** — In-memory SHA-256 hash map of guest phone numbers to reservation data, refreshed every 30 minutes. Enables personalized greetings ("Welcome back, Mr. Rossi!").

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **AI Models** | Gemini 3 Flash (chat), Gemini 2.5 Flash Native Audio (voice/phone) |
| **SDK** | `@google/genai` + `@google/generative-ai` |
| **Backend** | Node.js, Express 5, WebSocket (`ws`) |
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Vite 6 |
| **Cloud** | Google Cloud Run (europe-west1) |
| **APIs** | HotelInCloud, Google Maps/Places, Bokun Tours, Open-Meteo |
| **Phone** | Node.js SIP/RTP bridge (G.711 u-law, PCM resampling) |

## Getting Started

### Prerequisites

- Node.js 22+
- A [Gemini API key](https://aistudio.google.com/apikey)
- Docker (for Cloud Run deployment)

### Local Development

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/sofia-ai-hackathon.git
cd sofia-ai-hackathon

# Install dependencies
npm install

# Create .env from template
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY and COOKIE_SECRET

# Run locally (starts Express server + Vite dev server)
npm start
```

The app will be available at `http://localhost:5173` (frontend) proxying API calls to `http://localhost:3000` (backend).

### Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `COOKIE_SECRET` | Yes | Random 32-byte hex string for signed cookies |
| `DATA_ENCRYPTION_KEY` | No | AES-256 key for encrypting data at rest |
| `ENCRYPTION_SALT` | If encryption enabled | Salt for key derivation |
| `GOOGLE_MAPS_API_KEY` | No | For places and directions tools |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | No | For email notifications |
| `HOTELINCLOUD_EMAIL`, `HOTELINCLOUD_PASSWORD`, `HOTELINCLOUD_TOTP_SECRET` | No | For live hotel booking integration |

### Deploy to Google Cloud Run

```bash
# Login to GCP
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com artifactregistry.googleapis.com

# Build and deploy
docker build --platform linux/amd64 -t gcr.io/YOUR_PROJECT_ID/sofia-ai .
docker push gcr.io/YOUR_PROJECT_ID/sofia-ai

gcloud run deploy sofia-ai \
  --image=gcr.io/YOUR_PROJECT_ID/sofia-ai \
  --region=europe-west1 \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --timeout=3600 \
  --session-affinity \
  --set-env-vars="GEMINI_API_KEY=your_key,COOKIE_SECRET=$(openssl rand -hex 32)"
```

## Project Structure

```
sofia-ai-hackathon/
├── server.js                 # Express entry point, WebSocket servers
├── server_constants.js       # Hotel knowledge base
├── backend/
│   ├── gemini.js             # System prompt, tool declarations, context caching
│   ├── tools.js              # executeToolCall() — central tool dispatcher
│   ├── hotelincloud.js       # Hotel booking API client
│   ├── voiceHandler.js       # /ws/voice WebSocket (Gemini Live)
│   ├── phoneHandler.js       # /ws/phone WebSocket (phone calls)
│   ├── voiceShared.js        # Shared voice utilities
│   ├── whatsapp.js           # WhatsApp Cloud API client
│   ├── bokun.js              # Partner tour search
│   ├── external.js           # Weather, places, transport APIs
│   ├── scheduler.js          # Scheduled messages (check-in reminders)
│   ├── guests.js             # Guest profile persistence
│   ├── phone.js              # Post-call actions
│   └── email.js              # Email sending
├── routes/
│   ├── chat.js               # POST /api/chat — Gemini text chat
│   ├── whatsapp.js           # WhatsApp webhook handler
│   ├── admin.js              # Admin panel endpoints
│   ├── support.js            # Quotation and reservation endpoints
│   └── proxy.js              # Media proxy
├── lib/
│   ├── config.js             # Shared state, constants, AI clients
│   ├── encryption.js         # AES-256-GCM encryption, file locking
│   ├── language.js           # Language detection
│   ├── auth.js               # Admin authentication middleware
│   └── helpers.js            # Utility functions
├── components/
│   ├── ChatInterface.tsx     # Main chat UI
│   ├── VoiceMode.tsx         # Voice mode with 3D orb visualization
│   ├── AttachmentCard.tsx    # Rich content cards
│   ├── AdminPanel.tsx        # Admin dashboard
│   └── ...
├── services/
│   ├── geminiService.ts      # Client-side API wrapper
│   └── ...
├── Dockerfile                # Multi-stage build for Cloud Run
├── deploy-gcp.sh             # Automated deployment script
└── .env.example              # Environment variable template
```

## How It Works

### Voice Mode Flow

1. User clicks microphone button in the React UI
2. Frontend captures audio via `getUserMedia`, sends PCM chunks over WebSocket to `/ws/voice`
3. Server connects to Gemini Live API (`gemini-2.5-flash-native-audio-preview`)
4. Audio streams bidirectionally: User speech -> Gemini -> Sofia's voice response
5. When Gemini calls a tool (e.g., `check_room_availability`), the server executes it via `executeToolCall()` and feeds the result back to Gemini
6. Sofia speaks the answer naturally, with the option to continue talking while slow tools execute

### Phone Call Flow (Production)

1. Guest calls hotel, no answer -> forwarded via Messagenet VoIP
2. `sip-register.js` answers the call (SIP REGISTER + INVITE handling)
3. `sip-bridge.js` bridges RTP audio (G.711 u-law 8kHz) to WebSocket
4. Server converts audio: G.711 -> PCM 16kHz -> Gemini Live, and reverse
5. Full 15-tool access during the call (check availability, create quotations, etc.)
6. After the call: transcript emailed to staff, WhatsApp follow-up sent to guest

### Smart Features

- **Phone Index**: Matches incoming callers to reservations using SHA-256 hashed phone numbers. Sofia greets returning guests by name.
- **Predictive Preferences**: Analyzes booking history for returning guests (preferred hotel, typical visit month, room type) and proactively suggests.
- **Emergency Mode**: Detects distress keywords and provides emergency numbers.
- **Multilingual**: Greets in the caller's language based on country code (+39 Italian, +33 French, +49 German, etc.).

## License

MIT
