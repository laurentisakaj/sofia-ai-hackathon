import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createBlob, decode, decodeAudioData } from './orb/utils';
import './orb/visual-canvas';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, X, Gauge, SwitchCamera, MapPin } from 'lucide-react';

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
                outputNodeRef.current.connect(outputAudioContextRef.current.destination);
                nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
            }

            await inputAudioContextRef.current.resume();
            await outputAudioContextRef.current.resume();

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

            ws.onopen = () => {
                setStatus('Listening...');
                reconnectAttemptsRef.current = 0;
                startRecording();
                // Send location if available
                if (userLocation) {
                    ws.send(JSON.stringify({ type: 'location', lat: userLocation.lat, lng: userLocation.lng }));
                }
                // Auto-start camera if requested (video mode)
                if (autoStartCamera) {
                    setTimeout(() => startVideoCapture('camera'), 500);
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
                } else if (msg.type === 'response') {
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
                    pendingToolsRef.current.push({
                        name: msg.name,
                        result: msg.result,
                        attachments: msg.attachments || []
                    });
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
        setVideoMode('off');
    }, []);

    const cleanup = useCallback(() => {
        isClosingRef.current = true; // prevent auto-reconnect
        stopRecording();
        stopVideoCapture();
        setIsStarted(false);
        if (wsRef.current) wsRef.current.close();
        if (inputAudioContextRef.current) inputAudioContextRef.current.close().catch(() => { });
        if (outputAudioContextRef.current) outputAudioContextRef.current.close().catch(() => { });
        inputAudioContextRef.current = null;
        outputAudioContextRef.current = null;
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

            // Use smaller resolution for efficiency
            const targetWidth = 512;
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
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                const base64Data = dataUrl.split(',')[1];

                wsRef.current.send(JSON.stringify({
                    type: 'video_frame',
                    content: base64Data,
                    mimeType: 'image/jpeg'
                }));
            }, 1000); // 1 frame per second
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
                    video: { width: 640, height: 480, facingMode: cameraFacing }
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
                video: { width: 640, height: 480, facingMode: newFacing }
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

    return (
        <div className={`fixed inset-0 z-50 ${cam ? 'bg-black pointer-events-auto' : 'pointer-events-none'}`}>
            {/* Hidden capture elements */}
            <video ref={videoElementRef} className="hidden" playsInline muted />
            <canvas ref={videoCanvasRef} className="hidden" />

            {/* ── Camera: fullscreen feed ── */}
            {cam && (
                <video
                    ref={previewVideoRef}
                    className="absolute inset-0 w-full h-full object-contain bg-black z-[1]"
                    style={cameraFacing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
                    playsInline
                    muted
                />
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
