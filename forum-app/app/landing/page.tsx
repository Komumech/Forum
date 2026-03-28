'use client'

import { Video, Keyboard, Settings, HelpCircle, MessageSquare, Grid, Menu, Calendar, Phone, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function LandingPage() {
  const router = useRouter();
  const { user, logOut } = useAuth();
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
    <div className="h-screen bg-white flex flex-col text-[#3c4043] font-sans selection:bg-blue-100 overflow-hidden">
      
      {/* --- TOP HEADER --- */}
      <header className="h-16 flex items-center justify-between px-4 bg-white border-b border-transparent shrink-0">
        <div className="flex items-center gap-2">
          <button className="p-2.5 hover:bg-gray-100 rounded-full transition-colors text-[#5f6368]">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 ml-1 select-none cursor-pointer" onClick={() => router.push('/')}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">F</div>
            <span className="text-[22px] font-normal text-[#5f6368] tracking-tight">Forum</span>
          </div>
        </div>
        
        <div className="flex items-center gap-0.5">
          <div className="hidden md:flex items-center text-[#5f6368] text-[15px] mr-4 font-normal">
            {currentTime ? (
              `${currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} • ${currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`
            ) : (
              '--:--'
            )}
          </div>
          <button className="p-2 hover:bg-gray-100 rounded-full text-[#5f6368]"><HelpCircle size={22} /></button>
          <button className="p-2 hover:bg-gray-100 rounded-full text-[#5f6368]"><MessageSquare size={22} /></button>
          <button className="p-2 hover:bg-gray-100 rounded-full text-[#5f6368]"><Settings size={22} /></button>
          <button className="p-2 hover:bg-gray-100 rounded-full text-[#5f6368] mr-1"><Grid size={22} /></button>
          {user?.photoURL ? (
            <img 
              src={user.photoURL} 
              onClick={logOut}
              className="w-8 h-8 rounded-full cursor-pointer ml-3 border border-black/5 shadow-sm" 
            />
          ) : (
            <div className="w-8 h-8 bg-[#673ab7] rounded-full flex items-center justify-center text-white text-xs font-medium cursor-pointer ml-3 shadow-sm">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        
        {/* --- LEFT SIDEBAR --- */}
        <aside className="w-72 hidden lg:flex flex-col pt-2 px-3 gap-1 shrink-0">
          <div className="bg-[#e8f0fe] text-[#1967d2] flex items-center gap-5 px-6 py-3 rounded-full font-medium transition-all cursor-pointer">
            <Calendar size={18} strokeWidth={2.5} />
            <span className="text-sm font-medium">Meetings</span>
          </div>
          <div className="text-[#5f6368] hover:bg-gray-100 flex items-center gap-5 px-6 py-3 rounded-full font-medium transition-all cursor-pointer">
            <Phone size={18} />
            <span className="text-sm font-medium">Calls</span>
          </div>
          
          <div className="mt-auto mb-6 mx-2 p-5 bg-slate-50/50 rounded-[28px] border border-slate-100/50">
             <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-3">
                <Plus size={20} />
             </div>
             <p className="text-[14px] font-medium text-slate-700 mb-1">New experience</p>
             <p className="text-[12px] text-slate-500 leading-normal">Try the redesigned Forum dashboard for your team.</p>
          </div>
        </aside>

        {/* --- MAIN CENTER CONTENT --- */}
        <main className="flex-1 flex items-center justify-center p-8 bg-white overflow-hidden">
          <div className="max-w-[1024px] w-full flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-24">
            <div className="flex-1 text-center lg:text-left space-y-7">
              <h1 className="text-4xl md:text-[44px] leading-[1.2] font-normal text-[#1f1f1f] tracking-tight">
                Video calls and meetings for everyone
              </h1>
              <p className="text-lg md:text-[21px] font-light text-[#5f6368] leading-normal max-w-xl">
                Connect, collaborate, and celebrate from anywhere with Forum.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                <button 
                  onClick={createMeeting}
                  className="bg-[#1a73e8] hover:bg-[#185abc] text-white px-6 h-[48px] rounded-[4px] font-medium shadow-sm flex items-center gap-2.5 transition-all shrink-0"
                >
                  <Video size={20} />
                  <span className="text-[14px]">New meeting</span>
                </button>

                <div className="flex items-center gap-4">
                  <div className="flex items-center border border-[#dadce0] rounded-[4px] h-[48px] px-4 focus-within:border-[#1a73e8] focus-within:ring-[1px] focus-within:ring-[#1a73e8] transition-all">
                    <Keyboard size={20} className="text-[#5f6368] mr-3" />
                    <input 
                      type="text" 
                      placeholder="Enter a code or link" 
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                      className="bg-transparent outline-none text-[#3c4043] w-48 placeholder:font-light"
                    />
                  </div>
                  <button 
                    disabled={!roomCode.trim()}
                    onClick={() => router.push(`/room/${roomCode.trim()}`)}
                    className={`font-semibold text-[15px] px-4 py-2 transition-colors ${roomCode.trim() ? 'text-[#1a73e8] hover:bg-blue-50' : 'text-gray-400 cursor-not-allowed'} rounded-md`}
                  >Join</button>
                </div>
              </div>

              <div className="h-[1px] bg-[#dadce0] w-full mt-10" />
              <p className="text-[14px] text-[#5f6368]">
                <span className="text-[#1a73e8] cursor-pointer hover:underline">Learn more</span> about Forum.
              </p>
            </div>

            <div className="hidden lg:flex flex-col items-center">
               <div className="w-[320px] h-[320px] md:w-[400px] md:h-[400px] rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shadow-inner relative">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-lg border border-slate-50 flex items-center justify-center">
                     <Video size={36} className="text-blue-600" />
                  </div>
                  <div className="absolute -top-4 -right-4 w-12 h-12 bg-blue-100/50 rounded-full blur-2xl" />
               </div>
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