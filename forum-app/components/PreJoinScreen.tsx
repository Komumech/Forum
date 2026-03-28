'use client';
import { useState, useRef, useEffect } from 'react';

export default function PreJoinScreen({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Show local camera preview immediately
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; });
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 font-sans">
      <style jsx>{`
        /* Ensure the video in this screen specifically doesn't stretch */
        video {
          object-fit: contain !important;
          background-color: #000 !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 16px !important;
        }
      `}</style>
      <div className="max-w-5xl w-full flex flex-col lg:flex-row items-center gap-12">
        
        {/* Left: Video Preview Card */}
        <div className="flex-1 w-full relative aspect-video bg-[#202124] rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-50">
          <video ref={videoRef} autoPlay muted playsInline className="scale-x-[-1]" />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
             <button className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/40 transition-all">🎤</button>
             <button className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/40 transition-all">📷</button>
          </div>
        </div>

        {/* Right: Join Controls */}
        <div className="w-full lg:w-[400px] text-center lg:text-left space-y-6">
          <h1 className="text-3xl font-normal text-slate-800">Ready to join?</h1>
          <p className="text-slate-500">12 others are already in this call</p>
          
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="What's your name?" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-4 border-b-2 border-slate-200 focus:border-blue-600 outline-none text-lg transition-colors"
            />
            <button 
              onClick={() => name && onJoin(name)}
              className="w-full py-4 bg-blue-600 text-white rounded-full font-semibold shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
              disabled={!name}
            >
              Join now
            </button>
          </div>
          <p className="text-xs text-slate-400">Joining as a guest via **Komumech Forum**</p>
        </div>
      </div>
    </div>
  );
}