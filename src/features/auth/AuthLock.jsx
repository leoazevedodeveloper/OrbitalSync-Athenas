import React, { useEffect, useState } from 'react';
import { Lock, Unlock, User } from 'lucide-react';

const AuthLock = ({ socket, onAuthenticated, onAnimationComplete }) => {
    const [frameSrc, setFrameSrc] = useState(null);
    const [message, setMessage] = useState("Initializing Security...");
    const [isUnlocking, setIsUnlocking] = useState(false);

    useEffect(() => {
        if (!socket) return;

        const handleAuthStatus = (data) => {
            console.log("Auth Status:", data);
            if (data.authenticated && !isUnlocking) {
                // Start Unlock Sequence
                setIsUnlocking(true);
                setMessage("Identity Verified. Access Granted.");

                // Wait for animation then notify parent
                setTimeout(() => {
                    onAuthenticated(true);
                }, 2000); // 2 seconds animation
            } else if (!data.authenticated && !isUnlocking) {
                setMessage("Look at the camera to unlock.");
            }
        };

        const handleAuthFrame = (data) => {
            setFrameSrc(`data:image/jpeg;base64,${data.image}`);
        };

        socket.on('auth_status', handleAuthStatus);
        socket.on('auth_frame', handleAuthFrame);

        return () => {
            socket.off('auth_status', handleAuthStatus);
            socket.off('auth_frame', handleAuthFrame);
        };
    }, [socket, onAuthenticated, onAnimationComplete, isUnlocking]);

    const themeColor = isUnlocking ? 'text-green-500' : 'text-zinc-100';
    const borderColor = isUnlocking ? 'border-green-500' : 'border-white/20';
    const shadowColor = isUnlocking ? 'shadow-[0_0_50px_rgba(34,197,94,0.4)]' : 'shadow-2xl';
    const bgGradient = isUnlocking
        ? 'from-green-900/40 via-black to-black'
        : 'from-zinc-900/20 via-black to-black';

    return (

        <div className={`fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center font-sans select-none transition-all duration-[2000ms] ${isUnlocking ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100'}`}
            style={{ transitionDelay: '2000ms' }}> {/* Delay fade out to show success state */}

            {/* Background Grid */}
            <div className={`absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${bgGradient} pointer-events-none transition-colors duration-[1500ms]`}></div>

            <div className={`relative flex flex-col items-center gap-6 p-10 border ${borderColor} rounded-3xl bg-black/80 backdrop-blur-3xl ${shadowColor} transition-all duration-[1500ms]`}>
                <div className={`text-2xl font-bold tracking-[0.2em] uppercase flex items-center gap-4 ${themeColor} transition-colors duration-1000`}>
                    {isUnlocking ? <Unlock size={32} /> : <Lock size={32} />}
                    {isUnlocking ? "ACCESS GRANTED" : "SECURITY LOCK"}
                </div>

                {/* Camera Feed Frame */}
                <div className={`relative w-64 h-64 border ${borderColor} rounded-2xl overflow-hidden bg-zinc-950 shadow-inner flex items-center justify-center transition-colors duration-500`}>
                    {frameSrc ? (
                        <img
                            src={frameSrc}
                            alt="Auth Camera"
                            className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-500 ${isUnlocking ? 'opacity-50 grayscale' : 'opacity-100'}`}
                        />
                    ) : (
                        <div className={`animate-pulse ${isUnlocking ? 'text-green-800' : 'text-zinc-800'}`}>
                            <User size={64} />
                        </div>
                    )}

                    {/* Scanning Line Animation - remove on unlock */}
                    {!isUnlocking && (
                        <div className="absolute top-0 left-0 w-full h-1 bg-white/50 shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-[scan_2.5s_ease-in-out_infinite]"></div>
                    )}

                    {/* Success Overlay */}
                    {isUnlocking && (
                        <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 animate-pulse">
                            <Unlock size={64} className="text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.5)]" />
                        </div>
                    )}
                </div>

                <div className={`text-xs tracking-[0.2em] font-medium uppercase ${isUnlocking ? 'text-green-400' : 'text-zinc-500'} transition-colors duration-500`}>
                    {message}
                </div>
            </div>

            {/* Keyframe for scan animation */}
            <style>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
             `}</style>
        </div>
    );
};

export default AuthLock;
