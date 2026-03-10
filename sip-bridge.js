/**
 * SIP Bridge - RTP to WebSocket Audio Bridge
 *
 * Simple plumbing that connects SIP/RTP audio to the /ws/phone endpoint in server.js.
 * All Gemini complexity stays in server.js where it's proven to work.
 *
 * Flow:
 *   Phone Call → sip-register.cjs → HTTP /call/start → this bridge
 *   RTP audio → G.711 decode → PCM 16k resample → WebSocket → server.js → Gemini
 *   Gemini audio → WebSocket → PCM 16k → G.711 encode → RTP → Phone
 */

import dgram from 'dgram';
import { WebSocket } from 'ws';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
}

const HTTP_PORT = parseInt(process.env.SIP_BRIDGE_HTTP_PORT || '5072');
const PUBLIC_IP = process.env.PUBLIC_IP || '91.98.45.18';
const WEBHOOK_SECRET = process.env.PHONE_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error('[SIP-BRIDGE] FATAL: PHONE_WEBHOOK_SECRET environment variable is not set');
  process.exit(1);
}
const SERVER_WS_URL = process.env.SERVER_WS_URL || 'ws://localhost:3000/ws/phone';

// RTP port range
const RTP_PORT_START = 30000;
const RTP_PORT_END = 30100;
const allocatedPorts = new Set();

// Concurrent call limit
const MAX_CONCURRENT_CALLS = 10;

// Call timeout (30 minutes)
const MAX_CALL_DURATION_MS = 30 * 60 * 1000;

// Active calls
const activeCalls = new Map();

console.log(`[SIP-BRIDGE] Starting on port ${HTTP_PORT}`);
console.log(`[SIP-BRIDGE] Public IP: ${PUBLIC_IP}`);
console.log(`[SIP-BRIDGE] Server WebSocket: ${SERVER_WS_URL}`);

// ============ Audio Helpers ============

// Safe min/max for large arrays (Math.min(...arr) causes stack overflow for >65k elements)
function pcmMin(arr) {
  let min = Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i];
  }
  return min;
}

function pcmMax(arr) {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}

// ============ Audio Conversion ============

// G.711 μ-law decode table (ITU-T G.711)
const ULAW_DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let u = ~i & 0xFF;
  let sign = (u & 0x80) ? -1 : 1;
  let exponent = (u >> 4) & 0x07;
  let mantissa = u & 0x0F;
  // Standard formula: ((mantissa << 3) + 0x84) << exponent, then subtract bias
  let magnitude = ((mantissa << 3) + 0x84) << exponent;
  ULAW_DECODE[i] = sign * (magnitude - 0x84);
}

// μ-law exponent lookup table (ITU-T G.711 standard)
// Index = (biased_sample >> 7) & 0xFF, Value = exponent
const ULAW_EXP_LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let exp = 7;
  for (let val = i; val > 0 && (val & 0x80) === 0; val <<= 1) exp--;
  ULAW_EXP_LUT[i] = exp;
}

// G.711 μ-law encode (ITU-T G.711 standard implementation)
function encodeUlaw(sample) {
  const BIAS = 0x84;
  const CLIP = 32635;

  // Get sign and convert to magnitude
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;

  // Add bias
  sample += BIAS;

  // Get exponent from lookup table (using high byte of biased sample)
  const exponent = ULAW_EXP_LUT[(sample >> 7) & 0xFF];

  // Extract mantissa (4 bits below the leading 1)
  const mantissa = (sample >> (exponent + 3)) & 0x0F;

  // Combine and invert per μ-law spec
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

function decodeUlawBuffer(buffer) {
  const pcm = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    pcm[i] = ULAW_DECODE[buffer[i]];
  }
  return pcm;
}

function encodeUlawBuffer(pcm) {
  const ulaw = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    ulaw[i] = encodeUlaw(pcm[i]);
  }
  return ulaw;
}

// Resample 24kHz to 16kHz (3:2 ratio, linear interpolation) — for call recording
function resample24kTo16k(pcm24k) {
  const outLen = Math.floor(pcm24k.length * 2 / 3);
  if (outLen === 0) return new Int16Array(0);
  const pcm16k = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * 1.5;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    const s0 = pcm24k[srcIdx] || 0;
    const s1 = srcIdx + 1 < pcm24k.length ? pcm24k[srcIdx + 1] : s0;
    pcm16k[i] = Math.round(s0 + (s1 - s0) * frac);
  }
  return pcm16k;
}

// Write a WAV file buffer from interleaved PCM samples
function createWavBuffer(samples, sampleRate, numChannels, bitsPerSample) {
  const dataSize = samples.length * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).copy(buffer, 44);
  return buffer;
}

// Resample 8kHz to 16kHz using Catmull-Rom cubic interpolation.
// Uses 4 neighbors instead of 2 — much better preservation of consonant frequencies
// (s, t, f, etc. in the 2-4kHz range) that linear interpolation destroys.
// Formula at t=0.5: (-s0 + 9*s1 + 9*s2 - s3) / 16
function resample8kTo16k(pcm8k) {
  const len = pcm8k.length;
  const pcm16k = new Int16Array(len * 2);
  for (let i = 0; i < len; i++) {
    pcm16k[i * 2] = pcm8k[i]; // Original sample
    // Cubic interpolation using 4 neighbors
    const s0 = i > 0 ? pcm8k[i - 1] : pcm8k[0];
    const s1 = pcm8k[i];
    const s2 = i + 1 < len ? pcm8k[i + 1] : pcm8k[len - 1];
    const s3 = i + 2 < len ? pcm8k[i + 2] : pcm8k[len - 1];
    const interp = (-s0 + 9 * s1 + 9 * s2 - s3) >> 4; // Bit shift = /16
    pcm16k[i * 2 + 1] = interp > 32767 ? 32767 : interp < -32768 ? -32768 : interp;
  }
  return pcm16k;
}

// Resample 16kHz to 8kHz (downsample 2:1)
function resample16kTo8k(pcm16k) {
  const pcm8k = new Int16Array(Math.floor(pcm16k.length / 2));
  for (let i = 0; i < pcm8k.length; i++) {
    pcm8k[i] = pcm16k[i * 2];
  }
  return pcm8k;
}

// Resample 24kHz to 8kHz (downsample 3:1) with 7-tap anti-aliasing filter
// Wider filter prevents high-frequency aliasing that causes screeching artifacts
// Weights: [1, 2, 3, 4, 3, 2, 1] / 16 (symmetric, centered on output sample)
function resample24kTo8k(pcm24k) {
  const outSamples = Math.floor(pcm24k.length / 3);
  if (outSamples === 0) return new Int16Array(0);

  const pcm8k = new Int16Array(outSamples);
  const len = pcm24k.length;
  for (let i = 0; i < outSamples; i++) {
    const c = i * 3; // center sample index in input

    // 7-tap filter: samples at c-3, c-2, c-1, c, c+1, c+2, c+3
    const s3 = c >= 3 ? pcm24k[c - 3] : pcm24k[0];
    const s2 = c >= 2 ? pcm24k[c - 2] : pcm24k[0];
    const s1 = c >= 1 ? pcm24k[c - 1] : pcm24k[0];
    const s0 = pcm24k[c];
    const p1 = c + 1 < len ? pcm24k[c + 1] : pcm24k[len - 1];
    const p2 = c + 2 < len ? pcm24k[c + 2] : pcm24k[len - 1];
    const p3 = c + 3 < len ? pcm24k[c + 3] : pcm24k[len - 1];

    // [1,2,3,4,3,2,1]/16 weighted average
    let avg = Math.round((s3 + s2 * 2 + s1 * 3 + s0 * 4 + p1 * 3 + p2 * 2 + p3) / 16);

    // Clamp to 16-bit range
    if (avg > 32767) avg = 32767;
    else if (avg < -32768) avg = -32768;

    pcm8k[i] = avg;
  }
  return pcm8k;
}

// Reduce output volume to prevent near-clipping harshness (0.8x gain)
function attenuateOutput(pcm) {
  const GAIN = 0.8;
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.round(pcm[i] * GAIN);
  }
  return pcm;
}

// PCM to base64
function pcmToBase64(pcm) {
  const buffer = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return buffer.toString('base64');
}

// Base64 to PCM - MUST copy to fresh ArrayBuffer for proper alignment
// (Node.js Buffers can have non-zero byteOffset due to pooling, which corrupts Int16Array)
function base64ToPcm(base64) {
  const buffer = Buffer.from(base64, 'base64');
  // Copy to fresh ArrayBuffer like voice mode client does
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  buffer.copy(view);
  return new Int16Array(arrayBuffer);
}

// ============ Call Handler ============

// ============ Audio Processing Classes ============

// High-pass filter: removes DC offset and sub-200Hz phone line hum.
// Single-pole IIR: y[n] = x[n] - x[n-1] + 0.95 * y[n-1]
// Cutoff ~130Hz at 8kHz sample rate. Costs almost nothing per sample.
class HighPassFilter {
  constructor() { this.prevIn = 0; this.prevOut = 0; }
  process(sample) {
    const out = sample - this.prevIn + 0.95 * this.prevOut;
    this.prevIn = sample;
    this.prevOut = out;
    return Math.round(out);
  }
}

// AGC (Automatic Gain Control): dynamically adjusts gain to target RMS level.
// - Fast attack (10ms): quickly reduces gain on loud bursts to prevent clipping
// - Slow release (300ms): gradually increases gain during quiet parts
// - Soft clipping above ±24000: preserves waveform shape vs hard clipping at ±32767
// - Max gain capped to prevent silence amplification
class SimpleAGC {
  constructor(targetRMS = 8000, maxGain = 20, sampleRate = 16000) {
    this.targetRMS = targetRMS;
    this.gain = 6.0; // Start at our known good gain level
    this.maxGain = maxGain;
    this.minGain = 0.5;
    this.attackCoeff = 1.0 - Math.exp(-1.0 / (0.01 * sampleRate));  // 10ms attack
    this.releaseCoeff = 1.0 - Math.exp(-1.0 / (0.3 * sampleRate));  // 300ms release
    this.envelope = 0;
  }

  process(pcm16k) {
    for (let i = 0; i < pcm16k.length; i++) {
      const abs = pcm16k[i] > 0 ? pcm16k[i] : -pcm16k[i];
      // Track signal envelope (fast attack, slow release)
      const coeff = abs > this.envelope ? this.attackCoeff : this.releaseCoeff;
      this.envelope += coeff * (abs - this.envelope);
      // Adjust gain toward target
      if (this.envelope > 10) {
        let desired = this.targetRMS / this.envelope;
        if (desired > this.maxGain) desired = this.maxGain;
        if (desired < this.minGain) desired = this.minGain;
        this.gain += 0.001 * (desired - this.gain);
      }
      // Apply gain
      let s = pcm16k[i] * this.gain;
      // Soft clip above ±24000 (compress excess to 10% instead of hard clipping)
      if (s > 24000) s = 24000 + (s - 24000) * 0.1;
      else if (s < -24000) s = -24000 + (s + 24000) * 0.1;
      pcm16k[i] = s > 32767 ? 32767 : s < -32768 ? -32768 : Math.round(s);
    }
    return pcm16k;
  }
}

// ============ Call Handler ============

class Call {
  constructor(callId, callerNumber, remoteRtpIp, remoteRtpPort, guestProfile) {
    this.callId = callId;
    this.callerNumber = callerNumber;
    this.remoteRtpIp = remoteRtpIp;
    this.remoteRtpPort = remoteRtpPort;
    this.guestProfile = guestProfile;
    this.state = 'starting';

    // RTP
    this.rtpSocket = null;
    this.localRtpPort = null;
    this.rtpSeq = Math.floor(Math.random() * 65535);
    // Start timestamp low so we have room for long calls without overflow
    this.rtpTimestamp = Math.floor(Math.random() * 1000000);
    this.ssrc = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0; // Ensure unsigned

    // RTP output queue for proper packet pacing
    // Each packet is 160 samples = 20ms at 8kHz
    this.rtpOutputQueue = [];
    this.rtpSendInterval = null;
    this.RTP_PACKET_INTERVAL_MS = 20; // 20ms per packet

    // WebSocket to server.js
    this.serverWs = null;
    this.serverReady = false;

    // Audio tracking
    this.firstRtpReceived = false;
    this.firstAudioFromServer = false;
    this.audioPacketsSent = 0;        // INPUT audio counter
    this.geminiAudioChunks = 0;        // OUTPUT audio counter

    // Silence detection for hangup — DISABLED
    // Silence is unreliable: can't distinguish "caller waiting for Sofia" from "caller hung up"
    // because phone keeps sending RTP with silence in both cases.
    // Instead, we rely on RTP timeout (no packets at all = definite hangup).
    this.consecutiveSilentPackets = 0;
    this.SILENCE_THRESHOLD = 50;       // PCM amplitude below this = silence
    this.SILENCE_PACKETS_FOR_HANGUP = 99999; // Effectively disabled — rely on RTP timeout instead
    this.hadSpeechAfterGreeting = false;   // Only detect after first user speech
    this.sofiaSpeakingMs = 0;              // Track continuous speaking duration for echo suppression
    this.toolCallActive = false;           // When true, pause silence detection (tool is running)

    // Audio processing pipeline (initialized per call)
    this.highPass = new HighPassFilter();  // DC offset + line hum removal
    this.agc = new SimpleAGC(8000, 20);   // Target RMS 8000, max gain 20x

    // Call recording: capture both audio streams at 16kHz for server-side WAV file
    this.recording = {
      callerChunks: [],  // Int16Array chunks at 16kHz (after gain+compression, before echo suppression)
      sofiaChunks: [],   // Int16Array chunks at 16kHz (from Gemini 24kHz, resampled)
      callerSamples: 0,
      sofiaSamples: 0,
      startTime: Date.now()
    };

    // RTP timeout detection — if no RTP packets arrive at all, caller hung up
    this.lastRtpTime = Date.now();
    this.RTP_TIMEOUT_MS = 5000; // 5 seconds without any RTP = definite hangup
    this.rtpTimeoutInterval = null;
  }

  async start() {
    // Allocate RTP port from pool
    this.localRtpPort = null;
    for (let port = RTP_PORT_START; port <= RTP_PORT_END; port++) {
      if (!allocatedPorts.has(port)) {
        this.localRtpPort = port;
        allocatedPorts.add(port);
        break;
      }
    }
    if (this.localRtpPort === null) {
      throw new Error('No RTP ports available');
    }

    // Create RTP socket
    this.rtpSocket = dgram.createSocket('udp4');
    this.rtpSocket.on('message', (msg, rinfo) => this.handleRtpPacket(msg, rinfo));
    this.rtpSocket.on('error', (err) => console.error(`[CALL ${this.callId}] RTP error:`, err.message));

    await new Promise((resolve, reject) => {
      this.rtpSocket.bind(this.localRtpPort, '0.0.0.0', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`[CALL ${this.callId}] RTP listening on port ${this.localRtpPort}`);

    // Build WebSocket URL with caller info + auth secret
    const params = new URLSearchParams({
      callId: this.callId,
      callerNumber: this.callerNumber,
      secret: WEBHOOK_SECRET
    });
    if (this.guestProfile) {
      if (this.guestProfile.guestName) params.set('guestName', this.guestProfile.guestName);
      if (this.guestProfile.hotelName) params.set('hotelName', this.guestProfile.hotelName);
      if (this.guestProfile.checkIn) params.set('checkIn', this.guestProfile.checkIn);
      if (this.guestProfile.checkOut) params.set('checkOut', this.guestProfile.checkOut);
      if (this.guestProfile.roomType) params.set('roomType', this.guestProfile.roomType);
    }

    const wsUrl = `${SERVER_WS_URL}?${params.toString()}`;
    console.log(`[CALL ${this.callId}] Connecting to server...`);

    // Connect to server.js /ws/phone
    this.serverWs = new WebSocket(wsUrl);

    this.serverWs.on('open', () => {
      console.log(`[CALL ${this.callId}] Connected to server`);
    });

    this.serverWs.on('message', (data) => this.handleServerMessage(data));

    this.serverWs.on('close', () => {
      console.log(`[CALL ${this.callId}] Server connection closed`);
      this.end('server_disconnect');
    });

    this.serverWs.on('error', (err) => {
      console.error(`[CALL ${this.callId}] Server error:`, err.message);
    });

    // Send comfort noise while waiting for setup
    this.sendComfortNoise();

    // Start call duration timeout
    this.callTimeout = setTimeout(() => {
      console.log(`[CALL ${this.callId}] Max call duration reached (${MAX_CALL_DURATION_MS / 60000} min)`);
      this.end('max_duration');
    }, MAX_CALL_DURATION_MS);

    this.state = 'active';

    // Start RTP timeout monitor — checks every 2s if RTP packets stopped arriving
    this.rtpTimeoutInterval = setInterval(() => {
      if (this.state !== 'active') return;
      const elapsed = Date.now() - this.lastRtpTime;
      if (this.hadSpeechAfterGreeting && elapsed > this.RTP_TIMEOUT_MS) {
        console.log(`[CALL ${this.callId}] No RTP packets for ${Math.round(elapsed / 1000)}s after speech — caller hung up`);
        this.end('rtp_timeout');
      }
    }, 2000);

    return { rtp_port: this.localRtpPort, rtp_ip: PUBLIC_IP };
  }

  sendComfortNoise() {
    // Send 5 packets of silence to establish RTP path
    const silencePacket = this.createRtpPacket(Buffer.alloc(160, 0xFF)); // 0xFF is μ-law silence
    console.log(`[CALL ${this.callId}] Sending comfort noise to ${this.remoteRtpIp}:${this.remoteRtpPort}`);
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (this.rtpSocket && this.state === 'active') {
          this.rtpSocket.send(silencePacket, this.remoteRtpPort, this.remoteRtpIp);
        }
      }, i * 20);
    }
  }

  createRtpPacket(payload) {
    const header = Buffer.alloc(12);
    header[0] = 0x80; // V=2, P=0, X=0, CC=0
    header[1] = 0x00; // M=0, PT=0 (PCMU)
    header.writeUInt16BE(this.rtpSeq++ & 0xFFFF, 2);
    // Use >>> 0 to ensure unsigned 32-bit integer
    header.writeUInt32BE(this.rtpTimestamp >>> 0, 4);
    this.rtpTimestamp = (this.rtpTimestamp + payload.length) >>> 0; // Keep as unsigned 32-bit
    header.writeUInt32BE(this.ssrc >>> 0, 8);
    return Buffer.concat([header, payload]);
  }

  handleRtpPacket(packet, rinfo) {
    if (packet.length < 12) return;

    // Extract RTP payload (skip 12-byte header)
    const payload = packet.slice(12);
    if (payload.length === 0) return;

    // Track last RTP packet time for timeout detection
    this.lastRtpTime = Date.now();

    // Update remote address if changed
    if (rinfo.address !== this.remoteRtpIp || rinfo.port !== this.remoteRtpPort) {
      this.remoteRtpIp = rinfo.address;
      this.remoteRtpPort = rinfo.port;
    }

    if (!this.firstRtpReceived) {
      console.log(`[CALL ${this.callId}] First RTP packet received (${payload.length} bytes)`);
      // Log first few μ-law bytes to debug audio
      const sample = payload.slice(0, 20);
      console.log(`[CALL ${this.callId}] First μ-law bytes: ${Array.from(sample).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      this.firstRtpReceived = true;
    }

    // Don't forward audio until server is ready
    if (!this.serverReady) return;

    // Decode G.711 μ-law to PCM
    const pcm8k = decodeUlawBuffer(payload);

    // High-pass filter at 8kHz: removes DC offset and phone line hum (<200Hz)
    // before resampling, so the upsampler doesn't spread low-freq noise into speech band
    for (let i = 0; i < pcm8k.length; i++) {
      pcm8k[i] = this.highPass.process(pcm8k[i]);
    }

    // Resample to 16kHz (Catmull-Rom cubic interpolation — preserves consonant frequencies)
    const pcm16k = resample8kTo16k(pcm8k);

    // Echo suppression BEFORE AGC — on raw signal levels so thresholds are gain-independent.
    // Messagenet raw audio: speech ±300-2000, echo ±50-400, line noise ±0-100.
    // - Below 100: always zero (line noise after high-pass filter)
    // - 100-500 while Sofia speaking: attenuate to 25% (echo from phone speaker)
    // - Above 500 or Sofia silent: pass through (real speech)
    const isSofiaSpeaking = this.rtpSendInterval !== null || this.rtpOutputQueue.length > 0;
    const rawMin = pcmMin(pcm16k);
    const rawMax = pcmMax(pcm16k);
    const rawPeak = Math.max(Math.abs(rawMin), Math.abs(rawMax));
    if (rawPeak <= 100) {
      pcm16k.fill(0);
    } else if (isSofiaSpeaking && rawPeak <= 500) {
      for (let i = 0; i < pcm16k.length; i++) {
        pcm16k[i] = Math.round(pcm16k[i] * 0.25);
      }
    }

    // Silence detection (on raw signal, before AGC)
    const isSilent = rawPeak <= this.SILENCE_THRESHOLD;

    if (!isSilent) {
      this.consecutiveSilentPackets = 0;
      if (this.audioPacketsSent > 50) { // After initial setup period
        this.hadSpeechAfterGreeting = true;
      }
    } else if (this.hadSpeechAfterGreeting && !this.toolCallActive) {
      // Only count silence when no tool call is running
      // During tool calls, Gemini goes silent while processing — this is normal
      this.consecutiveSilentPackets++;
      if (this.consecutiveSilentPackets === this.SILENCE_PACKETS_FOR_HANGUP) {
        console.log(`[CALL ${this.callId}] ${this.SILENCE_PACKETS_FOR_HANGUP * 20 / 1000}s of silence after speech — caller likely hung up`);
        this.end('silence_hangup');
        return;
      }
    }

    // AGC: dynamically boosts quiet Messagenet audio (~±500 peak) to Gemini's expected
    // range (~±8000 RMS). Auto-adjusts gain per sample — loud speech gets compressed
    // instead of hard-clipped, quiet speech gets amplified more.
    this.agc.process(pcm16k);

    // Record caller audio (after gain+compression, before sending to Gemini)
    if (this.recording) {
      this.recording.callerChunks.push(new Int16Array(pcm16k));
      this.recording.callerSamples += pcm16k.length;
    }

    // Send immediately without buffering (matches browser voice mode pattern)
    // Each RTP packet is ~20ms of audio (160 samples @ 8kHz = 320 samples @ 16kHz)
    const base64Audio = pcmToBase64(pcm16k);

    if (this.serverWs?.readyState === WebSocket.OPEN) {
      this.audioPacketsSent++;
      // Log first few packets with details for debugging
      if (this.audioPacketsSent <= 10) {
        const minSample = pcmMin(pcm16k);
        const maxSample = pcmMax(pcm16k);
        const ulawSample = payload.slice(0, 10);
        const ulawHex = Array.from(ulawSample).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`[CALL ${this.callId}] Audio #${this.audioPacketsSent}: raw ${rawMin}..${rawMax} → agc ${minSample}..${maxSample} (gain=${this.agc.gain.toFixed(1)}), μ-law: ${ulawHex}`);
      } else if (this.audioPacketsSent % 100 === 0) {
        const minSample = pcmMin(pcm16k);
        const maxSample = pcmMax(pcm16k);
        console.log(`[CALL ${this.callId}] Audio #${this.audioPacketsSent}: raw ${rawMin}..${rawMax} → agc ${minSample}..${maxSample} (gain=${this.agc.gain.toFixed(1)})`);
      }

      this.serverWs.send(JSON.stringify({
        type: 'audio',
        content: base64Audio
      }));
    }
  }

  handleServerMessage(data) {
    try {
      const msg = JSON.parse(data.toString());

      // Server ready (Gemini setup complete)
      if (msg.type === 'ready') {
        console.log(`[CALL ${this.callId}] Server ready - Gemini connected`);
        this.serverReady = true;
        return;
      }

      // Tool call status from server — pause/resume silence detection
      if (msg.type === 'tool_active') {
        this.toolCallActive = msg.active;
        if (msg.active) {
          console.log(`[CALL ${this.callId}] Tool call active — pausing silence detection`);
          this.consecutiveSilentPackets = 0; // Reset counter
        } else {
          console.log(`[CALL ${this.callId}] Tool call done — resuming silence detection`);
          this.consecutiveSilentPackets = 0; // Reset counter
        }
        return;
      }

      // Audio from Gemini (via server)
      if (msg.type === 'audio' && msg.data) {
        // NOTE: Do NOT reset silence counter here. If the caller hung up,
        // Gemini may keep responding to line noise. The silence counter must
        // only track caller-side silence (in handleRtpPacket).

        // Decode base64 PCM (Gemini sends 24kHz by default)
        const pcm24k = base64ToPcm(msg.data);

        if (!this.firstAudioFromServer) {
          // Detailed diagnostic for first audio chunk
          const sampleSlice = pcm24k.slice(0, Math.min(1000, pcm24k.length));
          const min24 = pcmMin(sampleSlice);
          const max24 = pcmMax(sampleSlice);
          // Show first 10 actual PCM sample values to verify they look like audio
          const first10 = Array.from(pcm24k.slice(0, 10)).join(', ');
          console.log(`[CALL ${this.callId}] First audio from Gemini:`);
          console.log(`  - base64 length: ${msg.data.length} chars`);
          console.log(`  - decoded PCM: ${pcm24k.length} samples @ 24kHz`);
          console.log(`  - PCM range: ${min24}..${max24} (expect speech ~±5000 to ±20000)`);
          console.log(`  - First 10 samples: ${first10}`);
          this.firstAudioFromServer = true;
        }

        // Record Sofia audio at 16kHz (high quality, before lossy G.711 encoding)
        if (this.recording) {
          const pcm16kRec = resample24kTo16k(pcm24k);
          this.recording.sofiaChunks.push(pcm16kRec);
          this.recording.sofiaSamples += pcm16kRec.length;
        }

        // Resample 24kHz to 8kHz (3:1 ratio for phone) with anti-aliasing
        const pcm8k = resample24kTo8k(pcm24k);

        // Reduce volume to prevent near-clipping screeching
        attenuateOutput(pcm8k);

        // Encode to G.711 μ-law
        const ulaw = encodeUlawBuffer(pcm8k);

        // Log output audio diagnostics
        this.geminiAudioChunks++;
        if (this.geminiAudioChunks <= 3) {
          const min8 = pcmMin(pcm8k);
          const max8 = pcmMax(pcm8k);
          const ulawSample = Array.from(ulaw.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`[CALL ${this.callId}] Gemini OUT #${this.geminiAudioChunks}:`);
          console.log(`  - 24kHz samples: ${pcm24k.length} → 8kHz samples: ${pcm8k.length}`);
          console.log(`  - 8kHz PCM range: ${min8}..${max8}`);
          console.log(`  - μ-law (first 20): ${ulawSample}`);
          console.log(`  - RTP packets to send: ${Math.ceil(ulaw.length / 160)}`);
        }

        // Queue RTP packets for paced sending (160 bytes = 20ms per packet)
        // This prevents audio burst that causes distortion on the phone
        for (let i = 0; i < ulaw.length; i += 160) {
          const chunk = ulaw.slice(i, Math.min(i + 160, ulaw.length));
          if (chunk.length > 0) {
            this.rtpOutputQueue.push(chunk);
          }
        }

        if (this.geminiAudioChunks <= 3) {
          console.log(`  - Queued ${Math.ceil(ulaw.length / 160)} RTP packets (queue size: ${this.rtpOutputQueue.length})`);
        }

        // Start the paced sender if not already running
        this.startRtpSender();
      }

      // User transcript
      if (msg.type === 'user_transcript' && msg.text) {
        console.log(`[CALL ${this.callId}] User: ${msg.text.substring(0, 80)}...`);
      }

      // Interruption — guest spoke over Sofia, flush queued audio and fade out
      if (msg.type === 'interrupted') {
        const flushed = this.rtpOutputQueue.length;
        this.stopRtpSender();
        // Send 3 fade-out packets (60ms) to avoid the pop/click from abrupt silence.
        // Phone speakers produce an audible artifact when audio jumps from speech to zero.
        const fadeSteps = 3;
        for (let i = 0; i < fadeSteps; i++) {
          const gain = (fadeSteps - 1 - i) / fadeSteps; // 0.66, 0.33, 0.0
          const packet = Buffer.alloc(160);
          // Fill with near-silence μ-law (0xFF = true silence, 0x7F = tiny negative)
          // Alternate for a soft fade rather than hard cut
          packet.fill(gain > 0.3 ? 0x7F : 0xFF);
          if (this.rtpSocket && this.state === 'active') {
            const rtpPacket = this.createRtpPacket(packet);
            this.rtpSocket.send(rtpPacket, this.remoteRtpPort, this.remoteRtpIp);
          }
        }
        console.log(`[CALL ${this.callId}] Interrupted — flushed ${flushed} queued RTP packets + 3 fade-out`);
      }

      // Turn complete
      if (msg.type === 'turn_complete') {
        // Could trigger any end-of-turn behavior
      }

    } catch (err) {
      console.error(`[CALL ${this.callId}] Server message error:`, err);
    }
  }

  // Start the paced RTP sender (sends one packet every 20ms)
  startRtpSender() {
    if (this.rtpSendInterval) return; // Already running

    this.rtpSendInterval = setInterval(() => {
      if (this.rtpOutputQueue.length === 0) {
        // Queue empty, stop the interval to save CPU
        clearInterval(this.rtpSendInterval);
        this.rtpSendInterval = null;
        return;
      }

      const chunk = this.rtpOutputQueue.shift();
      if (chunk && this.rtpSocket && this.state === 'active') {
        const rtpPacket = this.createRtpPacket(chunk);
        this.rtpSocket.send(rtpPacket, this.remoteRtpPort, this.remoteRtpIp);
      }
    }, this.RTP_PACKET_INTERVAL_MS);
  }

  // Stop the paced RTP sender and clear queue (e.g., on interruption)
  stopRtpSender() {
    if (this.rtpSendInterval) {
      clearInterval(this.rtpSendInterval);
      this.rtpSendInterval = null;
    }
    this.rtpOutputQueue = [];
  }

  saveRecording() {
    if (!this.recording || (this.recording.callerSamples === 0 && this.recording.sofiaSamples === 0)) {
      console.log(`[CALL ${this.callId}] No audio to record`);
      return;
    }

    try {
      const sampleRate = 16000;
      const totalSamples = Math.max(this.recording.callerSamples, this.recording.sofiaSamples);
      const duration = (totalSamples / sampleRate).toFixed(1);

      // Concatenate caller chunks into one buffer, pad to totalSamples
      const caller = new Int16Array(totalSamples);
      let offset = 0;
      for (const chunk of this.recording.callerChunks) {
        caller.set(chunk, offset);
        offset += chunk.length;
      }

      // Concatenate Sofia chunks
      const sofia = new Int16Array(totalSamples);
      offset = 0;
      for (const chunk of this.recording.sofiaChunks) {
        sofia.set(chunk, offset);
        offset += chunk.length;
      }

      // Interleave into stereo (left = caller, right = Sofia)
      const stereo = new Int16Array(totalSamples * 2);
      for (let i = 0; i < totalSamples; i++) {
        stereo[i * 2] = caller[i];
        stereo[i * 2 + 1] = sofia[i];
      }

      const wavBuffer = createWavBuffer(stereo, sampleRate, 2, 16);

      // Save to sofia_data/phone_recordings/
      const recDir = path.join(__dirname, 'sofia_data', 'phone_recordings');
      fs.mkdirSync(recDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeCallId = this.callId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
      const filename = `${timestamp}_${safeCallId}.wav`;
      fs.writeFileSync(path.join(recDir, filename), wavBuffer);

      const sizeMB = (wavBuffer.length / 1024 / 1024).toFixed(1);
      console.log(`[CALL ${this.callId}] Recording saved: ${filename} (${duration}s, ${sizeMB}MB)`);

      // Free memory
      this.recording = null;
    } catch (err) {
      console.error(`[CALL ${this.callId}] Recording save error:`, err.message);
    }
  }

  end(reason = 'unknown') {
    if (this.state === 'ended') return;
    this.state = 'ended';

    console.log(`[CALL ${this.callId}] Ending call: ${reason}`);

    // Save call recording before cleanup
    this.saveRecording();

    // Clear call duration timeout
    if (this.callTimeout) {
      clearTimeout(this.callTimeout);
      this.callTimeout = null;
    }

    // Clear RTP timeout monitor
    if (this.rtpTimeoutInterval) {
      clearInterval(this.rtpTimeoutInterval);
      this.rtpTimeoutInterval = null;
    }

    // Release RTP port back to pool
    if (this.localRtpPort !== null) {
      allocatedPorts.delete(this.localRtpPort);
    }

    // Stop paced RTP sender
    this.stopRtpSender();

    if (this.rtpSocket) {
      try { this.rtpSocket.close(); } catch (e) {}
      this.rtpSocket = null;
    }

    if (this.serverWs) {
      try { this.serverWs.close(); } catch (e) {}
      this.serverWs = null;
    }

    activeCalls.delete(this.callId);
  }
}

// ============ HTTP API ============

const httpServer = http.createServer(async (req, res) => {
  // CORS and auth
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Verify webhook secret
  const secret = req.headers['x-webhook-secret'];
  if (secret !== WEBHOOK_SECRET) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Parse body
  let body = '';
  for await (const chunk of req) body += chunk;
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // POST /call/start - Start a new call
  if (req.method === 'POST' && url.pathname === '/call/start') {
    const { call_id, caller_number, remote_rtp_ip, remote_rtp_port, guest_profile } = data;

    console.log(`[HTTP] Start call ${call_id} from ${caller_number}`);

    if (activeCalls.has(call_id)) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Call already exists' }));
      return;
    }

    if (activeCalls.size >= MAX_CONCURRENT_CALLS) {
      console.log(`[HTTP] Rejecting call ${call_id}: at concurrent limit (${MAX_CONCURRENT_CALLS})`);
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Max concurrent calls reached' }));
      return;
    }

    try {
      const call = new Call(call_id, caller_number, remote_rtp_ip, remote_rtp_port, guest_profile);
      activeCalls.set(call_id, call);

      const result = await call.start();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error(`[HTTP] Failed to start call:`, err);
      activeCalls.delete(call_id);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /call/end - End a call
  if (req.method === 'POST' && url.pathname === '/call/end') {
    const { call_id, reason } = data;

    console.log(`[HTTP] End call ${call_id}: ${reason}`);

    const call = activeCalls.get(call_id);
    if (call) {
      call.end(reason);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`[SIP-BRIDGE] HTTP server listening on 127.0.0.1:${HTTP_PORT}`);
  console.log(`[SIP-BRIDGE] Ready to receive calls`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[SIP-BRIDGE] Shutting down...');
  for (const [callId, call] of activeCalls) {
    call.end('shutdown');
  }
  httpServer.close();
  process.exit(0);
});
process.on('SIGTERM', () => process.emit('SIGINT'));
