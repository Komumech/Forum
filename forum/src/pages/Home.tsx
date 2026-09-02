import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Video, Keyboard, Plus, 
  Workflow, PenTool, FileText, Check, ChevronDown, 
  ChevronUp, Lock, Monitor, LayoutDashboard,
  X, ArrowRight, Minus, ShieldCheck, Share2, Sparkles, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

export default function Home() {
  const [roomCode, setRoomCode] = useState('');
  const [activeTab, setActiveTab] = useState<'video' | 'board' | 'notes'>('video');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const navigate = useNavigate();
  const { user, login, loading, isLoggingIn, authError, clearAuthError } = useAuth();

  // Guest Join / Create Modal State
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestModalMode, setGuestModalMode] = useState<'create' | 'join'>('create');
  const [guestUsername, setGuestUsername] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('forum_guest_username') || '' : '';
  });
  const [guestRoomCode, setGuestRoomCode] = useState('');
  const [usernameError, setUsernameError] = useState('');

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

  const openGuestModal = (mode: 'create' | 'join', initialCode = '') => {
    setGuestModalMode(mode);
    setGuestRoomCode(initialCode || roomCode);
    setUsernameError('');
    setIsGuestModalOpen(true);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCode.trim().replace(/^https?:\/\/[^/]+\/meeting\//i, '');
    if (!cleanCode) return;

    if (user) {
      navigate(`/meeting/${cleanCode}`);
    } else {
      openGuestModal('join', cleanCode);
    }
  };

  const handleNewMeeting = () => {
    const randomCode = Math.random().toString(36).substring(2, 10);
    try {
      localStorage.setItem(`forum_room_host_${randomCode}`, 'true');
    } catch (e) {}

    if (user) {
      navigate(`/meeting/${randomCode}`);
    } else {
      openGuestModal('create', randomCode);
    }
  };

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = guestUsername.trim();
    if (!trimmedUser) {
      setUsernameError('Please enter a username or display name');
      return;
    }

    localStorage.setItem('forum_guest_username', trimmedUser);

    if (guestModalMode === 'create') {
      const randomCode = guestRoomCode || Math.random().toString(36).substring(2, 10);
      try {
        localStorage.setItem(`forum_room_host_${randomCode}`, 'true');
      } catch (e) {}
      navigate(`/meeting/${randomCode}?name=${encodeURIComponent(trimmedUser)}`);
    } else {
      const cleanCode = (guestRoomCode || roomCode).trim().replace(/^https?:\/\/[^/]+\/meeting\//i, '');
      if (!cleanCode) {
        setUsernameError('Please enter a valid room code or link');
        return;
      }
      navigate(`/meeting/${cleanCode}?name=${encodeURIComponent(trimmedUser)}`);
    }
    setIsGuestModalOpen(false);
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const features = {
    video: {
      title: "Crystal Clear HD Video & Audio",
      desc: "High-definition video calls with low-latency routing, active speaker highlighting, and automated bandwidth adaptation.",
      bullets: ["Adaptive 1080p stream resolution", "Low latency global edge-routed network", "Smart background noise suppression", "Intuitive layout adaptive grid system"]
    },
    board: {
      title: "Real-Time Collaborative Whiteboard",
      desc: "Brainstorm and sketch directly inside your active conference window with vector pens, shapes, and persistent canvasses.",
      bullets: ["Zero-latency drawing & shape tools", "Persistent auto-saving workspace canvasses", "Smooth cross-platform stylus and touch support", "One-click export to local vector image"]
    },
    notes: {
      title: "Synchronized Meeting Minutes",
      desc: "Capture decisions and action items collaboratively on the fly. Notes are saved directly with your room session.",
      bullets: ["Simultaneous real-time collaborative editing", "Clean checklists and markdown formatting", "Automatic session history storage", "Action item tracking"]
    }
  };

  const faqs = [
    {
      num: "01",
      q: "What is Forum, and what makes it different?",
      a: "Forum is a unified meeting and workspace platform. Instead of switching between disconnected apps, you get video conferencing, interactive whiteboards, collaborative meeting minutes, and Google Calendar sync in one single browser tab."
    },
    {
      num: "02",
      q: "Do guests need an account or app installation?",
      a: "No. Anyone can join with a link or meeting code directly from any modern web browser on desktop or mobile. No sign-ups, downloads, or plugins required."
    },
    {
      num: "03",
      q: "How are calls and collaborative data secured?",
      a: "All audio, video, and screen sharing streams are encrypted in transit using industry-standard WebRTC protocols. Whiteboard and notes data are isolated to your specific meeting room."
    },
    {
      num: "04",
      q: "Can I use Forum on mobile devices?",
      a: "Yes. Forum is fully responsive on mobile and tablet devices with portrait and landscape layouts, mobile-adapted camera controls, and touch-friendly whiteboard interactions."
    },
    {
      num: "05",
      q: "How does Google Calendar integration work?",
      a: "When signed in with your Google account, Forum can view and schedule events directly from your dashboard, letting you create instant or scheduled meeting links connected to your calendar."
    }
  ];

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col font-sans selection:bg-blue-100 selection:text-accent-blue text-gray-800">
      {/* Header Navigation */}
      <header className={`sticky top-0 z-50 backdrop-blur-md bg-[#f8f9fa]/90 px-5 sm:px-8 lg:px-16 py-3.5 sm:py-4 flex items-center justify-between border-b border-gray-200/60 transition-transform duration-300 ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center border border-gray-200/80 p-1.5 overflow-hidden shadow-sm">
              <img src="https://komuhost.vercel.app/favicon.ico" className="w-full h-full object-contain" alt="Forum" referrerPolicy="no-referrer" />
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">Forum</span>
          </div>
          
          <nav className="hidden lg:flex items-center gap-8 bg-white px-6 py-2 rounded-full border border-gray-200/60 shadow-sm text-sm font-semibold text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#workspace" className="hover:text-gray-900 transition-colors">Workspace</a>
            <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-xs hidden md:block font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          {user ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate('/dashboard')} 
                className="bg-accent-blue hover:bg-blue-600 text-white px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-accent-blue/20 transition-all active:scale-95 flex items-center gap-2"
              >
                <LayoutDashboard size={15} />
                <span>Dashboard</span>
              </button>
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden border border-gray-200">
                <img src={user.photoURL || `https://picsum.photos/seed/${user.uid}/36/36`} alt="User" referrerPolicy="no-referrer" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-2.5">
              <button 
                onClick={() => navigate('/dashboard')}
                className="text-gray-600 hover:text-gray-900 border border-gray-200/80 hover:bg-gray-50 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                title="Explore Dashboard"
              >
                <LayoutDashboard size={14} />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
              <button 
                onClick={() => openGuestModal('create')}
                className="hidden sm:flex bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue border border-accent-blue/20 items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all"
              >
                <Plus size={15} />
                <span>Instant Meeting</span>
              </button>
              <button 
                onClick={login}
                disabled={isLoggingIn}
                className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-60"
              >
                {isLoggingIn ? (
                  <div className="w-3.5 h-3.5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
                ) : (
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-3.5 h-3.5 shrink-0" alt="Google" />
                )}
                <span>Sign in</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Auth Error Notification Banner */}
      <AnimatePresence>
        {authError && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto px-4 pt-4"
          >
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl flex items-center justify-between text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-red-500 shrink-0" />
                <span>{authError}</span>
              </div>
              <button 
                onClick={clearAuthError}
                className="p-1 hover:bg-red-100 rounded-lg transition-colors text-red-600"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-12 sm:py-16 lg:py-20 px-5 sm:px-8 lg:px-16 max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
        <div className="flex-1 space-y-6 sm:space-y-8 max-w-xl text-center lg:text-left">
          <div className="space-y-3 sm:space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-accent-blue rounded-full text-xs font-bold border border-blue-100">
              <ShieldCheck size={14} />
              <span>Modern WebRTC Video Suite</span>
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-gray-900 leading-tight tracking-tight">
              Video calls and meetings for <span className="text-accent-blue">everyone</span>
            </h1>
            <p className="text-base sm:text-lg text-gray-600 leading-relaxed font-medium">
              Connect instantly with HD video, collaborative whiteboards, and real-time meeting notes — right in your browser.
            </p>
          </div>

          {user ? (
            <div className="flex flex-col sm:flex-row items-center gap-3.5 justify-center lg:justify-start w-full">
              <button 
                onClick={handleNewMeeting}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-accent-blue hover:bg-blue-600 text-white px-5 py-3.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-accent-blue/20 active:scale-98"
              >
                <Plus size={18} />
                Start Instant Meeting
              </button>

              <form onSubmit={handleJoin} className="w-full sm:w-auto flex items-center gap-3 border border-gray-200 bg-white rounded-xl px-4 py-2.5 shadow-sm focus-within:border-accent-blue focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <Keyboard className="text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Enter a code or link" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="w-full sm:w-44 py-0.5 outline-none text-sm font-medium text-gray-800 bg-transparent"
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
            <div className="space-y-4 w-full">
              <div className="flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start w-full">
                <button 
                  onClick={() => openGuestModal('create')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-accent-blue hover:bg-blue-600 text-white px-6 py-3.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-accent-blue/25 active:scale-98"
                >
                  <Plus size={18} />
                  <span>Start Instant Meeting</span>
                </button>

                <form onSubmit={handleJoin} className="w-full sm:w-auto flex items-center gap-2.5 border border-gray-200 bg-white rounded-xl px-4 py-2.5 shadow-sm focus-within:border-accent-blue focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                  <Keyboard className="text-gray-400 shrink-0" size={16} />
                  <input 
                    type="text" 
                    placeholder="Enter a code or link" 
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    className="w-full sm:w-40 py-0.5 outline-none text-sm font-medium text-gray-800 bg-transparent placeholder:text-gray-400"
                  />
                  <button 
                    type="submit"
                    disabled={!roomCode.trim()}
                    className="text-accent-blue font-bold text-sm disabled:text-gray-300 transition-colors px-1"
                  >
                    Join
                  </button>
                </form>
              </div>

              {/* Sign in with Google Bar */}
              <div className="flex flex-wrap items-center gap-3 justify-center lg:justify-start pt-2">
                <button 
                  onClick={login}
                  disabled={isLoggingIn}
                  className="px-4 py-2.5 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50/80 rounded-xl text-xs sm:text-sm font-semibold text-gray-800 shadow-sm transition-all flex items-center gap-2.5 active:scale-98 disabled:opacity-60"
                >
                  {isLoggingIn ? (
                    <div className="w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4 shrink-0" alt="Google" />
                  )}
                  <span>Sign in with Google</span>
                </button>
                <button 
                  onClick={() => navigate('/dashboard')}
                  className="px-3.5 py-2.5 text-xs sm:text-sm font-medium text-gray-600 hover:text-accent-blue transition-colors flex items-center gap-1.5 group"
                >
                  <LayoutDashboard size={14} className="text-gray-400 group-hover:text-accent-blue transition-colors" />
                  <span>Explore Dashboard</span>
                  <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Hero Illustration Block */}
        <div className="flex-1 max-w-lg lg:max-w-xl w-full relative">
          <div className="relative rounded-3xl sm:rounded-[36px] overflow-hidden shadow-xl border border-gray-200/80 bg-white">
            <img 
              src="https://komuhost.vercel.app/people.png" 
              alt="Forum video call collaboration" 
              className="w-full object-cover aspect-[4/3] rounded-3xl sm:rounded-[34px]"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </section>

      {/* Guest Meeting Setup Modal */}
      <AnimatePresence>
        {isGuestModalOpen && (
          <>
            <div 
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[100] transition-opacity"
              onClick={() => setIsGuestModalOpen(false)} 
            />
            <div className="fixed inset-0 z-[110] flex sm:items-center justify-center p-0 sm:p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 15 }}
                transition={{ duration: 0.2 }}
                className="bg-white sm:rounded-3xl rounded-none shadow-2xl border-0 sm:border sm:border-gray-100 max-w-md w-full h-full sm:h-auto p-6 sm:p-8 relative overflow-y-auto flex flex-col justify-between sm:justify-start"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        {guestModalMode === 'create' ? 'Start Instant Meeting' : 'Join with Code'}
                      </h3>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">No account or password required</p>
                    </div>
                    <button 
                      onClick={() => setIsGuestModalOpen(false)}
                      className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors"
                      title="Close"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Mode Selector Tabs */}
                  <div className="flex bg-gray-100 p-1 rounded-xl mb-6 text-xs font-semibold text-gray-600">
                    <button
                      type="button"
                      onClick={() => { setGuestModalMode('create'); setUsernameError(''); }}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-center transition-all",
                        guestModalMode === 'create' ? "bg-white text-gray-900 shadow-sm font-bold" : "hover:text-gray-900"
                      )}
                    >
                      Create New Room
                    </button>
                    <button
                      type="button"
                      onClick={() => { setGuestModalMode('join'); setUsernameError(''); }}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-center transition-all",
                        guestModalMode === 'join' ? "bg-white text-gray-900 shadow-sm font-bold" : "hover:text-gray-900"
                      )}
                    >
                      Join with Code
                    </button>
                  </div>

                  <form onSubmit={handleGuestSubmit} className="space-y-4">
                    {guestModalMode === 'join' && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                          Meeting Code or Link
                        </label>
                        <div className="relative flex items-center">
                          <Keyboard className="absolute left-3.5 text-gray-400" size={16} />
                          <input
                            type="text"
                            required
                            placeholder="e.g. abc-def-ghi"
                            value={guestRoomCode}
                            onChange={(e) => setGuestRoomCode(e.target.value)}
                            className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 outline-none focus:bg-white focus:border-accent-blue focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                        Your Display Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        autoFocus
                        required
                        placeholder="e.g. Alex Johnson"
                        value={guestUsername}
                        onChange={(e) => { setGuestUsername(e.target.value); setUsernameError(''); }}
                        className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 outline-none focus:bg-white focus:border-accent-blue focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-gray-400"
                      />
                      {usernameError && (
                        <p className="text-xs text-red-500 mt-1.5 font-semibold">{usernameError}</p>
                      )}
                    </div>

                    <div className="pt-3 space-y-3">
                      <button
                        type="submit"
                        disabled={!guestUsername.trim() || (guestModalMode === 'join' && !guestRoomCode.trim())}
                        className="w-full py-4 bg-accent-blue hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-lg shadow-accent-blue/20 transition-all flex items-center justify-center gap-2 active:scale-98"
                      >
                        <span>{guestModalMode === 'create' ? 'Start Meeting' : 'Join Room'}</span>
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </form>
                </div>

                <div className="pt-6 pb-2 space-y-3">
                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-gray-200 w-full" />
                    <span className="bg-white px-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider absolute">or</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => { setIsGuestModalOpen(false); login(); }}
                    className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-xl border border-gray-200 transition-colors flex items-center justify-center gap-2.5"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4 shrink-0" alt="Google" />
                    <span>Sign in with Google account</span>
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Feature Grid */}
      <section id="features" className="bg-[#f2f4f6] py-20 px-6 lg:px-16 border-y border-gray-200/60">
        <div className="max-w-7xl mx-auto space-y-14">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs font-bold text-accent-blue uppercase tracking-widest">Built for Fluid Collaboration</h2>
            <p className="text-2xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Everything in one active window.</p>
            <p className="text-sm sm:text-base text-gray-500 font-medium">No external tools or complicated setups. Direct video, drawings, and notes together.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-7 bg-white rounded-3xl border border-gray-200/70 shadow-sm hover:shadow-md transition-all">
              <div className="w-11 h-11 bg-blue-50 text-accent-blue rounded-2xl flex items-center justify-center mb-4">
                <Video size={20} />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">High Definition Video</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">Smart video routing adjusted dynamically depending on your connection. Smooth streams without voice dropouts.</p>
            </div>

            <div className="p-7 bg-white rounded-3xl border border-gray-200/70 shadow-sm hover:shadow-md transition-all">
              <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                <PenTool size={20} />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">Shared Whiteboard</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">Brainstorm visually with pens, sticky notes, and shapes on a live canvas embedded directly into the call.</p>
            </div>

            <div className="p-7 bg-white rounded-3xl border border-gray-200/70 shadow-sm hover:shadow-md transition-all">
              <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
                <FileText size={20} />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">Collaborative Notes</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">Take structured meeting minutes as a team. Notes auto-save with your meeting records for easy review.</p>
            </div>

            <div className="p-7 bg-white rounded-3xl border border-gray-200/70 shadow-sm hover:shadow-md transition-all">
              <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
                <Workflow size={20} />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">Calendar Integration</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">Schedule meetings directly with Google Calendar integration and view upcoming sessions in your dashboard.</p>
            </div>

            <div className="p-7 bg-white rounded-3xl border border-gray-200/70 shadow-sm hover:shadow-md transition-all">
              <div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
                <Lock size={20} />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">Encrypted Streams</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">WebRTC encrypted streams ensuring your meetings, audio, video, and screen shares remain strictly private.</p>
            </div>

            <div className="p-7 bg-white rounded-3xl border border-gray-200/70 shadow-sm hover:shadow-md transition-all">
              <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
                <Monitor size={20} />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">Screen & Media Sharing</h3>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">Share your full desktop, application windows, or browser tabs with high-framerate audio streaming.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Workspace showcase */}
      <section id="workspace" className="py-20 px-6 lg:px-16 max-w-7xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          <div className="flex-1 space-y-6">
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-accent-blue uppercase tracking-widest text-center lg:text-left">Interactive Workspace</h2>
              <p className="text-2xl sm:text-4xl font-extrabold text-gray-900 tracking-tight text-center lg:text-left">Engage beyond conversation.</p>
              <p className="text-gray-500 text-sm sm:text-base leading-relaxed text-center lg:text-left font-medium">
                Switch between video feeds, real-time whiteboards, and collaborative minutes in a single click.
              </p>
            </div>

            {/* Selector list */}
            <div className="flex bg-gray-200/60 p-1 rounded-full w-full max-w-md mx-auto lg:mx-0 border border-gray-300/30">
              <button 
                onClick={() => setActiveTab('video')}
                className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${activeTab === 'video' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                Conferencing
              </button>
              <button 
                onClick={() => setActiveTab('board')}
                className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${activeTab === 'board' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                Whiteboard
              </button>
              <button 
                onClick={() => setActiveTab('notes')}
                className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${activeTab === 'notes' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                Minutes
              </button>
            </div>

            <div className="bg-white p-7 sm:p-8 rounded-[28px] border border-gray-200/80 shadow-sm space-y-5">
              <h3 className="text-lg font-bold text-gray-900">{features[activeTab].title}</h3>
              <p className="text-sm font-medium text-gray-500 leading-relaxed">{features[activeTab].desc}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-4 border-t border-gray-100">
                {features[activeTab].bullets.map((b, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs font-semibold text-gray-700">
                    <div className="w-4 h-4 bg-blue-50 text-accent-blue rounded-md flex items-center justify-center shrink-0">
                      <Check size={11} />
                    </div>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-lg w-full relative">
            <div className="relative bg-white rounded-[32px] p-5 border border-gray-200/80 shadow-xl overflow-hidden aspect-[4/3] flex items-center justify-center">
              {activeTab === 'video' && (
                <div className="w-full h-full flex flex-col justify-between">
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <div className="bg-[#f0f2f4] rounded-2xl relative overflow-hidden flex items-center justify-center border border-gray-200">
                      <img src="https://picsum.photos/seed/user1/200/200" className="w-full h-full object-cover rounded-2xl opacity-90" referrerPolicy="no-referrer" alt="Participant" />
                      <span className="absolute bottom-2.5 left-2.5 bg-black/65 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-lg">Sarah (Design)</span>
                    </div>
                    <div className="bg-[#f0f2f4] rounded-2xl relative overflow-hidden flex items-center justify-center border border-gray-200">
                      <img src="https://picsum.photos/seed/user2/200/200" className="w-full h-full object-cover rounded-2xl opacity-90" referrerPolicy="no-referrer" alt="Participant" />
                      <span className="absolute bottom-2.5 left-2.5 bg-black/65 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-lg">Marc (Engineering)</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2.5 mt-3 pt-3 border-t border-gray-100">
                    <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-gray-500"><Video size={14} /></div>
                    <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-gray-500"><Monitor size={14} /></div>
                    <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-gray-500"><Share2 size={14} /></div>
                  </div>
                </div>
              )}
              {activeTab === 'board' && (
                <div className="w-full h-full flex flex-col justify-between">
                  <div className="flex-1 border border-dashed border-gray-300 rounded-2xl p-4 flex flex-col relative justify-center bg-slate-50/50">
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-white rounded-lg shadow-sm border border-gray-200 flex items-center gap-1.5 text-[10px] font-bold text-gray-600">
                      <PenTool size={11} className="text-accent-blue" />
                      <span>Diagram #1 (Auto-saved)</span>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-xs font-bold text-gray-800">Shared Whiteboard Canvas</p>
                      <p className="text-[11px] text-gray-400 font-medium">Drawings and sticky notes render in real time for all participants</p>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'notes' && (
                <div className="w-full h-full flex flex-col justify-between">
                  <div className="flex-1 bg-slate-50/70 border border-gray-200 rounded-2xl p-5 text-left space-y-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Minutes</p>
                    <h4 className="text-sm font-bold text-gray-900">Sprint Sync Notes</h4>
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                        <div className="w-4 h-4 rounded bg-accent-blue/10 text-accent-blue flex items-center justify-center shrink-0 font-bold">✓</div>
                        <span>Review roadmap milestones</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                        <div className="w-4 h-4 rounded bg-gray-200 shrink-0" />
                        <span>Coordinate calendar invitations</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Creative Minimalist FAQ Section */}
      <section id="faq" className="bg-[#f8f9fa] py-20 sm:py-28 px-6 lg:px-16 border-t border-gray-200/70">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            
            {/* Left Header Column */}
            <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-28">
              <div className="inline-flex items-center gap-2 text-accent-blue text-xs font-bold uppercase tracking-widest">
                <span>FAQ</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
                Simple answers to common questions.
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed font-medium">
                Everything you need to know about joining meetings, sharing content, and privacy in Forum.
              </p>
              
              <div className="pt-4 border-t border-gray-200/80">
                <p className="text-xs text-gray-500 font-medium">
                  Have a question not listed here?
                </p>
                <a 
                  href="mailto:komumech@gmail.com" 
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-blue hover:underline mt-1.5"
                >
                  <span>Contact support</span>
                  <ArrowRight size={12} />
                </a>
              </div>
            </div>

            {/* Right Editorial FAQ List */}
            <div className="lg:col-span-8 divide-y divide-gray-200/80">
              {faqs.map((faq, i) => {
                const isOpen = openFaq === i;
                return (
                  <div key={i} className="py-6 first:pt-0 last:pb-0 transition-colors">
                    <button 
                      onClick={() => toggleFaq(i)}
                      className="w-full text-left flex items-start justify-between gap-4 group cursor-pointer"
                    >
                      <div className="flex items-start gap-4 sm:gap-6">
                        <span className="text-xs font-mono font-bold text-gray-400 group-hover:text-accent-blue transition-colors pt-0.5">
                          {faq.num}
                        </span>
                        <span className={cn(
                          "text-base sm:text-lg font-bold transition-colors",
                          isOpen ? "text-accent-blue" : "text-gray-900 group-hover:text-gray-700"
                        )}>
                          {faq.q}
                        </span>
                      </div>
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 border transition-all",
                        isOpen 
                          ? "bg-accent-blue text-white border-accent-blue" 
                          : "bg-white text-gray-400 border-gray-200 group-hover:border-gray-300 group-hover:text-gray-600"
                      )}>
                        {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-8 sm:pl-12 pr-4 pt-3 text-sm font-normal text-gray-600 leading-relaxed">
                            {faq.a}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </section>

      {/* Minimalist Footer */}
      <footer className="bg-[#f2f4f6] text-gray-500 py-12 px-6 lg:px-16 border-t border-gray-200/80">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center border border-gray-200 p-1">
              <img src="https://komuhost.vercel.app/favicon.ico" className="w-full h-full object-contain" alt="Forum" referrerPolicy="no-referrer" />
            </div>
            <span className="text-sm font-bold text-gray-900">Forum Workspace</span>
          </div>

          <div className="flex items-center gap-6 text-xs font-semibold text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#workspace" className="hover:text-gray-900 transition-colors">Workspace</a>
            <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
            <a href="mailto:komumech@gmail.com" className="hover:text-gray-900 transition-colors">Contact</a>
          </div>

          <p className="text-xs text-gray-400 font-medium">
            © 2026 Forum. WebRTC encrypted.
          </p>
        </div>
      </footer>
    </div>
  );
}
