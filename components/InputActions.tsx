import React, { useState, useEffect } from 'react';
import { Mic, Camera, Image as ImageIcon, Navigation, Plus, X, Video } from 'lucide-react';

interface InputActionsProps {
    onLocationClick: () => void;
    onImageClick: () => void;
    onCameraClick: () => void;
    onVoiceClick: () => void;
    onVideoClick?: () => void;
    isLocating: boolean;
    isRecording: boolean;
    hasLocation: boolean;
    hasImage: boolean;
    isLoading: boolean;
}

const InputActions: React.FC<InputActionsProps> = ({
    onLocationClick,
    onImageClick,
    onCameraClick,
    onVoiceClick,
    onVideoClick,
    isLocating,
    isRecording,
    hasLocation,
    hasImage,
    isLoading
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIconIndex, setActiveIconIndex] = useState(0);

    // Capabilities to scroll through
    const capabilities = [
        { icon: <Mic size={20} />, label: 'Voice' },
        { icon: <Video size={20} />, label: 'Video' },
        { icon: <Camera size={20} />, label: 'Camera' },
        { icon: <ImageIcon size={20} />, label: 'Photo' },
        { icon: <Navigation size={20} />, label: 'Map' },
    ];

    // Auto-scroll effect for the icon (only when closed)
    useEffect(() => {
        if (isOpen) return;
        const interval = setInterval(() => {
            setActiveIconIndex((prev) => (prev + 1) % capabilities.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [isOpen]);

    const toggleMenu = () => setIsOpen(!isOpen);

    // If recording or actively performing a task, show that state instead of the carousel
    if (isRecording) {
        return (
            <button
                onClick={onVoiceClick}
                className="absolute left-2 top-2 p-2 rounded-full bg-red-50 text-red-600 animate-pulse transition-all hover:bg-red-100 z-10"
                title="Stop Recording"
            >
                <Mic size={20} className="fill-current" />
            </button>
        );
    }

    if (isLocating) {
        return (
            <div className="absolute left-2 top-2 p-2 rounded-full bg-emerald-50 text-emerald-600 animate-spin z-10">
                <Navigation size={20} />
            </div>
        );
    }

    return (
        <>
            {/* The Magic Button */}
            {/* Positioned absolute left-2 top-2 inside the input container */}
            <div className="absolute left-2 top-2 z-10">
                <button
                    onClick={toggleMenu}
                    disabled={isLoading}
                    className={`relative overflow-hidden w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm border border-stone-200/60 ${isOpen ? 'bg-espresso text-cream rotate-45' : 'bg-stone-warm text-stone-400 hover:bg-cream hover:text-oro'
                        } ${hasLocation || hasImage ? 'ring-2 ring-oro-soft/40' : ''}`}
                >
                    {isOpen ? (
                        <Plus size={24} />
                    ) : (
                        hasLocation ? <Navigation size={20} className="text-emerald-600 fill-current" /> :
                            hasImage ? <ImageIcon size={20} className="text-amber-600" /> :
                                <div className="absolute top-0 left-0 w-full flex flex-col items-center transition-transform duration-500 ease-in-out" style={{ transform: `translateY(-${activeIconIndex * 40}px)` }}>
                                    {/* Stack of icons for scrolling effect - using h-10 to match button height */}
                                    {capabilities.map((cap, idx) => (
                                        <div key={idx} className="h-10 w-10 flex items-center justify-center flex-shrink-0">
                                            {cap.icon}
                                        </div>
                                    ))}
                                </div>
                    )}
                </button>
            </div>

            {/* Expanded Menu (The "Options") */}
            {isOpen && (
                <>
                    {/* Backdrop to close */}
                    <div className="fixed inset-0 z-[15]" onClick={() => setIsOpen(false)} />

                    <div className="absolute bottom-16 left-2 bg-cream rounded-2xl shadow-xl border border-stone-200/60 p-2 flex gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200 z-[20] min-w-[250px]">
                        <ActionButton
                            icon={<Mic size={20} />}
                            label="Voice"
                            onClick={() => { onVoiceClick(); setIsOpen(false); }}
                            active={isRecording}
                            color="text-red-500 bg-red-50"
                        />
                        {onVideoClick && (
                            <ActionButton
                                icon={<Video size={20} />}
                                label="Video"
                                onClick={() => { onVideoClick(); setIsOpen(false); }}
                                color="text-blue-500 bg-blue-50"
                            />
                        )}
                        <ActionButton
                            icon={<Camera size={20} />}
                            label="Lens"
                            onClick={() => { onCameraClick(); setIsOpen(false); }}
                            color="text-violet-500 bg-violet-50"
                        />
                        <ActionButton
                            icon={<ImageIcon size={20} />}
                            label="Photo"
                            onClick={() => { onImageClick(); setIsOpen(false); }}
                            active={hasImage}
                            color="text-amber-500 bg-amber-50"
                        />
                        <ActionButton
                            icon={<Navigation size={20} />}
                            label="Location"
                            onClick={() => { onLocationClick(); setIsOpen(false); }}
                            active={hasLocation}
                            color="text-emerald-500 bg-emerald-50"
                        />
                    </div>
                </>
            )}
        </>
    );
};

// Helper for menu items
const ActionButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; color: string }> = ({
    icon, label, onClick, active, color
}) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all w-16 h-16 active:scale-95 ${active ? color : 'text-stone-400 hover:bg-stone-100/50'}`}
    >
        <div className={`p-2 rounded-full mb-1 transition-colors ${active ? 'bg-white/50' : 'bg-stone-100 group-hover:bg-stone-200'}`}>
            {icon}
        </div>
        <span className="text-[10px] font-medium">{label}</span>
    </button>
);

export default InputActions;
