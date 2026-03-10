# DevPost Submission — Full Text

## Project Name
Sofia AI — Live Multimodal Concierge for Hotels

## Short Description (Tagline)
A production AI concierge that sees, hears, and speaks with hotel guests across 5 channels — voice, video, phone, WhatsApp, and chat — executing 23 live tools with Google Search grounding. Deployed on Google Cloud Run, serving 6 real hotels in Florence.

---

## Inspiration

We run 6 hotels and our reception desks close at night. Guests calling after hours would reach voicemail: frustrated travelers needing directions, late check-in instructions, or last-minute booking changes. We wanted an AI that could actually _do things_, not just chat. Sofia needed to answer real phone calls, check live availability, create booking offers with payment links, and speak naturally in the guest's language.

When Google released the Gemini Live API with native audio and non-blocking function calls, we saw the opportunity to build something that feels like talking to a real concierge, one who can multitask, remember guests, and never sleep.

---

## What it does

Sofia is a **production AI concierge** running 24/7 across our 6 Florence hotels: Palazzina Fusi, Hotel Lombardia, Hotel Arcadia, Hotel Villa Betania, L'Antica Porta, and Residenza Ognissanti. She operates across five live channels simultaneously.

**🎙️ Voice Mode:** Real-time conversations using Gemini Live API. Sofia adapts her speaking pace and tone in real-time based on the guest's emotional state via affective dialog. Guests can adjust speech speed to normal, slow, or fast.

**📹 Video Mode + Sofia Lens:** Voice plus live camera and GPS. Guests share their camera for menu translation, landmark identification, and map reading. **Sofia Lens** adds AR-powered visual identification — point your phone at a building and an overlay appears with its name and history, point at a restaurant menu and Sofia translates it live. GPS location enables Sofia to give walking directions from the guest's exact position and recommend nearby restaurants, pharmacies, and attractions relative to where they are standing.

**📞 Phone Calls:** Answers actual hotel phone calls via a custom Node.js SIP/RTP bridge to Gemini Live, converting G.711 audio in real-time. When reception is closed, no call goes to voicemail. Sofia greets returning callers by name, already knowing their reservation details.

**💬 Web Chat:** Text conversations with rich interactive cards: live booking options with real prices, quotation confirmations with payment links, place cards with directions, train departure boards, weather forecasts, partner tour catalogs, and visual day itineraries.

**📱 WhatsApp:** Full integration with Meta Cloud API including 4 native interactive Flows for booking, check-in, tour selection, and guest feedback. Sofia handles incoming WhatsApp messages with the same intelligence as web chat, including voice note transcription, image understanding, and rich content delivery. After phone calls, she automatically sends a follow-up WhatsApp with the booking link. For guests outside the 24-hour conversation window, she uses approved UTILITY message templates to reach them proactively.

---

## See, Hear, and Speak: True Multimodal

Sofia embodies all three modalities the Gemini Live API was built for.

**She Speaks** via Gemini 2.5 Flash Native Audio, responding in natural conversational voice across web, voice mode, video mode, and real telephone calls, adjusting pace and tone based on the guest's emotional state detected through affective dialog.

**She Hears** guest speech in real-time, transcribing and understanding context across a full conversation, recognizing returning callers by phone number and matching them to their reservation before they identify themselves.

**She Sees** when guests share their camera or screen during video sessions. A guest pointing their phone at a restaurant menu gets an instant translation. Someone showing a confusing train ticket gets step-by-step guidance. Video frames are streamed at _1 FPS_ as JPEG to Gemini Live for continuous visual understanding without interrupting the conversation. **Sofia Lens** takes this further: when an object or landmark is identified, an AR overlay tag appears on screen with the name, description, and relevant actions — transforming the camera into a real-time city guide. Combined with GPS coordinates streamed alongside audio and video, Sofia knows both _what_ the guest is looking at _and where_ they are, enabling directions like "turn left at the end of this street, your hotel is 200 meters ahead."

---

## Sofia's Persona

Sofia is not a generic assistant. She has a defined identity: a warm, professional Florentine concierge who knows the city deeply, speaks the guest's language, and takes pride in making every stay memorable. Her responses reflect local knowledge baked into a curated knowledge base that hotel staff maintain through a protected admin panel. She never invents hotel policies, prices, or availability. Every factual claim is grounded in live API data or staff-verified knowledge, preventing hallucinations on the most sensitive topics: pricing, availability, and check-in procedures.

---

## The 23 Live Tools Sofia Executes in Real-Time

1. **Room Availability:** Live pricing across all 6 properties via HotelInCloud API, with rate comparison vs Booking.com
2. **Personalized Quotations:** Creates real booking offers with payment links, sent to guest email
3. **Reservation Lookup:** Finds bookings by guest name, booking code, or OTA confirmation number from Booking.com and Expedia
4. **Reservation Notes:** Adds staff notes to any reservation including special requests, arrival info, and preferences
5. **Partner Tours:** Searches 50+ Florence tours via Bokun API with direct per-tour booking links
6. **Visual Itinerary Builder:** Creates structured day-by-day plans incorporating partner tours and local recommendations
7. **WhatsApp Flows:** Triggers native interactive WhatsApp forms for booking, check-in, tour selection, and feedback — encrypted with RSA-OAEP + AES-128-GCM
8. **Google Search Grounding:** Real-time web search for current Florence events, exhibitions, restaurant openings, and time-sensitive local information — answers stay accurate even when the knowledge base hasn't been updated
9. **Nearby Places:** Google Places API with ratings, open/closed status, and walking directions
10. **Weather:** Live forecasts via Open-Meteo API
11. **Train Schedules:** Real-time departures from Firenze Santa Maria Novella with platform numbers and delay status
12. **Public Transport:** Google Directions API for bus and tram routes across Florence
13. **Hotel Location:** Maps, verified entrance photos, and turn-by-turn directions for all 6 properties
14. **Florence Events:** Local calendar for concerts, exhibitions, and markets
15. **Support Email:** Sends messages directly to hotel reception on the guest's behalf
16. **Human Handoff:** Provides direct staff contact info and transfers the conversation to a human when the situation requires it
17. **Knowledge Base Updates:** Proposes new knowledge entries when guests ask questions Sofia cannot answer from verified sources
18. **Proactive Opt-In:** Enables the Trip Intelligence Engine for guests who agree to receive personalized tips — restaurant suggestions, weather alerts, and daily briefings delivered proactively via WhatsApp or Web Push
19. **Visual Identification (Sofia Lens):** AR-powered landmark, menu, and object identification via the guest's live camera feed — point your phone at a building and Sofia tells you its history, point at a menu and she translates it
20. **Hotel Comparison:** Side-by-side comparison of properties with pricing, amenities, location, and ratings to help guests choose the right hotel for their needs
21. **Guest Preferences:** Persists guest preferences (room type, dietary needs, interests) across channels and sessions — Sofia remembers what matters to each guest
22. **Cross-Channel WhatsApp:** Sends WhatsApp messages to guests from any channel, with automatic template fallback for guests outside the 24-hour conversation window
23. **Human Assistance Escalation:** Escalates complex issues to human staff with full conversation context, ensuring nothing is lost in the handoff

---

## Intelligence and Personalization

**Caller Recognition:** A phone index built from all active reservations means that when a guest calls, Sofia greets them by name and references their booking before they say a word.

**Affective Dialog:** Detects emotional state and adjusts tone. A stressed caller at midnight gets extra calm and reassurance. An excited guest planning their trip gets enthusiasm back.

**Language Detection:** Automatically switches language based on what the guest writes or their phone country code. Italian, French, German, Spanish, and English are all supported natively, with the full system prompt and all tool responses translated per language.

**Cross-Channel Memory:** A guest who messages on WhatsApp, then calls, then opens the web chat is recognized as the same person across all three channels. Sofia remembers the full conversation history — if a guest asks about room prices on WhatsApp and then calls to book, she already knows which room they want. Guest profiles are matched by phone number, email, or name and persist across sessions and channels.

**Location Awareness:** In video mode, GPS coordinates are streamed to Gemini alongside camera and audio. Sofia uses the guest's real-time position to provide walking directions, recommend the nearest pharmacy or restaurant, and identify what the guest is looking at relative to known landmarks.

**Check-in Assistant:** On arrival day, Sofia proactively provides self check-in links, door codes, and parking information.

**Emergency Mode:** Detects distress keywords and immediately surfaces emergency numbers and staff contacts.

**Smart Upselling:** Proactively suggests breakfast packages, room upgrades, and late checkout at contextually appropriate moments, never in a pushy way.

**Trip Intelligence Engine:** Sofia's most ambitious feature. A background engine evaluates 5 trigger types every 15 minutes per active guest: _location-aware_ (GPS proximity to 50 curated Florence POIs), _weather-reactive_ (rain or heat alerts with indoor alternatives), _time-contextual_ (lunch and dinner suggestions), _trip-phase_ (orientation on day 1, logistics on checkout day), and _behavioral_ (follow-ups on expressed interests from past conversations). Each morning at 08:00, opted-in guests receive a personalized Daily Briefing with weather, 3 tailored picks, and a rotating hidden gem. Messages are generated by Gemini from trigger context and delivered via WhatsApp (primary) or Web Push (fallback). Strict guardrails enforce a maximum of 3 messages per day, 2-hour minimum gaps, quiet hours from 22:00 to 07:30, and no repeat suggestions. No hotel AI does this — most chatbots answer questions; Sofia anticipates them.

---

## Grounding and Hallucination Prevention

This is a production system handling real money and real guests. Sofia is strictly grounded at every level.

Room prices and availability always come from the live HotelInCloud API, never from memory. Reservation details are fetched in real-time, never assumed. Local recommendations use Google Places API ratings and live open/closed status. Train schedules are scraped from live departure boards at the moment of the request. For time-sensitive questions about current exhibitions, events, or restaurant openings, Sofia uses Google Search grounding to pull live web results rather than relying on potentially stale knowledge. When Sofia does not know something, she proposes a knowledge base update rather than inventing an answer.

A tool-call verification guard actively detects when Sofia claims to have performed an action without actually calling a tool, and corrects her immediately:

```javascript
const actionPhrases = ["i've sent", "i've booked", "i've created", "here are the available"];
if (actionPhrases.some(phrase => outputText.toLowerCase().includes(phrase)) && !toolCallsMade) {
  // Inject correction and re-trigger the tool call
  geminiSend({ client_content: { turns: [{ role: "user", parts: [{
    text: "[SYSTEM: You claimed to perform an action but no tool was called. Please use the appropriate tool.]"
  }]}], turn_complete: true }});
}
```

---

## Staff and Operations

**Post-call email transcripts:** Every phone call is transcribed and emailed to hotel management automatically when the call ends.

**Missed call WhatsApp:** When Sofia handles a call that would have gone to voicemail, she sends an automatic follow-up WhatsApp to the caller with a booking link.

**Quotation follow-ups:** Automated reminders sent to guests about pending quotations that have not yet converted to bookings.

**Check-in reminders:** Automated WhatsApp messages sent to guests before their arrival date with self check-in instructions.

**Admin dashboard:** Full conversation history grouped by session and channel across Web and WhatsApp, with analytics covering the conversion funnel, peak hours, and language breakdown across all guests.

**Knowledge base management:** Hotel staff can update Sofia's knowledge through a protected admin panel without touching any code.

**Revenue attribution:** Every quotation Sofia creates is tracked through the full funnel — creation, click, and booking — with channel attribution (web, WhatsApp, or phone). The admin dashboard shows conversion rates per hotel and per channel, giving management clear visibility into Sofia's direct revenue impact.

**WhatsApp Interactive Flows:** Native WhatsApp forms for structured booking, check-in, tour selection, and guest feedback, all powered by server-side data exchange encrypted with RSA-OAEP and AES-128-GCM.

---

## How we built it

**AI Layer:** Gemini 2.5 Flash Native Audio for voice, video, and phone calls. Gemini 3 Flash for text chat and WhatsApp. Both via the Google GenAI SDK. The ~15,000-token system instruction is cached for 1 hour using context caching, cutting input token costs by approximately 90%.

**Voice Architecture:** The React frontend captures audio via `getUserMedia` and streams PCM chunks over WebSocket to an Express.js server, which proxies them to the Gemini Live API. Tool calls execute with `NON_BLOCKING` behavior so Sofia keeps talking while slow APIs respond, then interrupts herself with results when they arrive using `scheduling: "INTERRUPT"`.

**Video Architecture:** In video mode, camera frames are captured at 1 FPS, encoded as JPEG, and streamed alongside audio for continuous multimodal context. GPS coordinates from the device's geolocation API are sent over the same WebSocket and injected into Gemini's context as system messages so Sofia always knows the guest's position. The camera stream is acquired in parallel with the WebSocket handshake for near-instant startup.

**Permission Consent Flow:** A branded consent modal requests microphone (required), camera (optional), and GPS location (optional) upfront with clear explanations in 5 languages, eliminating surprise browser permission popups. The microphone `getUserMedia` call fires directly inside the click handler to preserve the mobile user gesture chain on iOS Safari. Camera and location permissions are optional and gracefully degraded.

**Phone Architecture:** A Node.js SIP bridge registers with Messagenet, answers incoming INVITEs, and bridges RTP audio to Gemini Live via WebSocket. The audio pipeline:

```
Phone → G.711 μ-law 8kHz
      → PCM 16kHz (2:1 upsample, linear interpolation)
      → Gemini Live API
      → PCM 24kHz
      → PCM 8kHz (3:1 downsample, [1,2,1]/4 weighted average)
      → G.711 μ-law encode
      → RTP → Phone
```

The resampling uses a weighted average kernel where the output sample at position \\(n\\) is:

$y[n] = \frac{x[3n] + 2x[3n+1] + x[3n+2]}{4}$

This matches the algorithm used by proven telephony systems and produces clean audio where naive approaches create audible artifacts.

RTP packets are sent at strict **20ms intervals** (160 samples at 8kHz per packet). Burst sending causes severe distortion on telephone hardware:

```javascript
const RTP_PACKET_INTERVAL_MS = 20;
setInterval(() => {
  if (rtpQueue.length > 0) {
    sendRtpPacket(rtpQueue.shift());
  }
}, RTP_PACKET_INTERVAL_MS);
```

**WhatsApp:** Meta Cloud API with HMAC SHA-256 webhook signature verification. Voice notes transcribed via Gemini, images understood via multimodal Gemini, rich content delivered as formatted follow-up messages. Four interactive Flows (booking, check-in, tours, feedback) use server-powered data exchange encrypted with RSA-OAEP + AES-128-GCM. Approved UTILITY templates bypass the 24-hour conversation window for proactive outreach across all supported languages.

**Security:** AES-256-GCM encryption at rest for all sensitive data, per-file async mutex locks preventing concurrent JSON corruption, signed HttpOnly cookies for admin authentication, and SSRF protection on all external media fetches. All API keys are server-side only and never exposed to the client bundle.

**Deployment:** Dockerized and deployed on Google Cloud Run in `europe-west1`. The full deploy pipeline is automated via a single shell script (`deploy-gcp.sh`) covering Artifact Registry push, Cloud Run deployment, and environment configuration. See the architecture diagram in the image gallery for a full visual breakdown of how Gemini connects to the backend, tools, and frontend.

### Graceful Error Handling

Gemini Live disconnections trigger automatic reconnection with session resumption handles, preserving full conversation context across reconnects with up to 3 retry attempts using exponential backoff. Empty Gemini responses auto-retry with a fresh session. All public endpoints are rate-limited: 20 requests per minute for chat, 10 per hour for reservation lookup, 5 per hour for support messages. A 25-second timeout prevents infinite hangs on slow tool calls. When HotelInCloud APIs are unavailable, Sofia acknowledges limitations rather than guessing. On Safari, AudioContext suspension detection shows a one-tap activation overlay instead of silently hanging.

---

## Challenges we faced

**RTP packet pacing** was critical. Burst-sending audio causes severe distortion on phones. Strict 20ms interval queuing solved it, matching exactly the timing that telephone infrastructure expects at 8kHz with 160 samples per packet.

**Base64 PCM alignment** was a subtle bug. Node.js Buffer pooling creates non-zero `byteOffset` values that silently corrupt `Int16Array` views. The fix:

```javascript
// Wrong — corrupted Int16Array when Buffer has non-zero byteOffset
const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

// Correct — always copy to fresh ArrayBuffer first
const fresh = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const samples = new Int16Array(fresh);
```

**Gemini Live 1008 disconnects** during native audio combined with tool calling required building automatic session recovery with resumption handles and a 3-attempt retry loop with exponential backoff. The root cause appears to be a Gemini Live API-side issue with certain feature combinations.

**Safari AudioContext suspension:** Safari requires `AudioContext.resume()` to be called within a user gesture context. After the consent modal (which consumes the original gesture), the voice mode's auto-connect runs from a React `useEffect` with no gesture. We detect suspended AudioContexts via a 2-second timeout race and show a one-tap activation button instead of hanging indefinitely.

**Mobile permission gesture chains:** Calling `getUserMedia` after any `await` breaks the user gesture requirement on iOS Safari. The entire consent flow had to be restructured so the microphone request fires directly inside the click handler, before any asynchronous operations.

**ESM vs CommonJS scoping** caused function declarations inside `try` blocks to be block-scoped in ESM but function-scoped in CommonJS. This produced a _"geminiSend is not defined"_ error that only appeared in the containerized Cloud Run environment, never on the development server running CommonJS.

**Gemini transcription artifacts:** The Live API occasionally emits control character sequences like `<ctrl46>` as output transcription tokens after turn completion. These required filtering at the transcription handler level before sending to the frontend.

**Context window management:** With 23 tools, a large system prompt, and long guest conversations, the context window fills quickly during phone calls. We implemented sliding window compression:

```javascript
contextWindowCompression: {
  slidingWindow: { targetTokens: 16384 },
  triggerTokens: 102400
}
```

---

## What we learned

_Non-blocking function calls_ are the difference between a voice assistant and a voice concierge. Guests do not sit in silence while APIs respond.

_Affective dialog_ has a measurable impact. Callers who sound stressed respond better when Sofia adjusts her tone, and this happens automatically without any manual configuration.

_Context caching_ is essential at scale. A 15,000-token system prompt without caching would cost more per day than the hotel staff it is assisting.

_Phone audio quality_ is unforgiving. The \\(\frac{x[3n] + 2x[3n+1] + x[3n+2]}{4}\\) weighted resampling produces clean audio. Naive downsampling creates artifacts audible on every single call.

_GPS plus camera plus voice_ is a multiplier. Any one modality alone is useful. All three together — knowing where the guest is, what they are looking at, and what they are saying — enables a level of assistance that no text chatbot can approach.

_Production deployment_ reveals bugs that staging never does. The ESM scoping issue, the Buffer alignment problem, Safari AudioContext suspension, and RTP pacing behavior all appeared only under real conditions with real hardware and real networks.

_Grounding is not optional_ in hospitality. A guest who receives a wrong price or wrong check-in time because the AI hallucinated creates a real-world problem. Every factual response must trace back to a live API call or a verified knowledge base entry.

---

## What's next

Expanding Sofia to more hotel chains across Italy and eventually other countries.

Adding Gemini native image generation for visual itinerary cards that guests can save and share.

Real-time multilingual translation mode for mixed-language guest groups traveling together.

Predictive room assignment based on guest preference history analyzed across multiple stays.

---

## Built With

**AI Models**
- [Google Gemini 2.5 Flash Native Audio](https://deepmind.google/technologies/gemini/) — voice, video, and phone calls
- [Google Gemini 3 Flash](https://deepmind.google/technologies/gemini/) — text chat and WhatsApp

**Google Cloud**
- [Google Cloud Run](https://cloud.google.com/run) — containerized deployment in europe-west1
- [Google GenAI SDK](https://ai.google.dev/gemini-api/docs) — Gemini API integration
- [Google Places API](https://developers.google.com/maps/documentation/places/web-service) — nearby restaurants, attractions, ratings
- [Google Directions API](https://developers.google.com/maps/documentation/directions) — public transport routing
- [Google Search Grounding](https://ai.google.dev/gemini-api/docs/grounding) — real-time web search for current events and local info
- [Google Artifact Registry](https://cloud.google.com/artifact-registry) — Docker image storage

**Backend**
- Node.js — server runtime
- Express.js — HTTP and WebSocket server
- Docker — containerization

**Frontend**
- React — UI framework
- TypeScript — type safety
- Tailwind CSS — styling
- Vite — build tooling

**External APIs**
- HotelInCloud API — live room availability and quotations
- Bokun API — partner tours and activities
- Meta WhatsApp Cloud API — WhatsApp messaging and interactive Flows
- Open-Meteo API — weather forecasts
- Messagenet SIP — telephone infrastructure

**Protocols**
- WebSocket — real-time audio/video streaming
- SIP/RTP — telephone call handling
- G.711 μ-law — telephone audio codec
- RSA-OAEP + AES-128-GCM — WhatsApp Flow encryption
- Web Push (VAPID) — proactive browser notifications

## Category

Live Agents
