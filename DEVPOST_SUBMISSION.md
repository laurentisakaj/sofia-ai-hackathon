# Devpost Submission Text

## Project Name
Sofia AI — Live Voice Concierge for Hotels

## Short Description (Tagline)
A real-time, multimodal AI concierge that answers phone calls, speaks with guests, and manages hotel operations through 15 live tools — powered by Gemini Live API.

## Detailed Description

### What it does

Sofia is a production AI concierge serving 6 hotels in Florence, Italy. She handles real guest interactions across three channels: real-time voice conversations (Gemini Live API), actual phone calls (SIP/RTP bridge to Gemini Live), and web chat with rich content cards.

During any conversation, Sofia executes 15 live tools: checking room availability across 6 properties, creating booking quotations with payment links, looking up reservations (including Booking.com and Expedia codes), searching 50+ partner tours, providing weather forecasts, transit directions, train schedules, and more.

Sofia adapts to each guest: she detects emotional state and adjusts tone (affective dialog), greets returning guests by name using a phone index, predicts preferences from booking history, and speaks in the caller's language based on their country code.

### How we built it

**AI**: Gemini 3 Flash for text chat, Gemini 2.5 Flash Native Audio for voice and phone — both via Google GenAI SDK. The 15,000-token system instruction is cached for 1 hour using GoogleAICacheManager, cutting input token costs by ~90%.

**Voice Architecture**: The React frontend captures audio via getUserMedia and streams PCM chunks over WebSocket to an Express.js server, which proxies them to Gemini Live API. Tool calls execute asynchronously (NON_BLOCKING behavior) so Sofia keeps talking while slow APIs respond, then interrupts with results.

**Phone Architecture**: A Node.js SIP bridge answers real hotel phone calls, converts G.711 u-law audio (8kHz) to PCM (16kHz), and streams it to Gemini Live via WebSocket. The reverse path resamples Gemini's 24kHz audio back to 8kHz G.711 with 20ms RTP packet pacing to prevent distortion.

**Multimodal**: Guests can share their camera or screen during voice calls — video frames are sent at 1 FPS as JPEG to Gemini Live for real-time visual understanding (menu translation, landmark identification, etc.).

**Deployment**: Containerized with Docker, deployed on Google Cloud Run (europe-west1) with session affinity for WebSocket connections and 3600s timeout for long voice sessions.

### Challenges we ran into

- Gemini Live API occasionally disconnects with 1008 errors during native audio + tool calling — we built automatic session recovery.
- RTP packet pacing is critical — burst-sending audio causes distortion on phones. Solved with strict 20ms interval queuing.
- Base64 PCM alignment: Node.js Buffer pooling creates non-zero byteOffset which corrupts Int16Array views. Solution: always copy to fresh ArrayBuffer.
- Gemini 3 Flash Preview intermittently returns empty responses — we auto-retry with fresh sessions and log diagnostics.

### What we learned

- Non-blocking function calls transform the voice experience — guests don't sit in silence while APIs respond.
- Affective dialog makes a measurable difference in guest satisfaction — stressed callers receive noticeably calmer, more reassuring responses.
- Context caching is essential at scale — without it, the large system prompt dominates token costs.
- Phone audio quality depends on precise resampling algorithms — the `[1,2,1]/4` weighted average method produces clean audio.

### What's next

- Expanding to more hotel chains and languages.
- Adding Gemini's native image generation for visual itinerary cards.
- Real-time translation mode for multilingual groups.

## Built With

- Google Gemini 3 Flash
- Google Gemini 2.5 Flash Native Audio
- Google GenAI SDK (@google/genai)
- Google Cloud Run
- Node.js / Express
- React / TypeScript
- WebSocket
- HotelInCloud API
- Google Maps/Places API
- Bokun Tours API

## Category

Live Agents
