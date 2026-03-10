import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createBlob, decode, decodeAudioData } from './orb/utils';
import './orb/visual-canvas';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, X, Gauge, SwitchCamera, MapPin, Thermometer, Coffee, Lock, Wifi, Droplets, Tv, Eye, Snowflake, Clock, Church, Sun, Moon, KeyRound, Info, AlertTriangle, Star, Phone, ChevronDown } from 'lucide-react';

/// <reference types="vite/client" />

interface VoiceWidgetProps {
    isOpen: boolean;
    onClose: () => void;
    onMessage: (userText: string, sofiaText: string, toolVisuals?: any[]) => void;
    onLiveTranscript?: (sender: 'user' | 'bot', text: string) => void;
    userLocation?: { lat: number; lng: number };
    autoStartCamera?: boolean;
}

export interface VoiceWidgetRef {
    sendText: (text: string) => void;
}

const VoiceWidget = forwardRef<VoiceWidgetRef, VoiceWidgetProps>(({ isOpen, onClose, onMessage, onLiveTranscript, userLocation, autoStartCamera }, ref) => {
    const [status, setStatus] = useState<string>('Connecting...');
    const [error, setError] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isStarted, setIsStarted] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [videoMode, setVideoMode] = useState<'off' | 'camera' | 'screen'>('off');
    const [showVideoMenu, setShowVideoMenu] = useState(false);
    const [speechSpeed, setSpeechSpeed] = useState<'normal' | 'slow' | 'fast'>('normal');
    const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
    const [needsGesture, setNeedsGesture] = useState(false);

    // Visual assist floating cards
    type VisualAssistCard = {
        id: number;
        type: 'steps' | 'buttons' | 'info';
        title: string;
        items: Array<{ icon: string; text: string; detail?: string | null; action?: string | null }>;
        auto_dismiss: number;
        visible: boolean;
    };
    const [assistCards, setAssistCards] = useState<VisualAssistCard[]>([]);
    const assistIdRef = useRef(0);

    const ICON_MAP: Record<string, any> = {
        snowflake: Snowflake, wifi: Wifi, lock: Lock, tv: Tv, phone: Phone,
        map: MapPin, clock: Clock, church: Church, coffee: Coffee, sun: Sun,
        moon: Moon, key: KeyRound, info: Info, warning: AlertTriangle, star: Star,
    };

    // Visual identification state — multiple live AR tags
    type IdentMarker = { label: string; x: number; y: number; step: number | null };
    type IdentTag = {
        id: string;
        object_type: string;
        object_name: string;
        brand_model?: string | null;
        location_context?: string | null;
        description: string;
        actions: Array<{ label: string; instruction: string }>;
        markers: IdentMarker[];
        position_x: number;
        position_y: number;
        _originalX: number;
        _originalY: number;
        _motionBaseX: number;
        _motionBaseY: number;
        timestamp: number;
    };
    const [liveTags, setLiveTags] = useState<IdentTag[]>([]);
    const [expandedTag, setExpandedTag] = useState<string | null>(null); // tag id for expanded detail view
    const [expandedAction, setExpandedAction] = useState<number | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const tagTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const videoModeRef = useRef(videoMode);
    videoModeRef.current = videoMode; // keep ref in sync for ws.onmessage closure

    // Gyroscope-based AR tracking — DeviceMotion accumulates rotation, tags follow
    const motionAccumRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
    const trackingRafRef = useRef<number | null>(null);
    const cameraFacingRef = useRef(cameraFacing);
    cameraFacingRef.current = cameraFacing;

    // Auto-reconnect tracking
    const reconnectAttemptsRef = useRef(0);
    const MAX_RECONNECT_ATTEMPTS = 2;
    const isClosingRef = useRef(false); // user-initiated close

    // Per-turn accumulators
    const pendingUserTextRef = useRef<string>('');
    const pendingSofiaTextRef = useRef<string>('');
    const pendingToolsRef = useRef<any[]>([]);

    // Audio Contexts
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);

    // WebSocket
    const wsRef = useRef<WebSocket | null>(null);

    // Audio processing refs
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const isMutedRef = useRef(false);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const scriptProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);

    // Video refs
    const videoStreamRef = useRef<MediaStream | null>(null);
    const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoElementRef = useRef<HTMLVideoElement | null>(null);
    const previewVideoRef = useRef<HTMLVideoElement | null>(null);
    const videoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // iOS screen recording: route audio through <audio> element so it's captured
    const iosAudioElRef = useRef<HTMLAudioElement | null>(null);

    // DeviceMotion listener — accumulate gyroscope rotation for AR tracking
    useEffect(() => {
        if (videoMode !== 'camera') {
            motionAccumRef.current = { dx: 0, dy: 0 };
            return;
        }

        const handler = (e: DeviceMotionEvent) => {
            const rate = e.rotationRate;
            if (!rate || rate.gamma === null || rate.beta === null) return;
            const dt = (e.interval || 16) / 1000;
            motionAccumRef.current.dx += rate.gamma! * dt; // horizontal pan (L/R)
            motionAccumRef.current.dy += rate.beta! * dt;  // vertical tilt (U/D)
        };

        // iOS 13+ requires explicit permission (must be in user gesture context)
        // Permission is requested in startVideoCapture; here we just attach the listener
        window.addEventListener('devicemotion', handler);
        return () => window.removeEventListener('devicemotion', handler);
    }, [videoMode]);

    // rAF tracking loop — apply accumulated gyroscope rotation to tag positions
    useEffect(() => {
        if (videoMode !== 'camera' || liveTags.length === 0) {
            if (trackingRafRef.current) {
                cancelAnimationFrame(trackingRafRef.current);
                trackingRafRef.current = null;
            }
            return;
        }

        // Scaling: ~2% of screen per degree of rotation (matches ~50° horizontal FOV)
        const SCALE = 2.0;

        const trackFrame = () => {
            trackingRafRef.current = requestAnimationFrame(trackFrame);

            const { dx, dy } = motionAccumRef.current;

            setLiveTags(prev => {
                let changed = false;
                const updated = prev.map(tag => {
                    // Delta rotation since this tag was anchored
                    const motionDx = dx - tag._motionBaseX;
                    const motionDy = dy - tag._motionBaseY;

                    // Skip if negligible motion
                    if (Math.abs(motionDx) < 0.05 && Math.abs(motionDy) < 0.05) return tag;

                    // Front camera video is mirrored → invert horizontal tracking
                    const hSign = cameraFacingRef.current === 'user' ? 1 : -1;

                    const newX = tag._originalX + motionDx * SCALE * hSign;
                    const newY = tag._originalY - motionDy * SCALE;

                    // Clamp with margin (tags can go slightly off-screen)
                    const clampedX = Math.max(-15, Math.min(115, newX));
                    const clampedY = Math.max(-15, Math.min(115, newY));

                    if (Math.abs(clampedX - tag.position_x) > 0.15 || Math.abs(clampedY - tag.position_y) > 0.15) {
                        changed = true;
                        return { ...tag, position_x: clampedX, position_y: clampedY };
                    }
                    return tag;
                });
                return changed ? updated : prev;
            });
        };

        trackingRafRef.current = requestAnimationFrame(trackFrame);
        return () => {
            if (trackingRafRef.current) {
                cancelAnimationFrame(trackingRafRef.current);
                trackingRafRef.current = null;
            }
        };
    }, [videoMode, liveTags.length > 0]);

    // Stable ref for the orb custom element — never recreated
    const orbRef = useRef<any>(null);

    // Update orb audio nodes when they become available
    useEffect(() => {
        if (orbRef.current) {
            if (sourceNodeRef.current) orbRef.current.inputNode = sourceNodeRef.current;
            if (outputNodeRef.current) orbRef.current.outputNode = outputNodeRef.current;
        }
    }, [isRecording]); // isRecording flips after startRecording creates the source node

    // Assign video stream to preview element AFTER React re-renders the video element
    useEffect(() => {
        if (videoMode !== 'off' && previewVideoRef.current && videoStreamRef.current) {
            previewVideoRef.current.srcObject = videoStreamRef.current;
            previewVideoRef.current.play().catch(() => {});
        }
    }, [videoMode]);

    const initConnection = useCallback(async () => {
        try {
            isClosingRef.current = false;
            setError('');
            setStatus('Connecting...');
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

            if (!inputAudioContextRef.current) {
                inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
            }

            if (!outputAudioContextRef.current) {
                outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
                outputNodeRef.current = outputAudioContextRef.current.createGain();

                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                if (isIOS) {
                    // iOS: route through <audio> element so screen recording captures Sofia's voice.
                    // AudioContext.destination audio is NOT captured by iOS screen recording,
                    // but <audio> element playback IS. Do NOT connect to both — causes double audio.
                    const dest = outputAudioContextRef.current.createMediaStreamDestination();
                    outputNodeRef.current.connect(dest);
                    const audioEl = new Audio();
                    audioEl.srcObject = dest.stream;
                    audioEl.play().catch(() => {});
                    iosAudioElRef.current = audioEl;
                } else {
                    outputNodeRef.current.connect(outputAudioContextRef.current.destination);
                }

                nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
            }

            // Safari: resume() is a no-op outside user gesture — AudioContext stays suspended.
            // Use a 2s race so we don't hang forever, and also check state after resolve.
            const resumeWithTimeout = (ctx: AudioContext) =>
                Promise.race([
                    ctx.resume().then(() => {
                        if (ctx.state !== 'running') throw new Error('suspended');
                    }),
                    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('suspended')), 2000)),
                ]);

            try {
                await resumeWithTimeout(inputAudioContextRef.current);
                await resumeWithTimeout(outputAudioContextRef.current);
            } catch {
                // AudioContext stayed suspended (Safari without user gesture) — show tap overlay
                setNeedsGesture(true);
                setStatus('Tap to start');
                return;
            }

            // Request mic IMMEDIATELY in the user gesture chain — before any async fetch.
            // Mobile browsers require getUserMedia within a user activation context.
            // getUserMedia also acts as a user activation, keeping AudioContext.resume() valid.
            if (!mediaStreamRef.current) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStreamRef.current = stream;
            }

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Pass text chat sessionId so voice mode can access conversation history
            let textSessionId = sessionStorage.getItem('ognissanti_session_id') || '';

            // Ensure session exists on server (may have been lost after restart)
            if (!textSessionId) {
              textSessionId = crypto.randomUUID();
              sessionStorage.setItem('ognissanti_session_id', textSessionId);
            }

            // Request a one-time voice WebSocket token (requires valid chat session)
            let tokenResp = await fetch('/api/voice-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: textSessionId }),
            });

            // If session is stale (server restarted), establish it with a ping then retry
            if (tokenResp.status === 403) {
              await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: '', sessionId: textSessionId, voiceInit: true }),
              }).catch(() => {});
              tokenResp = await fetch('/api/voice-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: textSessionId }),
              });
            }
            if (!tokenResp.ok) throw new Error('Failed to get voice token');
            const { voiceToken } = await tokenResp.json();
            const wsUrl = `${protocol}//${window.location.host}/ws/voice?sessionId=${encodeURIComponent(textSessionId)}&token=${encodeURIComponent(voiceToken)}`;

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            // Pre-acquire camera stream in parallel with WebSocket handshake (no waiting)
            let preAcquiredCameraStream: MediaStream | null = null;
            if (autoStartCamera) {
                navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } })
                    .then(s => { preAcquiredCameraStream = s; })
                    .catch(() => {}); // camera optional — ignore errors
            }

            ws.onopen = () => {
                setStatus('Listening...');
                reconnectAttemptsRef.current = 0;
                startRecording();
                // Send location if available
                if (userLocation) {
                    ws.send(JSON.stringify({ type: 'location', lat: userLocation.lat, lng: userLocation.lng }));
                }
                // Auto-start camera — use pre-acquired stream or start fresh
                if (autoStartCamera) {
                    if (preAcquiredCameraStream) {
                        applyVideoStream(preAcquiredCameraStream, 'camera');
                    } else {
                        // Stream not ready yet — wait briefly then check or fall back
                        setTimeout(() => {
                            if (preAcquiredCameraStream) {
                                applyVideoStream(preAcquiredCameraStream, 'camera');
                            } else {
                                startVideoCapture('camera');
                            }
                        }, 200);
                    }
                }
            };

            ws.onmessage = async (event) => {
                const msg = JSON.parse(event.data);

                if (msg.type === 'user_transcript') {
                    // Don't stop audio here — mic echo would kill Sofia's voice.
                    // Barge-in is handled by the server-side 'interrupted' message instead.
                    // Server sends accumulated buffer with replace:true to avoid word-splitting
                    if (msg.replace) {
                        pendingUserTextRef.current = msg.text;
                    } else {
                        pendingUserTextRef.current += (pendingUserTextRef.current ? ' ' : '') + msg.text;
                    }
                    // Live: show user's words in chat immediately
                    if (onLiveTranscript) onLiveTranscript('user', pendingUserTextRef.current);
                    // Scanning animation when camera is active and user speaks
                    if (videoModeRef.current === 'camera') setIsScanning(true);
                } else if (msg.type === 'response') {
                    setIsScanning(false);
                    if (msg.text) {
                        const cleanText = msg.text.replace(/\[suggestions?:.*$/gim, '').trim();
                        if (cleanText) {
                            pendingSofiaTextRef.current += (pendingSofiaTextRef.current ? ' ' : '') + cleanText;
                            // Live: stream Sofia's words into chat as they arrive
                            if (onLiveTranscript) onLiveTranscript('bot', pendingSofiaTextRef.current);
                        }
                    }
                    if (msg.audio && outputAudioContextRef.current && outputNodeRef.current) {
                        const ctx = outputAudioContextRef.current;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                        try {
                            const audioData = decode(msg.audio);
                            const audioBuffer = await decodeAudioData(audioData, ctx, 24000, 1);
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputNodeRef.current);
                            source.onended = () => sourcesRef.current.delete(source);
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        } catch (err) { console.error("Audio Decode Error:", err); }
                    }
                } else if (msg.type === 'interrupted') {
                    // Barge-in: user started speaking — stop all queued Sofia audio immediately
                    for (const src of sourcesRef.current) {
                        try { src.stop(); } catch (_) {}
                    }
                    sourcesRef.current.clear();
                    if (outputAudioContextRef.current) {
                        nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
                    }
                } else if (msg.type === 'tool_result') {
                    // Check for visual_assist attachments
                    const vaAttach = (msg.attachments || []).find((a: any) => a.type === 'visual_assist');
                    if (vaAttach?.payload) {
                        const cardId = ++assistIdRef.current;
                        const card: VisualAssistCard = { id: cardId, visible: true, ...vaAttach.payload };
                        setAssistCards(prev => [...prev.slice(-2), card]);
                        setTimeout(() => {
                            setAssistCards(prev => prev.map(c => c.id === cardId ? { ...c, visible: false } : c));
                            setTimeout(() => setAssistCards(prev => prev.filter(c => c.id !== cardId)), 400);
                        }, (card.auto_dismiss || 12) * 1000);
                    }
                    pendingToolsRef.current.push({
                        name: msg.name,
                        result: msg.result,
                        attachments: msg.attachments || []
                    });
                    // Visual identification — add/update live AR tag
                    if (msg.name === 'visual_identification' && msg.attachments?.length > 0) {
                        const vi = msg.attachments.find((a: any) => a.type === 'visual_identification');
                        if (vi?.payload) {
                            const p = vi.payload;
                            const tagId = (p.object_name || 'unknown').toLowerCase().replace(/\s+/g, '_');
                            const newTag: IdentTag = {
                                id: tagId,
                                object_type: p.object_type,
                                object_name: p.object_name,
                                brand_model: p.brand_model,
                                location_context: p.location_context,
                                description: p.description,
                                actions: p.actions || [],
                                markers: p.markers || [],
                                position_x: p.position_x ?? 50,
                                position_y: p.position_y ?? 50,
                                _originalX: p.position_x ?? 50,
                                _originalY: p.position_y ?? 50,
                                _motionBaseX: motionAccumRef.current.dx,
                                _motionBaseY: motionAccumRef.current.dy,
                                timestamp: Date.now(),
                            };
                            setLiveTags(prev => {
                                // Update existing tag position or add new one (max 6 visible)
                                const existing = prev.findIndex(t => t.id === tagId);
                                if (existing >= 0) {
                                    const updated = [...prev];
                                    updated[existing] = newTag;
                                    return updated;
                                }
                                return [...prev.slice(-5), newTag]; // keep max 6
                            });
                            // Auto-remove tag after 15s if not refreshed
                            const prevTimer = tagTimersRef.current.get(tagId);
                            if (prevTimer) clearTimeout(prevTimer);
                            tagTimersRef.current.set(tagId, setTimeout(() => {
                                setLiveTags(prev => prev.filter(t => t.id !== tagId));
                                tagTimersRef.current.delete(tagId);
                            }, 15000));
                        }
                    }
                    setIsScanning(false);
                } else if (msg.type === 'position_update') {
                    // Server-side refined positions from Gemini Flash vision API
                    // Re-anchor gyroscope baseline so tracking continues from refined position
                    const motionSnapshot = { ...motionAccumRef.current };
                    setLiveTags(prev => prev.map(tag => {
                        if (tag.id !== msg.tagId) return tag;
                        const updated: IdentTag = {
                            ...tag,
                            position_x: msg.position_x,
                            position_y: msg.position_y,
                            _originalX: msg.position_x,
                            _originalY: msg.position_y,
                            _motionBaseX: motionSnapshot.dx,
                            _motionBaseY: motionSnapshot.dy,
                        };
                        if (msg.markers?.length > 0) {
                            updated.markers = tag.markers.map((m: IdentMarker, i: number) => ({
                                ...m,
                                x: msg.markers[i]?.x ?? m.x,
                                y: msg.markers[i]?.y ?? m.y,
                            }));
                        }
                        return updated;
                    }));
                } else if (msg.type === 'turnComplete') {
                    const userText = pendingUserTextRef.current;
                    const sofiaText = pendingSofiaTextRef.current;
                    const tools = pendingToolsRef.current.length > 0 ? [...pendingToolsRef.current] : undefined;

                    pendingUserTextRef.current = '';
                    pendingSofiaTextRef.current = '';
                    pendingToolsRef.current = [];

                    if (userText || sofiaText || tools) {
                        onMessage(userText, sofiaText, tools);
                    }
                } else if (msg.type === 'status') {
                    setStatus(msg.message);
                    // Re-send location now that Gemini setup is complete (onopen send gets dropped)
                    if (msg.message === 'ready' && userLocation) {
                        ws.send(JSON.stringify({ type: 'location', lat: userLocation.lat, lng: userLocation.lng }));
                    }
                } else if (msg.type === 'error') {
                    setError(msg.message);
                }
            };

            ws.onerror = () => setError("Connection Error");
            ws.onclose = (event) => {
                stopRecording();
                // Auto-reconnect on unexpected close (Gemini crash = code 1011, etc.)
                if (!isClosingRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttemptsRef.current++;
                    setStatus('Reconnecting...');
                    setError(null);
                    setTimeout(() => {
                        if (isOpen && !isClosingRef.current) initConnection();
                    }, 1500);
                } else if (isClosingRef.current) {
                    setStatus("Disconnected");
                } else {
                    setError("Connection lost. Tap Retry to reconnect.");
                }
            };
            setIsStarted(true);
        } catch (e: any) {
            setError(e.message === 'Permission denied' ? 'Microphone access denied. Please allow it in browser settings and try again.' : e.message);
        }
    }, [onMessage]);

    const startRecording = useCallback(async () => {
        if (!inputAudioContextRef.current || !wsRef.current || !mediaStreamRef.current) return;
        try {
            setIsRecording(true);

            const ctx = inputAudioContextRef.current;
            // Ensure AudioContext is running (mobile may have suspended it)
            if (ctx.state === 'suspended') await ctx.resume();
            if (outputAudioContextRef.current?.state === 'suspended') await outputAudioContextRef.current.resume();

            const source = ctx.createMediaStreamSource(mediaStreamRef.current);
            sourceNodeRef.current = source;
            const processor = ctx.createScriptProcessor(512, 1, 1);
            scriptProcessorNodeRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState === WebSocket.OPEN && !isMutedRef.current) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const blob = createBlob(inputData);
                    wsRef.current.send(JSON.stringify({ type: 'audio', content: blob.data }));
                }
            };
            source.connect(processor);
            processor.connect(ctx.destination);
        } catch (e: any) {
            setError(e.message === 'Permission denied' ? 'Microphone access denied. Please allow it in browser settings and try again.' : e.message);
            stopRecording();
        }
    }, []);

    const stopRecording = useCallback(() => {
        setIsRecording(false);
        if (scriptProcessorNodeRef.current) {
            scriptProcessorNodeRef.current.disconnect();
            scriptProcessorNodeRef.current = null;
        }
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop());
            mediaStreamRef.current = null;
        }
    }, []);

    // Video capture functions (must be defined before cleanup)
    const stopVideoCapture = useCallback(() => {
        if (videoIntervalRef.current) {
            clearInterval(videoIntervalRef.current);
            videoIntervalRef.current = null;
        }
        if (videoStreamRef.current) {
            videoStreamRef.current.getTracks().forEach(t => t.stop());
            videoStreamRef.current = null;
        }
        if (videoElementRef.current) {
            videoElementRef.current.srcObject = null;
        }
        if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = null;
        }
        // Clear motion tracking
        motionAccumRef.current = { dx: 0, dy: 0 };
        if (trackingRafRef.current) {
            cancelAnimationFrame(trackingRafRef.current);
            trackingRafRef.current = null;
        }
        // Notify server that camera stopped (for location context awareness)
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'video_stop' }));
        }
        setVideoMode('off');
    }, []);

    const cleanup = useCallback(() => {
        isClosingRef.current = true; // prevent auto-reconnect
        stopRecording();
        stopVideoCapture();
        setIsStarted(false);
        setNeedsGesture(false);
        setLiveTags([]);
        setExpandedTag(null);
        setIsScanning(false);
        setExpandedAction(null);
        tagTimersRef.current.forEach(t => clearTimeout(t));
        tagTimersRef.current.clear();
        if (wsRef.current) wsRef.current.close();
        if (inputAudioContextRef.current) inputAudioContextRef.current.close().catch(() => { });
        if (outputAudioContextRef.current) outputAudioContextRef.current.close().catch(() => { });
        inputAudioContextRef.current = null;
        outputAudioContextRef.current = null;
        // Cleanup iOS audio element
        if (iosAudioElRef.current) {
            iosAudioElRef.current.pause();
            iosAudioElRef.current.srcObject = null;
            iosAudioElRef.current = null;
        }
        // Cleanup motion tracking
        motionAccumRef.current = { dx: 0, dy: 0 };
        if (trackingRafRef.current) {
            cancelAnimationFrame(trackingRafRef.current);
            trackingRafRef.current = null;
        }
    }, [stopRecording, stopVideoCapture]);

    useEffect(() => {
        if (!isOpen) cleanup();
        return () => cleanup();
    }, [isOpen, cleanup]);

    // Auto-connect when opened
    useEffect(() => {
        if (isOpen && !isStarted && !error) {
            initConnection();
        }
    }, [isOpen]);

    // Send location updates to server when userLocation changes
    useEffect(() => {
        if (userLocation && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'location', lat: userLocation.lat, lng: userLocation.lng }));
        }
    }, [userLocation]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            const newMuted = !prev;
            isMutedRef.current = newMuted;
            // Signal Gemini to flush cached audio buffer when muting
            // Prevents stale audio from being processed on unmute
            if (newMuted && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'audio_stream_end' }));
            }
            return newMuted;
        });
    }, []);

    const setupVideoCapture = useCallback((video: HTMLVideoElement, stream: MediaStream) => {
        video.srcObject = stream;
        video.play().catch(() => { });

        // Wait for video to be ready
        video.onloadedmetadata = () => {
            // Set up canvas for frame capture
            const canvas = videoCanvasRef.current;
            if (!canvas) return;

            // Higher resolution for better text/landmark recognition
            const targetWidth = 768;
            const targetHeight = Math.round((video.videoHeight / video.videoWidth) * targetWidth);
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Clear any existing interval
            if (videoIntervalRef.current) {
                clearInterval(videoIntervalRef.current);
            }

            // Capture frames at ~1 FPS (sufficient for showing context)
            videoIntervalRef.current = setInterval(() => {
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
                if (!video || video.paused || video.ended) return;

                ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

                // Convert to JPEG and send
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                const base64Data = dataUrl.split(',')[1];

                wsRef.current.send(JSON.stringify({
                    type: 'video_frame',
                    content: base64Data,
                    mimeType: 'image/jpeg'
                }));
            }, 500); // 2 frames per second for smoother real-time feel
        };
    }, []);

    const startVideoCapture = useCallback(async (mode: 'camera' | 'screen') => {
        try {
            // IMPORTANT: Acquire the stream FIRST, before any state changes.
            // getDisplayMedia() requires transient user activation (user gesture).
            // If we call stopVideoCapture() first (which triggers setState/re-render),
            // the user activation expires and getDisplayMedia silently fails.
            let stream: MediaStream;
            if (mode === 'camera') {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: cameraFacing }
                });
            } else {
                // getDisplayMedia is not available on most mobile browsers
                if (!navigator.mediaDevices.getDisplayMedia) {
                    setError('Screen sharing is not supported on this device');
                    setShowVideoMenu(false);
                    return;
                }
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true
                });
            }

            // Now that we have the new stream, clean up the old one
            if (videoIntervalRef.current) {
                clearInterval(videoIntervalRef.current);
                videoIntervalRef.current = null;
            }
            if (videoStreamRef.current) {
                videoStreamRef.current.getTracks().forEach(t => t.stop());
            }

            videoStreamRef.current = stream;
            setVideoMode(mode);
            setShowVideoMenu(false);

            // Set up video element for capture
            const video = videoElementRef.current;
            if (!video) return;

            setupVideoCapture(video, stream);

            // Request DeviceMotion permission for AR tracking (iOS 13+ requires user gesture)
            if (mode === 'camera' && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
                (DeviceMotionEvent as any).requestPermission().catch(() => {});
            }

            // Also update preview
            if (previewVideoRef.current) {
                previewVideoRef.current.srcObject = stream;
                previewVideoRef.current.play().catch(() => {});
            }

            // Handle screen share ending (user clicks stop)
            if (mode === 'screen') {
                stream.getVideoTracks()[0].onended = () => {
                    stopVideoCapture();
                };
            }

            // On mobile, requesting camera can kill the mic stream.
            // Check if mic is still active and restart if needed.
            if (mediaStreamRef.current) {
                const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
                if (!audioTrack || audioTrack.readyState === 'ended') {
                    console.warn('Mic stream died after camera start — restarting mic');
                    startRecording();
                }
            }
        } catch (err: any) {
            console.error('Video capture error:', err);
            // Cleanup any partially-acquired stream
            if (videoStreamRef.current) {
                videoStreamRef.current.getTracks().forEach(t => t.stop());
                videoStreamRef.current = null;
            }
            if (err.name === 'NotAllowedError') {
                setError(mode === 'camera' ? 'Camera access denied' : 'Screen share cancelled');
            } else if (err.name === 'NotSupportedError') {
                setError('Screen sharing is not supported on this device');
            } else if (err.name === 'AbortError') {
                // User cancelled the picker — no error needed
            } else {
                setError(`${mode === 'camera' ? 'Camera' : 'Screen share'} error: ${err.message || err.name}`);
            }
            setVideoMode('off');
            setShowVideoMenu(false);
        }
    }, [stopVideoCapture, cameraFacing, setupVideoCapture, startRecording]);

    // Apply an already-acquired camera stream (skips getUserMedia for faster startup)
    const applyVideoStream = useCallback((stream: MediaStream, mode: 'camera' | 'screen') => {
        if (videoIntervalRef.current) { clearInterval(videoIntervalRef.current); videoIntervalRef.current = null; }
        if (videoStreamRef.current) { videoStreamRef.current.getTracks().forEach(t => t.stop()); }
        videoStreamRef.current = stream;
        setVideoMode(mode);
        const video = videoElementRef.current;
        if (video) setupVideoCapture(video, stream);
        if (previewVideoRef.current) { previewVideoRef.current.srcObject = stream; previewVideoRef.current.play().catch(() => {}); }
        // Check mic didn't die
        if (mediaStreamRef.current) {
            const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
            if (!audioTrack || audioTrack.readyState === 'ended') startRecording();
        }
    }, [setupVideoCapture, startRecording]);

    const flipCamera = useCallback(async () => {
        const newFacing = cameraFacing === 'user' ? 'environment' : 'user';
        setCameraFacing(newFacing);

        // Stop current camera stream
        if (videoStreamRef.current) {
            videoStreamRef.current.getTracks().forEach(t => t.stop());
        }
        // Clear the interval while switching
        if (videoIntervalRef.current) {
            clearInterval(videoIntervalRef.current);
            videoIntervalRef.current = null;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: newFacing }
            });
            videoStreamRef.current = stream;

            // Update capture video element
            const video = videoElementRef.current;
            if (video) {
                setupVideoCapture(video, stream);
            }

            // Update preview video element
            if (previewVideoRef.current) {
                previewVideoRef.current.srcObject = stream;
                previewVideoRef.current.play().catch(() => {});
            }

            // On mobile, switching camera can kill the mic stream — restart if needed
            if (mediaStreamRef.current) {
                const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
                if (!audioTrack || audioTrack.readyState === 'ended') {
                    console.warn('Mic stream died after camera flip — restarting mic');
                    startRecording();
                }
            }
        } catch (err) {
            console.error('Camera flip error:', err);
        }
    }, [cameraFacing, setupVideoCapture, startRecording]);

    // Speech speed control
    const cycleSpeechSpeed = useCallback(() => {
        const speeds: Array<'normal' | 'slow' | 'fast'> = ['normal', 'slow', 'fast'];
        setSpeechSpeed(prev => {
            const currentIdx = speeds.indexOf(prev);
            const nextSpeed = speeds[(currentIdx + 1) % speeds.length];

            // Notify server of speed preference
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'set_speech_speed',
                    speed: nextSpeed
                }));
            }

            return nextSpeed;
        });
    }, []);

    useImperativeHandle(ref, () => ({
        sendText: (text: string) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'text', text }));
            }
        }
    }));

    if (!isOpen) return null;

    const cam = videoMode === 'camera';
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const canScreenShare = !isMobile && !!navigator.mediaDevices?.getDisplayMedia;

    // Visual identification helpers
    const idTypeEmoji: Record<string, string> = {
        appliance: '\u2699\uFE0F', landmark: '\uD83C\uDFDB\uFE0F', food: '\uD83C\uDF7D\uFE0F',
        sign: '\uD83E\uDEA7', document: '\uD83D\uDCC4', hotel_feature: '\uD83C\uDFE8', artwork: '\uD83C\uDFA8'
    };

    // Hotel coordinates for quick-action proximity detection
    const hotelCoords = [
        { name: 'Palazzina Fusi', lat: 43.7676, lng: 11.2442 },
        { name: 'Hotel Lombardia', lat: 43.7768, lng: 11.2524 },
        { name: 'Hotel Arcadia', lat: 43.7760, lng: 11.2490 },
        { name: 'Hotel Villa Betania', lat: 43.7558, lng: 11.2456 },
        { name: "L'Antica Porta", lat: 43.7580, lng: 11.2480 },
        { name: 'Residenza Ognissanti', lat: 43.7726, lng: 11.2428 },
    ];
    const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    const nearHotel = userLocation ? hotelCoords.find(h => haversineDistance(userLocation.lat, userLocation.lng, h.lat, h.lng) < 200) : null;

    const quickActions = [
        { icon: Thermometer, label: 'AC', question: 'How do I use the air conditioning remote control?' },
        { icon: Coffee, label: 'Coffee', question: 'How do I use the coffee machine in my room?' },
        { icon: Lock, label: 'Safe', question: 'How do I set up and use the room safe?' },
        { icon: Wifi, label: 'WiFi', question: 'What is the WiFi password?' },
        { icon: Droplets, label: 'Shower', question: 'How does the shower work?' },
        { icon: Tv, label: 'TV', question: 'How do I use the TV remote?' },
    ];

    return (
        <div className={`fixed inset-0 z-50 ${cam ? 'bg-black pointer-events-auto' : 'pointer-events-none'}`}>
            {/* Hidden capture elements */}
            <video ref={videoElementRef} className="hidden" playsInline muted />
            <canvas ref={videoCanvasRef} className="hidden" />

            {/* ── Camera: fullscreen feed ── */}
            {cam && (
                <video
                    ref={previewVideoRef}
                    className="absolute inset-0 w-full h-full bg-black z-[1]"
                    style={{
                        objectFit: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'cover' as const : 'contain' as const,
                        ...(cameraFacing === 'user' ? { transform: 'scaleX(-1)' } : {}),
                    }}
                    playsInline
                    muted
                />
            )}

            {/* ── Camera: compact identification panel (bottom sheet) ── */}
            {cam && liveTags.length > 0 && (
                <div className="absolute bottom-28 left-2 right-2 z-[7]" style={{ animation: 'panel-slide-up 0.3s ease-out' }}>
                    <div className="bg-black/70 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                        {liveTags.map(tag => {
                            const isExpanded = expandedTag === tag.id;
                            const emoji = idTypeEmoji[tag.object_type] || '\uD83D\uDD0D';
                            return (
                                <div key={tag.id} className="border-b border-white/5 last:border-b-0">
                                    {/* Tag row */}
                                    <button
                                        onClick={() => { setExpandedTag(isExpanded ? null : tag.id); setExpandedAction(null); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-white/5 active:bg-white/10"
                                    >
                                        <span className="text-base">{emoji}</span>
                                        <div className="flex-1 text-left min-w-0">
                                            <span className="text-white text-[12px] font-semibold truncate block">{tag.object_name}</span>
                                            {tag.location_context && (
                                                <span className="text-white/40 text-[10px] truncate block">{tag.location_context}</span>
                                            )}
                                        </div>
                                        <ChevronDown size={14} className={`text-white/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* Expanded detail */}
                                    {isExpanded && (
                                        <div className="px-3 pb-3" style={{ animation: 'badge-in 0.2s ease-out' }}>
                                            <p className="text-white/70 text-[11px] leading-relaxed mb-2 line-clamp-3">{tag.description}</p>
                                            {tag.markers.length > 0 && (
                                                <div className="space-y-1 mb-2">
                                                    {tag.markers.map((marker, mi) => (
                                                        <div key={mi} className="flex items-center gap-2">
                                                            <div className="flex items-center justify-center w-5 h-5 rounded-full border border-amber-400/50 bg-amber-400/10">
                                                                <span className="text-amber-400 text-[9px] font-bold">{marker.step || mi + 1}</span>
                                                            </div>
                                                            <span className="text-white/80 text-[11px]">{marker.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {tag.actions.length > 0 && (
                                                <div className="space-y-1.5">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {tag.actions.map((action, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={(e) => { e.stopPropagation(); setExpandedAction(expandedAction === idx ? null : idx); }}
                                                                className={`text-[10px] font-medium px-2 py-1 rounded-full transition-all active:scale-95 ${
                                                                    expandedAction === idx ? 'bg-amber-500/90 text-white' : 'bg-white/15 text-white/90'
                                                                }`}
                                                            >{action.label}</button>
                                                        ))}
                                                    </div>
                                                    {expandedAction !== null && tag.actions[expandedAction] && (
                                                        <div className="bg-white/10 rounded-xl p-2 mt-1">
                                                            <p className="text-white/80 text-[11px] leading-relaxed">{tag.actions[expandedAction].instruction}</p>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                                                                        wsRef.current.send(JSON.stringify({ type: 'text', text: `Show me how to: ${tag.actions[expandedAction!].instruction}` }));
                                                                    }
                                                                    setExpandedAction(null);
                                                                }}
                                                                className="mt-1.5 text-[10px] font-semibold text-amber-400"
                                                            >Ask Sofia →</button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Shared keyframes */}
            <style>{`
                @keyframes panel-slide-up { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
                @keyframes badge-in { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
                @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
            `}</style>

            {/* ── Camera: quick-action pills (near hotel, no active identification) ── */}
            {cam && nearHotel && liveTags.length === 0 && (
                <div className="absolute top-16 left-3 right-3 z-[7]">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Eye size={12} className="text-white/50" />
                        <span className="text-white/50 text-[10px] font-medium uppercase tracking-wider">Near {nearHotel.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {quickActions.map(({ icon: Icon, label, question }) => (
                            <button
                                key={label}
                                onClick={() => {
                                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                                        wsRef.current.send(JSON.stringify({ type: 'text', text: question }));
                                    }
                                }}
                                className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/60 hover:text-white px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all active:scale-95"
                            >
                                <Icon size={13} />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Camera: top bar (flip + location badge + close) ── */}
            {cam && (
                <div className="absolute top-3 left-2 right-2 flex justify-between items-center z-10">
                    <button onClick={flipCamera} className="bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white p-2.5 rounded-full transition-colors active:scale-95" title="Switch camera">
                        <SwitchCamera size={20} />
                    </button>
                    <div className="flex items-center gap-2">
                        {userLocation && (
                            <div className="bg-black/40 backdrop-blur-sm text-emerald-400 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-medium">
                                <MapPin size={13} />
                                <span>Location active</span>
                            </div>
                        )}
                        <button onClick={stopVideoCapture} className="bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white p-2.5 rounded-full transition-colors active:scale-95" title="Stop camera">
                            <X size={20} />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Screen share: top-right pip ── */}
            {videoMode === 'screen' && (
                <div className="absolute top-4 right-4 w-40 z-10 rounded-lg border border-slate-700 shadow-xl overflow-hidden pointer-events-auto" style={{ background: '#1e293b' }}>
                    <video ref={previewVideoRef} className="w-full h-auto" playsInline muted />
                    <button onClick={stopVideoCapture} className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white p-1 rounded-full" title="Stop sharing">
                        <X size={14} />
                    </button>
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">Screen</div>
                </div>
            )}

            {/* Visual assist floating cards */}
            {assistCards.length > 0 && (
                <div className="absolute bottom-44 left-4 right-4 z-20 flex flex-col items-center gap-2 pointer-events-auto">
                    {assistCards.map(card => {
                        const isSteps = card.type === 'steps';
                        return (
                            <div
                                key={card.id}
                                className={`w-full max-w-sm bg-slate-800/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden transition-all duration-400 ${card.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                            >
                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
                                    <h3 className="text-white text-sm font-semibold">{card.title}</h3>
                                    <button onClick={() => setAssistCards(prev => prev.filter(c => c.id !== card.id))} className="text-slate-400 hover:text-white p-0.5"><X size={14} /></button>
                                </div>
                                <div className="px-4 py-2.5 space-y-2">
                                    {card.items.map((item, i) => {
                                        const IconComp = ICON_MAP[item.icon] || Info;
                                        const isButton = !!item.action;
                                        const Tag = isButton ? 'button' : 'div';
                                        return (
                                            <Tag
                                                key={i}
                                                className={`flex items-start gap-3 w-full text-left ${isButton ? 'bg-slate-700/50 hover:bg-slate-600/50 active:scale-[0.98] rounded-xl px-3 py-2 transition-all cursor-pointer' : 'py-1'}`}
                                                {...(isButton ? {
                                                    onClick: () => {
                                                        if (item.action === 'call_reception') window.open('tel:+390550131776');
                                                        else if (item.action === 'open_map') window.open('https://maps.google.com/?q=' + encodeURIComponent(item.text));
                                                    }
                                                } : {})}
                                            >
                                                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${isButton ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                                    {isSteps ? <span className="text-xs font-bold">{i + 1}</span> : <IconComp size={14} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-[13px] leading-snug">{item.text}</p>
                                                    {item.detail && <p className="text-slate-400 text-[11px] mt-0.5">{item.detail}</p>}
                                                </div>
                                                {isButton && <span className="text-teal-400 text-xs mt-1">{'>'}</span>}
                                            </Tag>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── ORB — always rendered, repositioned via style ── */}
            <div
                className="absolute pointer-events-auto"
                style={cam
                    ? { bottom: '7rem', right: '1rem', width: '5rem', height: '5rem', zIndex: 5, filter: 'drop-shadow(0 0 16px rgba(201,168,76,0.5))' }
                    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '18rem', height: '18rem', zIndex: 5 }
                }
            >
                <gdm-live-audio-visuals-canvas ref={(el: any) => {
                    orbRef.current = el;
                    if (el) {
                        if (sourceNodeRef.current) el.inputNode = sourceNodeRef.current;
                        if (outputNodeRef.current) el.outputNode = outputNodeRef.current;
                    }
                }} />
            </div>

            {/* ── CONTROLS ── */}
            <div
                className={`absolute left-0 right-0 flex flex-col items-center pointer-events-auto z-10 ${
                    cam ? 'bottom-0 pb-6 pt-4' : 'bottom-1/2 translate-y-[180px]'
                }`}
                style={cam ? { background: 'linear-gradient(to top, rgba(0,0,0,0.5) 60%, transparent)' } : {}}
            >
                <p className={`text-[11px] uppercase tracking-[0.15em] font-medium mb-3 ${cam ? 'text-white/70' : 'text-slate-400'}`}>
                    {error ? <span className="text-red-400">{error}</span> : status}
                </p>

                <div className="flex items-center gap-3">
                    {needsGesture && (
                        <button onClick={() => {
                            setNeedsGesture(false);
                            // Close suspended contexts so initConnection creates fresh ones in gesture context
                            if (inputAudioContextRef.current) { inputAudioContextRef.current.close().catch(() => {}); inputAudioContextRef.current = null; }
                            if (outputAudioContextRef.current) { outputAudioContextRef.current.close().catch(() => {}); outputAudioContextRef.current = null; }
                            initConnection();
                        }} className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-full transition-colors flex items-center gap-2 font-semibold text-sm active:scale-95 animate-pulse">
                            <Mic size={16} /> Tap to start
                        </button>
                    )}
                    {error && !cam && (
                        <button onClick={initConnection} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-full transition-colors flex items-center gap-1.5 font-semibold text-sm active:scale-95">
                            <Mic size={14} /> Retry
                        </button>
                    )}

                    {isRecording && (
                        <>
                            <button
                                onClick={toggleMute}
                                className={`${isMuted ? 'bg-amber-500 hover:bg-amber-600' : cam ? 'bg-white/20 backdrop-blur-sm hover:bg-white/30' : 'bg-slate-600 hover:bg-slate-500'} text-white p-3.5 rounded-full transition-colors shadow-lg active:scale-95`}
                                title={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                            </button>

                            {/* Video button — hide in camera mode (use top X to close) */}
                            {!cam && (
                                <div className="relative">
                                    <button
                                        onClick={() => {
                                            if (videoMode === 'screen') {
                                                stopVideoCapture();
                                            } else if (!canScreenShare) {
                                                startVideoCapture('camera');
                                            } else {
                                                setShowVideoMenu(!showVideoMenu);
                                            }
                                        }}
                                        className={`${videoMode !== 'off' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-slate-600 hover:bg-slate-500'} text-white p-3.5 rounded-full transition-colors shadow-lg active:scale-95`}
                                        title={videoMode !== 'off' ? 'Stop sharing' : 'Share camera or screen'}
                                    >
                                        {videoMode !== 'off' ? <VideoOff size={22} /> : <Video size={22} />}
                                    </button>
                                    {showVideoMenu && (
                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 rounded-lg shadow-xl border border-slate-700 overflow-hidden min-w-[140px]">
                                            <button onClick={() => startVideoCapture('camera')} className="w-full px-4 py-2.5 text-white text-sm hover:bg-slate-700 flex items-center gap-2">
                                                <Video size={16} /> Camera
                                            </button>
                                            {canScreenShare && (
                                                <button onClick={() => startVideoCapture('screen')} className="w-full px-4 py-2.5 text-white text-sm hover:bg-slate-700 flex items-center gap-2 border-t border-slate-700">
                                                    <Monitor size={16} /> Screen
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Speech speed */}
                            <button
                                onClick={cycleSpeechSpeed}
                                className={`${speechSpeed !== 'normal' ? 'bg-purple-500 hover:bg-purple-600' : cam ? 'bg-white/20 backdrop-blur-sm hover:bg-white/30' : 'bg-slate-600 hover:bg-slate-500'} text-white p-3.5 rounded-full transition-colors shadow-lg active:scale-95 relative`}
                                title={`Speech speed: ${speechSpeed}`}
                            >
                                <Gauge size={22} />
                                <span className="absolute -top-1 -right-1 bg-white text-slate-800 text-[9px] font-bold px-1 rounded">
                                    {speechSpeed === 'slow' ? '0.5x' : speechSpeed === 'fast' ? '1.5x' : '1x'}
                                </span>
                            </button>
                        </>
                    )}

                    <button
                        onClick={onClose}
                        className={`bg-red-500 hover:bg-red-600 text-white ${cam ? 'p-4' : 'p-3.5'} rounded-full transition-colors shadow-lg active:scale-95`}
                        title="End voice mode"
                    >
                        <PhoneOff size={cam ? 24 : 22} />
                    </button>
                </div>
            </div>
        </div>
    );
});

VoiceWidget.displayName = 'VoiceMode';
export default VoiceWidget;
