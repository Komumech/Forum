import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Video, Keyboard, Plus, Info, Sparkles, Shield, 
  Workflow, PenTool, FileText, Check, ChevronDown, 
  ChevronUp, Globe, Users, Clock, Lock, Monitor 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';

function GoogleIconSVG() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.62-.62-1.07-1.39-1.42-2.22z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  );
}

export default function Home() {
  const [roomCode, setRoomCode] = useState('');
  const [activeTab, setActiveTab] = useState<'video' | 'board' | 'notes'>('video');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const navigate = useNavigate();
  const { user, login, logout, loading, preferences } = useAuth();

  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < 10) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY.current && currentScrollY > 70) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      navigate(`/meeting/${roomCode.trim()}`);
    }
  };

  const handleNewMeeting = () => {
    const randomCode = Math.random().toString(36).substring(2, 10);
    navigate(`/meeting/${randomCode}`);
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const features = {
    video: {
      title: "Crystal Clear HD Video & Audio Confrerences",
      desc: "Experience high-definition latency-optimized video calls designed for modern distributed teams. Feel like you are in the same room with intelligent active-speaker highlighting, spatial sound tuning, noise cancellation, and rich bandwidth adaptation.",
      bullets: ["Adaptive 1080p stream resolution", "Low latency global edge-routed network", "Smart background noise suppression", "Intuitive layout adaptive grid system"]
    },
    board: {
      title: "Real-time Interactive Multi-User Whiteboard",
      desc: "Turn brainstorms into active collaboration sessions. Our whiteboard is built right into the meeting view, enabling multiple team members to sketch, draw diagrams, write notes, and place shapes simultaneously without leaving the call.",
      bullets: ["Zero-latency pen, brush, and shape tools", "Persistent auto-saving workspace canvasses", "Smooth cross-platform touch and stylus input", "One-click export to local vector image"]
    },
    notes: {
      title: "Collaborative Real-time Meeting Notes",
      desc: "Capture decisions, action items, and structural minutes on the fly. No more taking notes in notepad and forgetting where you saved them. Meeting notes are synced directly with all attendees and stored safely inside your workspace history.",
      bullets: ["Simultaneous real-time multi-user editing", "Markdown-rich styling and checklists", "Automatic document sync to email and cloud", "Action-item assignments built-in"]
    }
  };

  const faqs = [
    {
      q: "What is Forum Meet, and how is it different?",
      a: "Forum is an all-in-one immersive virtual collaboration hub. Unlike basic video conference tools, Forum integrates real-time interactive whiteboards, smart cloud meeting notes, and direct Google/Komu calendar sync into a single unified workspace to eliminate app-switching fatigue."
    },
    {
      q: "Do my meeting guest users need a paid account to join?",
      a: "Absolutely not! Anyone can join a shared Forum meeting with a single click from their browser or mobile device. No software installations or sign-ups are required for external guests."
    },
    {
      q: "How secure are my video streams and notes inside Forum?",
      a: "Security is our highest priority. All media streams, screen-sharing sessions, and collaborative documents are encrypted end-to-end using AES-256 and fully compliant with standard dynamic encryption protocols."
    },
    {
      q: "How does the calendar sync integration work?",
      a: "You can securely connect Google Calendar or Komu Sync with a single click on your dashboard. When connected, Forum automatically displays all scheduled events and enables one-click scheduling directly into your calendars."
    }
  ];

  return (
    <div className="min-h-screen bg-[#f4f5f6] flex flex-col font-sans selection:bg-blue-100 selection:text-accent-blue text-gray-800">
      {/* Top Banner for announcement */}
      <div className="bg-gray-900 text-gray-100 text-center py-2.5 px-4 text-xs font-semibold tracking-wide flex items-center justify-center gap-2">
        <Sparkles size={14} className="text-[#4285f4]" />
        <span>Introducing Forum 2.5: Zero-latency interactive whiteboarding is now public!</span>
      </div>

      {/* Header Navigation */}
      <header className={`sticky top-0 z-50 backdrop-blur-md bg-[#f4f5f6]/80 px-6 lg:px-16 py-4 flex items-center justify-between border-b border-gray-200/10 transition-transform duration-300 ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center border border-gray-100 p-1.5 overflow-hidden shadow-sm">
              <img src="https://komuhost.vercel.app/favicon.ico" className="w-full h-full object-contain" alt="Forum" referrerPolicy="no-referrer" />
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">Forum</span>
          </div>
          
          <nav className="hidden lg:flex items-center gap-8 bg-white px-6 py-2.5 rounded-full border border-gray-200/20 shadow-sm text-sm font-semibold text-gray-500">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#solutions" className="hover:text-gray-900 transition-colors">Solutions</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-xs hidden sm:block font-bold bg-white px-3 py-1.5 rounded-lg border border-gray-100/50">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {user ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate('/dashboard')} 
                className="bg-accent-blue hover:bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-accent-blue/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                Go to Dashboard
              </button>
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-gray-100/50">
                <img src={user.photoURL || `https://picsum.photos/seed/${user.uid}/36/36`} alt="User" referrerPolicy="no-referrer" />
              </div>
            </div>
          ) : (
            <button 
              onClick={login}
              className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-200/30 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4 shrink-0" alt="Google" />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 lg:py-24 px-6 lg:px-16 max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center gap-16">
        <div className="flex-1 space-y-8 max-w-xl text-center lg:text-left">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200/20 px-4 py-1.5 rounded-full text-xs font-bold text-gray-500 shadow-sm">
            <Shield size={14} className="text-accent-blue" />
            <span>Secure Enterprise Video Rooms & Interactive Tools</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 leading-tight tracking-tight">
              Video calls and meetings for <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-blue to-indigo-600">everyone</span>
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed font-medium">
              Create, connect, whiteboard, and record real-time team meetings from anywhere. Discover a seamless video workspace built with robust security, fluid screen sharing, and automated calendar synchronization.
            </p>
          </div>

          {user ? (
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start w-full">
              <button 
                onClick={handleNewMeeting}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-accent-blue hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-accent-blue/20 hover:-translate-y-0.5"
              >
                <Plus size={18} />
                Start Instant Meeting
              </button>

              <form onSubmit={handleJoin} className="w-full sm:w-auto flex items-center gap-3 border border-gray-200/30 bg-white rounded-xl px-4 py-1.5 shadow-sm focus-within:border-accent-blue focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <Keyboard className="text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Enter a code or link" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="w-full sm:w-44 py-1.5 outline-none text-sm font-medium text-gray-800 bg-transparent"
                />
                <button 
                  type="submit"
                  disabled={!roomCode.trim()}
                  className="text-accent-blue font-bold text-sm disabled:text-gray-300 transition-colors"
                >
                  Join
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start w-full">
              <button 
                onClick={login}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200/40 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4 shrink-0" alt="Google Logo" />
                <span>Continue with Google</span>
              </button>

              <form onSubmit={handleJoin} className="w-full sm:w-auto flex items-center gap-3 border border-gray-200/30 bg-white rounded-xl px-4 py-1.5 shadow-sm focus-within:border-accent-blue focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <Keyboard className="text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Enter a code or link" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="w-full sm:w-44 py-1.5 outline-none text-sm font-medium text-gray-800 bg-transparent"
                />
                <button 
                  type="submit"
                  disabled={!roomCode.trim()}
                  className="text-accent-blue font-bold text-sm disabled:text-gray-300 transition-colors"
                >
                  Join
                </button>
              </form>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-gray-200/50 text-center lg:text-left">
            <div>
              <p className="text-2xl font-black text-gray-900">99.99%</p>
              <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-wider">Stream Uptime</p>
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900">E2EE</p>
              <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-wider">E-2-E Encryption</p>
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900">1-Click</p>
              <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-wider">Guest Join Limit</p>
            </div>
          </div>
        </div>

        {/* Hero Illustration Block */}
        <div className="flex-1 max-w-xl w-full relative">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/10 to-indigo-600/10 rounded-[48px] blur-3xl transform rotate-3" />
            <div className="relative rounded-[40px] overflow-hidden shadow-2xl border-2 border-white bg-white">
              <img 
                src="https://komuhost.vercel.app/people.png" 
                alt="Forum video call collaboration visualization" 
                className="w-full object-cover aspect-[4/3] rounded-[34px]"
                referrerPolicy="no-referrer"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature matrix / Bento grid */}
      <section id="features" className="bg-[#f5f6f7] py-20 px-6 lg:px-16 border-y border-gray-205/50">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center max-w-2xl mx-auto space-y-4">
            <h2 className="text-xs font-black text-accent-blue uppercase tracking-widest">A Completely Re-imagined Video Suite</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Everything a modern team needs to execute seamlessly.</p>
            <p className="text-base text-gray-500 font-medium">Stop toggling, start executing. We brought absolute collaboration directly into your active conference windows.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="p-8 bg-white rounded-3xl border border-gray-200/50 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
              <div className="w-12 h-12 bg-blue-50 text-accent-blue rounded-2xl flex items-center justify-center mb-4">
                <Video size={22} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Latency-Optimized Video</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-semibold font-sans">Smart video routing adjusted dynamically depending on hardware and network latency parameters. No pixelation, no voice drops.</p>
            </div>
            {/* Card 2 */}
            <div className="p-8 bg-white rounded-3xl border border-gray-200/50 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                <PenTool size={22} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Live Whiteboards</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-semibold font-sans">Brainstorm visually with sticky notes, shape vectors, pen tools, and persistent live workspaces built completely into the main meeting view.</p>
            </div>
            {/* Card 3 */}
            <div className="p-8 bg-white rounded-3xl border border-gray-200/50 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
                <FileText size={22} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Synchronized Minutes</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-semibold font-sans">Take notes collaboratively as a team. Notes are stored securely alongside meeting telemetry, making post-meeting reviews trivial.</p>
            </div>
            {/* Card 4 */}
            <div className="p-8 bg-white rounded-3xl border border-gray-200/50 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
                <Workflow size={22} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Calendar Integration</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-semibold font-sans">Synchronize meeting records, rooms, and schedule seamlessly with Google Calendar and Komu Sync backplane integration.</p>
            </div>
            {/* Card 5 */}
            <div className="p-8 bg-white rounded-3xl border border-gray-200/50 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
                <Lock size={22} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">End-to-End Encryption</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-semibold font-sans">We do not decrypt or aggregate stream payloads. E2E enterprise grade security with complete WebRTC packet compliance.</p>
            </div>
            {/* Card 6 */}
            <div className="p-8 bg-white rounded-3xl border border-gray-200/50 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
              <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-4">
                <Monitor size={22} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Live Screen Sharing</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-semibold font-sans">Perfect presentational layouts, single applications or entire desktop shares with rich highframe rate audio relaying.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Feature Tabs showcase */}
      <section id="solutions" className="py-20 px-6 lg:px-16 max-w-7xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          <div className="flex-1 space-y-8">
            <div className="space-y-4">
              <h2 className="text-xs font-black text-accent-blue uppercase tracking-widest text-center lg:text-left">Interactive Workspace Capabilities</h2>
              <p className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight text-center lg:text-left">Double down on engagement.</p>
              <p className="text-gray-500 text-base leading-relaxed text-center lg:text-left font-semibold">
                Work workspaces are interactive sandbox zones where you don't just speak—you build, sketch, organize, and align live with fellow team members.
              </p>
            </div>

            {/* Selector list */}
            <div className="flex bg-gray-200/50 p-1 rounded-full w-full max-w-md mx-auto lg:mx-0 border border-gray-300/30">
              <button 
                onClick={() => setActiveTab('video')}
                className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all ${activeTab === 'video' ? "bg-white text-gray-900 shadow-sm border border-gray-200/50" : "text-gray-500 hover:text-gray-850"}`}
              >
                Conferencing
              </button>
              <button 
                onClick={() => setActiveTab('board')}
                className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all ${activeTab === 'board' ? "bg-white text-gray-900 shadow-sm border border-gray-200/50" : "text-gray-500 hover:text-gray-850"}`}
              >
                Whiteboarding
              </button>
              <button 
                onClick={() => setActiveTab('notes')}
                className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all ${activeTab === 'notes' ? "bg-white text-gray-900 shadow-sm border border-gray-200/50" : "text-gray-500 hover:text-gray-850"}`}
              >
                Smart Notes
              </button>
            </div>

            <div className="bg-white p-8 rounded-[32px] border border-gray-200 shadow-sm space-y-6">
              <h3 className="text-xl font-extrabold text-gray-900">{features[activeTab].title}</h3>
              <p className="text-sm font-semibold text-gray-550 leading-relaxed">{features[activeTab].desc}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-150">
                {features[activeTab].bullets.map((b, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs font-bold text-gray-800">
                    <div className="w-5 h-5 bg-blue-50 text-accent-blue rounded-md flex items-center justify-center shrink-0">
                      <Check size={12} />
                    </div>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-lg w-full relative">
            <div className="absolute inset-0 bg-accent-blue/5 rounded-[40px] transform rotate-3" />
            <div className="relative bg-white rounded-[40px] p-6 border border-gray-200 shadow-xl overflow-hidden aspect-[4/3] flex items-center justify-center">
              {activeTab === 'video' && (
                <div className="w-full h-full flex flex-col justify-between">
                  {/* Mock Video UI */}
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    <div className="bg-[#f4f5f6] rounded-3xl relative overflow-hidden flex items-center justify-center border border-gray-200">
                      <img src="https://picsum.photos/seed/user1/200/200" className="w-full h-full object-cover rounded-3xl opacity-90 animate-pulse" referrerPolicy="no-referrer" />
                      <span className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-lg">Sarah (Product)</span>
                    </div>
                    <div className="bg-[#f4f5f6] rounded-3xl relative overflow-hidden flex items-center justify-center border border-gray-200">
                      <img src="https://picsum.photos/seed/user2/200/200" className="w-full h-full object-cover rounded-3xl opacity-90" referrerPolicy="no-referrer" />
                      <span className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-lg">Marc (Lead Eng)</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-gray-150">
                    <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-gray-500"><Video size={16} /></div>
                    <div className="w-9 h-9 bg-red-100 text-red-600 rounded-xl flex items-center justify-center"><Video size={16} /></div>
                    <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-gray-500"><Monitor size={16} /></div>
                  </div>
                </div>
              )}
              {activeTab === 'board' && (
                <div className="w-full h-full flex flex-col justify-between">
                  {/* Mock Board UI */}
                  <div className="flex-1 border border-dashed border-gray-300 rounded-3xl p-4 flex flex-col relative justify-center bg-slate-100/30">
                    <div className="absolute top-4 left-4 p-2 bg-white rounded-xl shadow-sm border border-gray-150 flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                      <PenTool size={11} className="text-accent-blue" />
                      <span>Diagram #1 (Auto-saved)</span>
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-xs font-extrabold text-gray-800">Flowchart Canvas</p>
                      <p className="text-[10px] text-gray-400 font-medium">Sketch flowchart lines, shapes, and architecture here</p>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'notes' && (
                <div className="w-full h-full flex flex-col justify-between">
                  {/* Mock Notes UI */}
                  <div className="flex-1 bg-slate-50/50 border border-gray-150 rounded-3xl p-6 text-left space-y-4">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Minutes notes</p>
                    <h4 className="text-base font-extrabold text-gray-900">Sprint Sync Minutes</h4>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-750">
                        <input type="checkbox" defaultChecked className="rounded border-gray-300 text-accent-blue focus:ring-accent-blue" />
                        <span>Release the v2.5 dashboard update</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-750">
                        <input type="checkbox" className="rounded border-gray-300 text-accent-blue focus:ring-accent-blue" />
                        <span>Update landing page content for SEO index ranking</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="bg-[#1f2022] text-white py-24 px-6 lg:px-16 border-y border-gray-800">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center max-w-2xl mx-auto space-y-4">
            <h2 className="text-xs font-black text-accent-blue uppercase tracking-widest">Pricing Strategy</h2>
            <p className="text-3xl sm:text-4xl font-black tracking-tight">Flexible plans for high-performing teams.</p>
            <p className="text-slate-400 text-base font-semibold">Start for free and premium-upgrade when needed.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Free Plan */}
            <div className="bg-white/5 p-8 rounded-[32px] border border-white/10 space-y-8 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold">Standard Free</h3>
                  <p className="text-xs text-slate-400 mt-1 font-medium">Excellent for quick meetings and individual project work</p>
                </div>
                <div>
                  <span className="text-4xl font-black">$0</span>
                  <span className="text-xs text-slate-400 block mt-1">Always free</span>
                </div>
                <div className="h-px bg-white/10" />
                <ul className="space-y-4">
                  <li className="flex items-center gap-3 text-sm text-slate-350">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>Unlimited 1-on-1 video rooms</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-350">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>Up to 40-minute group calls</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-350">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>Shared real-time whiteboard</span>
                  </li>
                </ul>
              </div>
              <button onClick={login} className="w-full py-3 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl transition-all text-sm">Get Started</button>
            </div>

            {/* Pro Plan */}
            <div className="bg-gradient-to-b from-accent-blue/15 to-indigo-600/5 p-8 rounded-[32px] border-2 border-accent-blue space-y-8 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-accent-blue text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">Most Popular</div>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold">Workspace Pro</h3>
                  <p className="text-xs text-slate-300 mt-1 font-medium">Ideal for expanding professional agencies and collaborators</p>
                </div>
                <div>
                  <span className="text-4xl font-black">$12</span>
                  <span className="text-xs text-slate-300 inline-block ml-1">/ host / month</span>
                </div>
                <div className="h-px bg-white/10" />
                <ul className="space-y-4">
                  <li className="flex items-center gap-3 text-sm text-slate-300 font-semibold">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>Unlimited durational limits on group calls</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-300 font-semibold">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>Up to 100 simultaneous participants</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-300 font-semibold">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>Cloud recordings & shared room notes</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-300 font-semibold">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>Google Calendar background sync</span>
                  </li>
                </ul>
              </div>
              <button onClick={login} className="w-full py-3 bg-accent-blue hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-accent-blue/20 transition-all text-sm">Upgrade to Pro</button>
            </div>

            {/* Enterprise Plan */}
            <div className="bg-white/5 p-8 rounded-[32px] border border-white/10 space-y-8 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold">Enterprise Custom</h3>
                  <p className="text-xs text-slate-400 mt-1 font-medium">Custom operations for scaling enterprise operations</p>
                </div>
                <div>
                  <span className="text-4xl font-black">Custom</span>
                  <span className="text-xs text-slate-400 block mt-1">Negotiated annually</span>
                </div>
                <div className="h-px bg-white/10" />
                <ul className="space-y-4">
                  <li className="flex items-center gap-3 text-sm text-slate-350">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>Unlimited concurrent meeting lines</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-350">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>Advanced SAML SSO and access controls</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-350">
                    <Check size={16} className="text-accent-blue shrink-0" />
                    <span>24/7 dedicated support representative</span>
                  </li>
                </ul>
              </div>
              <button onClick={login} className="w-full py-3 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl transition-all text-sm">Contact Workspace Sales</button>
            </div>
          </div>
        </div>
      </section>

      {/* Accordion FAQ Section */}
      <section id="faq" className="bg-[#f4f5f6] py-24 px-6 lg:px-16 border-t border-gray-200/50">
        <div className="max-w-3xl mx-auto space-y-16">
          <div className="text-center space-y-4">
            <h2 className="text-xs font-black text-accent-blue uppercase tracking-widest">Common Questions</h2>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900">Frequently Asked Questions</p>
            <p className="text-gray-500 text-sm font-semibold">Find answers on scheduling, security, guest hosting, and stream bandwidth details.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden hover:border-gray-300 transition-colors">
                <button 
                  onClick={() => toggleFaq(i)}
                  className="w-full text-left p-6 flex justify-between items-center font-bold text-gray-800 hover:text-accent-blue transition-colors gap-4"
                >
                  <span className="text-base font-bold">{faq.q}</span>
                  {openFaq === i ? <ChevronUp size={18} className="shrink-0 text-gray-500" /> : <ChevronDown size={18} className="shrink-0 text-gray-500" />}
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 pt-0 text-sm font-semibold leading-relaxed text-gray-500 border-t border-gray-150">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Static Light-mode Footer */}
      <footer className="bg-[#f4f5f6] text-gray-500 py-16 px-6 lg:px-16 border-t border-gray-200/60">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200/50 pb-8 gap-6">
            <div>
              <h4 className="text-gray-900 font-extrabold text-lg">KomuMech Agency</h4>
              <p className="text-sm font-semibold text-gray-500 mt-1 max-w-lg leading-relaxed">
                Pushing the boundaries of web design through modern technology, creative logic, and high-performance coding.
              </p>
            </div>
            <div className="flex items-center gap-6 text-sm font-bold text-gray-600">
              <a href="#" className="hover:text-gray-900 transition-colors">Back to Top</a>
              <a href="mailto:komumech@gmail.com" className="hover:text-gray-900 transition-colors">Hire KomuMech</a>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center text-xs font-semibold text-gray-400 gap-4">
            <p>© 2026 KomuMech Agency. Designed and Developed in Lagos.</p>
            <p>Forum Workspace. All active channels secure.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
