import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createBlob, decode, decodeAudioData } from './orb/utils';
import './orb/visual-canvas';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, X, Gauge } from 'lucide-react';

/// <reference types="vite/client" />

interface VoiceWidgetProps {
    isOpen: boolean;
    onClose: () => void;
    onMessage: (userText: string, sofiaText: string, toolVisuals?: any[]) => void;
    onLiveTranscript?: (sender: 'user' | 'bot', text: string) => void;
}

export interface VoiceWidgetRef {
    sendText: (text: string) => void;
}

const VoiceWidget = forwardRef<VoiceWidgetRef, VoiceWidgetProps>(({ isOpen, onClose, onMessage, onLiveTranscript }, ref) => {
    const [status, setStatus] = useState<string>('Connecting...');
    const [error, setError] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isStarted, setIsStarted] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [videoMode, setVideoMode] = useState<'off' | 'camera' | 'screen'>('off');
    const [showVideoMenu, setShowVideoMenu] = useState(false);
    const [speechSpeed, setSpeechSpeed] = useState<'normal' | 'slow' | 'fast'>('normal');

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
    const videoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
            };

            ws.onmessage = async (event) => {
                const msg = JSON.parse(event.data);

                if (msg.type === 'user_transcript') {
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
        if (!inputAudioContextRef.current || !wsRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            setStatus('Listening...');
            setIsRecording(true);

            const ctx = inputAudioContextRef.current;
            const source = ctx.createMediaStreamSource(stream);
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

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            isMutedRef.current = !prev;
            return !prev;
        });
    }, []);

    const startVideoCapture = useCallback(async (mode: 'camera' | 'screen') => {
        // Stop any existing video first
        stopVideoCapture();

        try {
            let stream: MediaStream;
            if (mode === 'camera') {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, facingMode: 'user' }
                });
            } else {
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { width: 1280, height: 720 }
                });
            }
            videoStreamRef.current = stream;
            setVideoMode(mode);
            setShowVideoMenu(false);

            // Set up video element for capture
            const video = videoElementRef.current;
            if (!video) return;

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

            // Handle screen share ending (user clicks stop)
            if (mode === 'screen') {
                stream.getVideoTracks()[0].onended = () => {
                    stopVideoCapture();
                };
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
            }
            setVideoMode('off');
        }
    }, [stopVideoCapture]);

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

    // Centered orb with transparent background — chat visible behind
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none">
            {/* Hidden video elements for capture */}
            <video ref={videoElementRef} className="hidden" playsInline muted />
            <canvas ref={videoCanvasRef} className="hidden" />

            {/* Video preview when sharing */}
            {videoMode !== 'off' && (
                <div className="absolute top-4 right-4 pointer-events-auto">
                    <div className="relative bg-slate-800 rounded-lg overflow-hidden shadow-xl border border-slate-700">
                        <video
                            className="w-40 h-auto"
                            ref={(el) => {
                                if (el && videoStreamRef.current) {
                                    el.srcObject = videoStreamRef.current;
                                    el.play().catch(() => { });
                                }
                            }}
                            playsInline
                            muted
                        />
                        <button
                            onClick={stopVideoCapture}
                            className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white p-1 rounded-full"
                            title="Stop sharing"
                        >
                            <X size={14} />
                        </button>
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                            {videoMode === 'camera' ? 'Camera' : 'Screen'}
                        </div>
                    </div>
                </div>
            )}

            {/* Large centered orb */}
            <div className="w-72 h-72 relative pointer-events-auto" style={{ background: 'transparent' }}>
                <gdm-live-audio-visuals-canvas
                    ref={(el: any) => {
                        if (el) {
                            if (sourceNodeRef.current) el.inputNode = sourceNodeRef.current;
                            if (outputNodeRef.current) el.outputNode = outputNodeRef.current;
                        }
                    }}
                />
            </div>

            {/* Status + end call below orb */}
            <div className="mt-6 flex items-center gap-3 pointer-events-auto">
                <p className="text-slate-400 text-[11px] uppercase tracking-[0.15em] font-medium">
                    {error ? <span className="text-red-500">{error}</span> : status}
                </p>

                {error && (
                    <button
                        onClick={initConnection}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-full transition-colors flex items-center gap-1.5 font-semibold text-sm active:scale-95"
                    >
                        <Mic size={14} />
                        Retry
                    </button>
                )}

                {isRecording && (
                    <>
                        <button
                            onClick={toggleMute}
                            className={`${isMuted ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-600 hover:bg-slate-500'} text-white p-3.5 rounded-full transition-colors shadow-lg active:scale-95`}
                            title={isMuted ? 'Unmute' : 'Mute'}
                        >
                            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                        </button>

                        {/* Video button with menu */}
                        <div className="relative">
                            <button
                                onClick={() => videoMode === 'off' ? setShowVideoMenu(!showVideoMenu) : stopVideoCapture()}
                                className={`${videoMode !== 'off' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-slate-600 hover:bg-slate-500'} text-white p-3.5 rounded-full transition-colors shadow-lg active:scale-95`}
                                title={videoMode !== 'off' ? 'Stop sharing' : 'Share camera or screen'}
                            >
                                {videoMode !== 'off' ? <VideoOff size={22} /> : <Video size={22} />}
                            </button>

                            {/* Video source menu */}
                            {showVideoMenu && (
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 rounded-lg shadow-xl border border-slate-700 overflow-hidden min-w-[140px]">
                                    <button
                                        onClick={() => startVideoCapture('camera')}
                                        className="w-full px-4 py-2.5 text-white text-sm hover:bg-slate-700 flex items-center gap-2"
                                    >
                                        <Video size={16} />
                                        Camera
                                    </button>
                                    <button
                                        onClick={() => startVideoCapture('screen')}
                                        className="w-full px-4 py-2.5 text-white text-sm hover:bg-slate-700 flex items-center gap-2 border-t border-slate-700"
                                    >
                                        <Monitor size={16} />
                                        Screen
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Speech speed button */}
                        <button
                            onClick={cycleSpeechSpeed}
                            className={`${speechSpeed !== 'normal' ? 'bg-purple-500 hover:bg-purple-600' : 'bg-slate-600 hover:bg-slate-500'} text-white p-3.5 rounded-full transition-colors shadow-lg active:scale-95 relative`}
                            title={`Speech speed: ${speechSpeed}`}
                        >
                            <Gauge size={22} />
                            <span className="absolute -top-1 -right-1 bg-white text-slate-800 text-[9px] font-bold px-1 rounded">
                                {speechSpeed === 'slow' ? '0.5×' : speechSpeed === 'fast' ? '1.5×' : '1×'}
                            </span>
                        </button>
                    </>
                )}

                <button
                    onClick={onClose}
                    className="bg-red-500 hover:bg-red-600 text-white p-3.5 rounded-full transition-colors shadow-lg active:scale-95"
                    title="End voice mode"
                >
                    <PhoneOff size={22} />
                </button>
            </div>
        </div>
    );
});

VoiceWidget.displayName = 'VoiceMode';
export default VoiceWidget;
