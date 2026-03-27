'use client'

import { Video, Keyboard, Settings, HelpCircle, MessageSquare, Grid, Menu, Calendar, Phone, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function LandingPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const createMeeting = () => {
    const id = Math.random().toString(36).substring(2, 5) + '-' + 
               Math.random().toString(36).substring(2, 5) + '-' + 
               Math.random().toString(36).substring(2, 5);
    router.push(`/room/${id}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col text-[#3c4043] font-sans selection:bg-blue-100">
      
      {/* --- REFINED HEADER --- */}
      <header className="h-[64px] flex items-center justify-between px-4 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <button className="p-2.5 hover:bg-slate-100 rounded-full transition-colors text-[#5f6368]">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 ml-1 select-none cursor-pointer">
            {/* Replace with your actual Logo SVG or Image */}
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">F</div>
            <span className="text-[22px] font-normal text-[#5f6368] tracking-tight">Forum</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <div className="hidden md:flex items-center text-[#5f6368] text-[14px] mr-4 font-normal tracking-tight">
            {currentTime ? (
              `${currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} • ${currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`
            ) : (
              '--:--'
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button className="p-2 hover:bg-slate-100 rounded-full text-[#5f6368]"><HelpCircle size={22} /></button>
            <button className="p-2 hover:bg-slate-100 rounded-full text-[#5f6368]"><MessageSquare size={22} /></button>
            <button className="p-2 hover:bg-slate-100 rounded-full text-[#5f6368]"><Settings size={22} /></button>
            <button className="p-2 hover:bg-slate-100 rounded-full text-[#5f6368] mr-1"><Grid size={22} /></button>
          </div>
          <div className="w-8 h-8 bg-[#673ab7] rounded-full flex items-center justify-center text-white text-xs font-medium cursor-pointer ml-2">
            M
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* --- SIDEBAR (Fixed Width) --- */}
        <aside className="w-[256px] hidden lg:flex flex-col pt-2 px-3 gap-1">
          <div className="bg-[#e8f0fe] text-[#1967d2] flex items-center gap-5 px-6 py-3 rounded-full font-medium transition-all cursor-pointer">
            <Calendar size={18} strokeWidth={2.5} />
            <span className="text-[14px]">Meetings</span>
          </div>
          <div className="text-[#5f6368] hover:bg-slate-100 flex items-center gap-5 px-6 py-3 rounded-full font-medium transition-all cursor-pointer">
            <Phone size={18} />
            <span className="text-[14px]">Calls</span>
          </div>
          
          <div className="mt-auto mb-6 mx-2 p-5 bg-slate-50/50 rounded-[28px] border border-slate-100/50">
             <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-3">
                <Plus size={20} />
             </div>
             <p className="text-[14px] font-medium text-slate-700 mb-1">New experience</p>
             <p className="text-[12px] text-slate-500 leading-normal">Try the redesigned Forum dashboard for your team.</p>
          </div>
        </aside>

        {/* --- MAIN CONTENT AREA --- */}
        <main className="flex-1 flex flex-col items-center justify-center px-8 relative bg-white">
          <div className="max-w-[840px] w-full flex flex-col items-center">
            
            <div className="text-center space-y-6 mb-10">
              <h1 className="text-[44px] md:text-[52px] leading-[1.15] font-normal text-[#1f1f1f] tracking-tight">
                Video calls and meetings <br /> for everyone
              </h1>
              <p className="text-[18px] md:text-[21px] font-light text-[#5f6368] max-w-[600px] mx-auto leading-relaxed">
                Connect, collaborate, and celebrate from anywhere with Forum.
              </p>
            </div>

            {/* ACTION ROW */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 w-full">
              <button 
                onClick={createMeeting}
                className="bg-[#1a73e8] hover:bg-[#185abc] text-white px-6 py-3 rounded-[4px] font-medium shadow-sm flex items-center gap-2.5 transition-all active:scale-[0.98] shrink-0"
              >
                <Video size={20} />
                <span className="text-[14px]">New meeting</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white border border-[#dadce0] rounded-[4px] focus-within:border-[#1a73e8] focus-within:ring-[1px] focus-within:ring-[#1a73e8] transition-all overflow-hidden h-[48px]">
                  <div className="pl-4 text-[#5f6368]">
                    <Keyboard size={20} strokeWidth={1.5} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Enter a code or link"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    className="pl-3 pr-4 py-2 outline-none w-full md:w-[240px] text-[16px] text-[#3c4043] placeholder:text-[#5f6368] placeholder:font-light"
                  />
                </div>
                <button 
                  onClick={() => roomCode.trim() && router.push(`/room/${roomCode.trim()}`)}
                  className={`font-semibold text-[15px] px-3 py-2 transition-colors ${roomCode.trim() ? 'text-[#1a73e8] hover:bg-blue-50 rounded-md' : 'text-[#3c4043] opacity-30 cursor-not-allowed'}`}
                  disabled={!roomCode.trim()}
                >
                  Join
                </button>
              </div>
            </div>

            {/* SEPARATOR */}
            <div className="w-full h-[1px] bg-[#dadce0] mt-12 mb-8 max-w-[760px]" />

            {/* BOTTOM DECORATION */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-[120px] h-[120px] rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 relative shadow-inner">
                <div className="w-14 h-14 bg-white rounded-2xl shadow-md flex items-center justify-center border border-slate-50">
                  <Video size={28} className="text-blue-600" />
                </div>
                {/* Visual Glassmorphism accent */}
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-blue-100/50 rounded-full blur-xl" />
              </div>
              <p className="text-[14px] text-[#5f6368] font-normal">
                <span className="text-[#1a73e8] cursor-pointer hover:underline">Learn more</span> about Forum’s secure infrastructure.
              </p>
            </div>

          </div>
        </main>

        {/* Floating User Helper (Bottom Left) */}
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-3">
           <div className="w-10 h-10 bg-[#3c4043] text-white rounded-full flex items-center justify-center text-sm font-bold shadow-xl border border-white/10">N</div>
           <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shadow-lg cursor-pointer hover:bg-blue-200 transition-colors">
              <Plus size={20} />
           </div>
        </div>

      </div>
    </div>
  );
}