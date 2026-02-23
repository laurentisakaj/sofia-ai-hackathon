# DevPost Submission

## Project Name
Sofia AI — Live Multimodal Concierge for Hotels

## Short Description (Tagline)
A production AI concierge that sees, hears, and speaks with hotel guests across 5 channels — voice, video, phone, WhatsApp, and chat — executing 16 live tools. Deployed on Google Cloud Run, serving 6 real hotels in Florence.

## Detailed Description (Markdown — paste into DevPost)

### The Problem

Hotel front desks are overwhelmed. Guests ask the same questions in 5 languages, calls go unanswered after hours, and booking inquiries slip through the cracks. Existing chatbots are text-only, turn-based, and disconnected from hotel systems — they can tell you room prices but can't *actually book you a room*.

### What Sofia Does

Sofia is a **live, multimodal AI agent** that doesn't just answer questions — she **acts**. She's a production system serving 6 hotels in Florence, Italy, handling real guest interactions across **5 channels** with **16 live tools**.

**She sees.** Guests share their camera — Sofia translates restaurant menus, identifies landmarks, reads documents. Combined with GPS, she gives walking directions from the guest's exact position.

**She hears.** Real-time voice conversations with affective dialog — Sofia detects when a guest is stressed and responds more calmly. She proactively offers helpful information during natural conversation pauses.

**She speaks.** Native audio output with adjustable speech speed. Non-blocking tool calls mean Sofia keeps talking while slow APIs execute, then interrupts naturally with results — no awkward silences.

**She acts.** During any conversation, Sofia executes real operations:
- Checks room availability across 6 properties (HotelInCloud API)
- Creates personalized booking offers with payment links
- Looks up reservations by guest name, booking code, or OTA confirmation numbers
- Searches 50+ partner tours with per-tour booking links (Bokun API)
- Builds visual day-by-day itineraries
- Sends interactive WhatsApp forms for booking, check-in, and feedback
- Provides weather, transit, train schedules, nearby places, and hotel directions

### 5 Live Channels

| Channel | How it works |
|---------|-------------|
| **Voice Mode** | WebSocket streaming to Gemini 2.5 Flash Native Audio. Affective dialog, proactive audio, non-blocking tool calls. |
| **Video Mode** | Camera + audio + GPS streamed to Gemini Live at 1 FPS. "What am I looking at?" / "Translate this menu" / "How do I get to my hotel from here?" |
| **Phone Calls** | Real hotel phone calls. Node.js SIP/RTP bridge converts G.711 u-law (8kHz) to PCM (16kHz), streams to Gemini Live. Caller identification via phone index. After call: transcript emailed to staff + WhatsApp follow-up with booking link. |
| **WhatsApp** | Meta Cloud API with 4 interactive Flows (booking, check-in, tours, feedback). Voice transcription and image understanding via Gemini. Approved templates for out-of-window messaging. |
| **Web Chat** | Gemini 3 Flash with 1M context window. Rich attachment cards: booking options, quotation confirmations, tour cards, maps, weather, train schedules, itineraries. |

### How We Built It

**Dual Gemini Architecture**: Text chat and WhatsApp use Gemini 3 Flash (1M context, PhD-level reasoning). Voice, video, and phone use Gemini 2.5 Flash Native Audio (bidirectional streaming, native speech).

**Non-blocking Tool Execution**: Slow tools (`check_room_availability`, `create_personalized_quotation`, `lookup_reservation`, `get_partner_tours`) use `behavior: "NON_BLOCKING"` so Sofia keeps the conversation flowing. When results arrive, `scheduling: "INTERRUPT"` delivers them immediately.

**Context Caching**: The 15,000-token system instruction (hotel knowledge, tool declarations, cancellation policies, 8 AI behaviors) is cached for 1 hour via `GoogleAICacheManager`, cutting input token costs by ~90%.

**Phone Audio Pipeline**: G.711 u-law 8kHz → PCM 16kHz (2:1 linear interpolation) → Gemini. Reverse: PCM 24kHz → 8kHz (3:1 `[1,2,1]/4` weighted average) → G.711 u-law. RTP packets paced at strict 20ms intervals — burst sending causes audible distortion.

**Consent-First Permissions**: A branded consent modal requests microphone (required), camera (optional), and GPS location (optional) with clear explanations — no surprise browser popups. Mobile-safe: `getUserMedia` called directly in click handler to preserve gesture chain.

**WhatsApp Flows**: 4 server-powered interactive forms with RSA-OAEP + AES-128-GCM encryption. Screens rendered server-side, metadata carried between screens, labels in 5 languages.

**Google Cloud Run Deployment**: Docker multi-stage build, `europe-west1` region, session affinity for WebSocket persistence, 3600s timeout for long voice sessions, auto-scaling 0→3 instances.

### Challenges We Ran Into

- **Gemini Live 1008 disconnects** during native audio + tool calling — built automatic session recovery with graceful reconnection.
- **RTP packet pacing** is critical — burst-sending audio causes distortion on phones. Solved with strict 20ms `setInterval` queuing.
- **Node.js Buffer pooling** creates non-zero `byteOffset` which corrupts `Int16Array` views when decoding base64 PCM. Solution: always copy to fresh `ArrayBuffer`.
- **Mobile permission chains** — calling `getUserMedia` after any `await` breaks the user gesture requirement on iOS Safari. Had to restructure the entire consent flow.
- **WhatsApp Flow constraints** — `RadioButtonsGroup` title max 30 chars, `EmbeddedLink` requires valid URLs, no ERROR screens allowed in flow JSON.

### What We Learned

- **Non-blocking function calls transform voice UX** — guests don't sit in silence while APIs respond. Sofia says "Let me check that for you" and keeps the conversation natural.
- **Affective dialog matters** — stressed callers (lost luggage, late arrival) receive measurably calmer, more reassuring responses. Hotel staff reported guests mentioning Sofia's helpfulness.
- **Context caching is essential at scale** — without it, the large system prompt dominates token costs on every request.
- **5 channels > 1 channel** — guests use whatever's convenient: WhatsApp while walking, voice in the hotel room, phone when they can't find WiFi.

### What's Next

- Expanding to more hotel chains across Europe
- Gemini native image generation for visual itinerary cards
- Real-time translation mode for multilingual groups
- Guest sentiment analytics dashboard for hotel management

## Built With

- Google Gemini 3 Flash
- Google Gemini 2.5 Flash Native Audio (Live API)
- Google GenAI SDK (@google/genai)
- Google Cloud Run
- Google Maps / Places API
- Node.js / Express
- React / TypeScript / Tailwind CSS
- WebSocket (bidirectional audio streaming)
- HotelInCloud API
- Bokun Tours API
- Meta WhatsApp Cloud API
- Open-Meteo Weather API

## Category

Live Agents

## Links

- **Live Demo**: https://sofia-ai-942607221166.europe-west1.run.app
- **Repository**: https://github.com/laurentisakaj/sofia-ai-hackathon
- **Architecture Diagram**: Included in repository as `sofia-architecture-diagram.png`
