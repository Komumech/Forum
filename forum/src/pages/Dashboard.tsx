import * as React from 'react';
import { useState, useEffect, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Video, Calendar, Plus, Search, Settings, Clock, 
  MessageSquare, Users, ChevronRight, LogOut, 
  LayoutDashboard, FileText, Bell, RefreshCw, X, MoreVertical,
  Copy, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { db, auth, komuDb } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, Timestamp, orderBy } from 'firebase/firestore';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { cn } from '../lib/utils';

interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  roomId: string;
  hostId: string;
  hostName: string;
  tags?: string[];
  notes?: string;
  isKomu?: boolean;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error(`Firestore Error [${operationType}] on [${path}]:`, error);
}

export default function Dashboard() {
  // Set your actual logo image URL here
  const logoUrl = "https://komuhost.vercel.app/favicon.ico";

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSidebarTab, setActiveSidebarTab] = useState<'dashboard' | 'meetings' | 'contacts' | 'notes' | 'settings' | 'whiteboard' | 'calendar'>('dashboard');
  const [meetingSubTab, setMeetingSubTab] = useState<'upcoming' | 'previous' | 'recordings'>('upcoming');
  const [userStatus, setUserStatus] = useState<'available' | 'away' | 'busy' | 'offline'>('available');
  const [searchQuery, setSearchQuery] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isNewMeetingMenuOpen, setIsNewMeetingMenuOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), time: format(new Date(), 'HH:mm') });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Fetch meetings from local Forum DB
    const q = query(
      collection(db, 'meetings'), 
      where('participants', 'array-contains', user.uid),
      orderBy('startTime', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const localMeetings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime.toDate(),
      })) as Meeting[];
      
      setMeetings(prev => {
        const komuOnes = prev.filter(m => m.isKomu);
        return [...localMeetings, ...komuOnes].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      });
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'meetings');
    });

    // Initial Komu Sync
    syncKomuCalendar();

    return () => unsubscribe();
  }, [user]);

  const syncKomuCalendar = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      // In a real app, we'd query by user email or uid if they match
      // For this demo, we'll pull all events with tag 'meeting' from the komuDb
      const q = query(
        collection(komuDb, 'events'),
        where('type', '==', 'event') // The user's script uses 'type' for filtering
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const komuMeetings = snapshot.docs
          .map(doc => {
            const data = doc.data();
            // Check for 'meeting' tag in title or description as a fallback
            const hasMeetingTag = data.title?.toLowerCase().includes('meeting') || 
                                 data.description?.toLowerCase().includes('meeting') ||
                                 (data.tags && data.tags.includes('meeting'));
            
            if (!hasMeetingTag) return null;

            return {
              id: doc.id,
              title: data.title,
              description: data.description,
              startTime: data.start.toDate(),
              roomId: data.roomId || doc.id, // Fallback to doc id
              hostId: data.uid,
              hostName: 'Komu User',
              notes: data.description, // User said pull attached notes
              isKomu: true
            };
          })
          .filter(m => m !== null) as Meeting[];

        setMeetings(prev => {
          const localOnes = prev.filter(m => !m.isKomu);
          return [...localOnes, ...komuMeetings].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        });
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'komu/events');
      });
    } catch (err) {
      console.error("Komu Sync Failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const startTime = new Date(`${newMeeting.date}T${newMeeting.time}`);
    const roomId = Math.random().toString(36).substring(2, 12);

    try {
      await addDoc(collection(db, 'meetings'), {
        title: newMeeting.title,
        description: newMeeting.description,
        startTime: Timestamp.fromDate(startTime),
        roomId,
        hostId: user.uid,
        hostName: user.displayName || 'Anonymous',
        participants: [user.uid],
        createdAt: Timestamp.now()
      });
      setIsScheduling(false);
      setNewMeeting({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), time: format(new Date(), 'HH:mm') });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'meetings');
    }
  };

  const joinMeeting = async (roomId: string, isInstant = false) => {
    if (isInstant && user) {
      try {
        // Create a meeting record so host is defined
        await addDoc(collection(db, 'meetings'), {
          title: 'Instant Meeting',
          startTime: Timestamp.now(),
          roomId,
          hostId: user.uid,
          hostName: user.displayName || 'Anonymous',
          participants: [user.uid],
          createdAt: Timestamp.now()
        });
      } catch (err) {
        console.error("Failed to create instant meeting record:", err);
      }
    }
    navigate(`/meeting/${roomId}`);
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#f8f9fa] border-r border-gray-100 flex flex-col hidden md:flex">
        <div className="p-8 flex items-center gap-2">
          <img 
            src={logoUrl} 
            alt="Logo" 
            className="h-6 object-contain"
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          <span className="text-2xl font-normal text-gray-600 tracking-tight">Forum</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <SidebarItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeSidebarTab === 'dashboard'} 
            onClick={() => setActiveSidebarTab('dashboard')}
          />
          <SidebarItem 
            icon={<Video size={20} />} 
            label="Meetings" 
            active={activeSidebarTab === 'meetings'} 
            onClick={() => setActiveSidebarTab('meetings')}
          />
          <SidebarItem 
            icon={<Calendar size={20} />} 
            label="Calendar" 
            active={activeSidebarTab === 'calendar'} 
            onClick={() => setActiveSidebarTab('calendar')}
          />
          <SidebarItem 
            icon={<Users size={20} />} 
            label="Contacts" 
            active={activeSidebarTab === 'contacts'} 
            onClick={() => setActiveSidebarTab('contacts')}
          />
          <SidebarItem 
            icon={<FileText size={20} />} 
            label="Notes" 
            active={activeSidebarTab === 'notes'} 
            onClick={() => setActiveSidebarTab('notes')}
          />
          <SidebarItem 
            icon={<Monitor size={20} />} 
            label="Whiteboard" 
            active={activeSidebarTab === 'whiteboard'} 
            onClick={() => setActiveSidebarTab('whiteboard')}
          />
          <SidebarItem 
            icon={<Settings size={20} />} 
            label="Settings" 
            active={activeSidebarTab === 'settings'} 
            onClick={() => setActiveSidebarTab('settings')}
          />
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-accent-red hover:bg-red-50 rounded-xl transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Top Header */}
        <header className="h-20 flex items-center justify-between px-12">
          <div className="relative w-full max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search" 
              className="w-full pl-12 pr-4 py-2.5 bg-[#f1f3f4] border-none rounded-full focus:bg-white focus:ring-1 focus:ring-gray-200 outline-none text-md"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-4 py-1.5 bg-white border border-gray-200 rounded-full hover:shadow-sm transition-all cursor-pointer">
              <span className="text-sm font-medium text-gray-700">{user?.displayName} - Available</span>
              <img 
                src={user?.photoURL || `https://picsum.photos/seed/${user?.uid}/40/40`} 
                alt="Avatar" 
                className="w-7 h-7 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-12 py-6 custom-scroll">
          <div className="max-w-7xl mx-auto space-y-10">
            {activeSidebarTab === 'dashboard' && (
              <>
                {/* Welcome Section */}
                <div className="flex items-end justify-between">
                  <div className="space-y-1">
                    <h2 className="text-4xl font-normal text-gray-800">Welcome back, {user?.displayName?.split(' ')[0]}!</h2>
                    <div className="flex items-center gap-2 text-gray-500 text-lg">
                      <span>You have {meetings.filter(m => isToday(m.startTime)).length} meetings scheduled for today.</span>
                      <div className="h-4 w-px bg-gray-200" />
                      <span>{format(new Date(), 'EEEE, MMMM do')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 mb-2 text-sm font-medium text-gray-600">
                    <button 
                      onClick={syncKomuCalendar}
                      disabled={syncing}
                      className="flex items-center gap-2 hover:text-gray-900 transition-colors"
                    >
                      <RefreshCw size={16} className={cn(syncing && "animate-spin")} />
                      Sync Komu
                    </button>
                    <button onClick={() => setIsScheduling(true)} className="hover:text-gray-900 transition-colors">
                      Schedule Meeting
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="relative">
                    <QuickActionCard 
                      icon={<Plus size={24} />} 
                      label="New Meeting" 
                      sub="Start an instant meeting" 
                      color="bg-[#d2e3fc]"
                      iconColor="text-[#1967d2]"
                      onClick={() => setIsNewMeetingMenuOpen(!isNewMeetingMenuOpen)}
                    />
                    <AnimatePresence>
                      {isNewMeetingMenuOpen && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50"
                        >
                          <button 
                            onClick={() => {
                              const id = Math.random().toString(36).substring(2, 12);
                              joinMeeting(id, true);
                              setIsNewMeetingMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-gray-700 transition-all text-left"
                          >
                            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-accent-blue">
                              <Video size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-bold">Start instantly</p>
                              <p className="text-[10px] text-gray-400">Create a room right now</p>
                            </div>
                          </button>
                          <button 
                            onClick={() => {
                              setIsScheduling(true);
                              setIsNewMeetingMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-gray-700 transition-all text-left"
                          >
                            <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-500">
                              <Calendar size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-bold">Schedule for later</p>
                              <p className="text-[10px] text-gray-400">Pick a date and time</p>
                            </div>
                          </button>
                          <div className="h-px bg-gray-100 my-1 mx-4" />
                          <div className="px-4 py-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" className="rounded border-gray-300 text-accent-blue focus:ring-accent-blue" defaultChecked />
                              <span className="text-[10px] text-gray-500 font-medium">Use Personal Meeting ID</span>
                            </label>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <QuickActionCard 
                    icon={<Users size={24} />} 
                    label="Join Meeting" 
                    sub="Enter a meeting code" 
                    color="bg-[#e8f0fe]"
                    iconColor="text-gray-600"
                    onClick={() => setIsJoining(true)}
                  />
                  <QuickActionCard 
                    icon={<Calendar size={24} />} 
                    label="Schedule" 
                    sub="Plan a future meeting" 
                    color="bg-[#e8f0fe]"
                    iconColor="text-gray-600"
                    onClick={() => setIsScheduling(true)}
                  />
                  <QuickActionCard 
                    icon={<Monitor size={24} />} 
                    label="Share Screen" 
                    sub="Present in a meeting" 
                    color="bg-[#e8f0fe]"
                    iconColor="text-gray-600"
                    onClick={() => setIsSharing(true)}
                  />
                </div>

                {/* Personal Meeting Room */}
                <div className="bg-white px-8 py-5 rounded-[24px] border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#d2e3fc] rounded-xl flex items-center justify-center text-[#1967d2]">
                      <Video size={22} />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg text-gray-900">Personal Meeting Room</h3>
                      <p className="text-sm text-gray-500">Your permanent meeting link for quick sync.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="px-5 py-2.5 bg-[#f1f3f4] rounded-full text-sm font-medium text-gray-500">
                      forum.app/m/{user?.uid?.substring(0, 8)}
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`https://forum.app/m/${user?.uid?.substring(0, 8)}`);
                        alert("Link copied!");
                      }}
                      className="p-2.5 text-accent-blue hover:bg-accent-blue/5 rounded-xl transition-all"
                    >
                      <Copy size={20} />
                    </button>
                    <button 
                      onClick={() => joinMeeting(user?.uid?.substring(0, 8) || '')}
                      className="px-8 py-2.5 text-accent-blue font-bold text-md hover:bg-accent-blue/5 rounded-xl transition-all"
                    >
                      Start
                    </button>
                  </div>
                </div>

                {/* Meetings List */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Clock size={20} className="text-accent-blue" />
                        Upcoming Meetings
                      </h3>
                      <button onClick={() => setActiveSidebarTab('meetings')} className="text-sm font-bold text-accent-blue hover:underline">View all</button>
                    </div>

                    <div className="space-y-4">
                      {loading ? (
                        <div className="p-12 flex justify-center">
                          <RefreshCw className="animate-spin text-gray-300" size={32} />
                        </div>
                      ) : meetings.filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                        <div className="p-12 bg-white rounded-3xl border border-dashed border-gray-200 text-center space-y-4">
                          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                            <Calendar className="text-gray-300" size={32} />
                          </div>
                          <p className="text-gray-500 font-medium">No meetings found.</p>
                          <button onClick={() => setIsScheduling(true)} className="text-accent-blue font-bold hover:underline">Schedule one now</button>
                        </div>
                      ) : (
                        meetings
                          .filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase()))
                          .slice(0, 3)
                          .map(meeting => (
                            <MeetingCard 
                              key={meeting.id} 
                              meeting={meeting} 
                              onJoin={() => joinMeeting(meeting.roomId)}
                            />
                          ))
                      )}
                    </div>
                  </div>

                  {/* Side Panel: Calendar Mini & Notes */}
                  <div className="space-y-8">
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Calendar</h3>
                      <div className="aspect-square bg-gray-50 rounded-2xl flex flex-col items-center justify-center text-gray-400 p-4">
                        <span className="text-accent-red font-bold text-sm uppercase mb-1">{format(new Date(), 'MMMM')}</span>
                        <span className="text-5xl font-bold text-gray-900 mb-2">{format(new Date(), 'd')}</span>
                        <span className="text-gray-500 font-medium">{format(new Date(), 'EEEE')}</span>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Recordings</h3>
                      <div className="space-y-4">
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3 group cursor-pointer hover:bg-white hover:shadow-md transition-all">
                          <div className="w-10 h-10 bg-accent-red/10 text-accent-red rounded-xl flex items-center justify-center">
                            <Video size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">Product Demo</p>
                            <p className="text-[10px] text-gray-500">Oct 14, 2023 • 45 MB</p>
                          </div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3 group cursor-pointer hover:bg-white hover:shadow-md transition-all">
                          <div className="w-10 h-10 bg-accent-red/10 text-accent-red rounded-xl flex items-center justify-center">
                            <Video size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">Weekly Sync</p>
                            <p className="text-[10px] text-gray-500">Oct 12, 2023 • 120 MB</p>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setActiveSidebarTab('meetings');
                          setMeetingSubTab('recordings');
                        }}
                        className="w-full mt-4 py-2 text-sm font-bold text-accent-blue hover:bg-accent-blue/5 rounded-xl transition-all"
                      >
                        View all recordings
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeSidebarTab === 'calendar' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Calendar</h2>
                  <div className="flex items-center gap-3">
                    <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-600">
                      <ChevronRight className="rotate-180" size={20} />
                    </button>
                    <span className="font-bold text-gray-900">{format(new Date(), 'MMMM yyyy')}</span>
                    <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-600">
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
                
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-gray-100">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 grid-rows-5 h-[600px]">
                    {Array.from({ length: 35 }).map((_, i) => {
                      const day = i - 2; // Simple offset for demo
                      const isToday = day === new Date().getDate();
                      const dayMeetings = meetings.filter(m => m.startTime.getDate() === day && m.startTime.getMonth() === new Date().getMonth());
                      
                      return (
                        <div key={i} className={cn(
                          "border-r border-b border-gray-50 p-4 transition-all hover:bg-gray-50/50 cursor-pointer group",
                          day < 1 || day > 31 ? "bg-gray-50/30" : ""
                        )}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={cn(
                              "text-sm font-bold",
                              isToday ? "w-7 h-7 bg-accent-blue text-white rounded-full flex items-center justify-center" : "text-gray-900"
                            )}>
                              {day > 0 && day <= 31 ? day : ''}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {dayMeetings.slice(0, 2).map(m => (
                              <div key={m.id} className="px-2 py-1 bg-accent-blue/10 text-accent-blue text-[10px] font-bold rounded-md truncate">
                                {format(m.startTime, 'HH:mm')} {m.title}
                              </div>
                            ))}
                            {dayMeetings.length > 2 && (
                              <div className="text-[10px] text-gray-400 font-bold pl-1">
                                +{dayMeetings.length - 2} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {activeSidebarTab === 'meetings' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Meetings</h2>
                  <div className="flex p-1 bg-gray-100 rounded-xl">
                    <button 
                      onClick={() => setMeetingSubTab('upcoming')}
                      className={cn(
                        "px-4 py-2 rounded-lg font-bold text-sm transition-all",
                        meetingSubTab === 'upcoming' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Upcoming
                    </button>
                    <button 
                      onClick={() => setMeetingSubTab('previous')}
                      className={cn(
                        "px-4 py-2 rounded-lg font-bold text-sm transition-all",
                        meetingSubTab === 'previous' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Previous
                    </button>
                    <button 
                      onClick={() => setMeetingSubTab('recordings')}
                      className={cn(
                        "px-4 py-2 rounded-lg font-bold text-sm transition-all",
                        meetingSubTab === 'recordings' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Recordings
                    </button>
                  </div>
                </div>
                
                {meetingSubTab === 'upcoming' && (
                  <div className="space-y-4">
                    {meetings.length === 0 ? (
                      <div className="p-12 text-center text-gray-500">No upcoming meetings.</div>
                    ) : (
                      meetings.map(meeting => (
                        <MeetingCard 
                          key={meeting.id} 
                          meeting={meeting} 
                          onJoin={() => joinMeeting(meeting.roomId)}
                        />
                      ))
                    )}
                  </div>
                )}

                {meetingSubTab === 'previous' && (
                  <div className="p-12 bg-white rounded-3xl border border-dashed border-gray-200 text-center text-gray-500">
                    No previous meetings found in your history.
                  </div>
                )}

                {meetingSubTab === 'recordings' && (
                  <div className="p-12 bg-white rounded-3xl border border-dashed border-gray-200 text-center text-gray-500">
                    Cloud recordings will appear here once available.
                  </div>
                )}
              </div>
            )}

            {activeSidebarTab === 'contacts' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Contacts</h2>
                  <button className="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-xl font-bold text-sm">
                    <Plus size={18} />
                    Add Contact
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 hover:shadow-md transition-all cursor-pointer">
                      <img src={`https://picsum.photos/seed/user${i}/40/40`} className="w-12 h-12 rounded-xl" alt="Contact" />
                      <div>
                        <p className="font-bold text-gray-900">Contact Name {i}</p>
                        <p className="text-xs text-gray-500">Available</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSidebarTab === 'notes' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Notes</h2>
                  <button className="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-xl font-bold text-sm">
                    <Plus size={18} />
                    New Note
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {['Meeting Notes', 'Brainstorming', 'Personal Tasks'].map((title, i) => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4 hover:shadow-md transition-all cursor-pointer">
                      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-accent-blue">
                        <FileText size={20} />
                      </div>
                      <h4 className="font-bold text-gray-900">{title}</h4>
                      <p className="text-sm text-gray-500 line-clamp-3">This is a sample note content to show how it looks in the grid view of the notes section.</p>
                      <p className="text-[10px] text-gray-400">Last edited 2 days ago</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSidebarTab === 'whiteboard' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Whiteboards</h2>
                  <button className="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-xl font-bold text-sm">
                    <Plus size={18} />
                    New Whiteboard
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2].map(i => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4 hover:shadow-md transition-all cursor-pointer group">
                      <div className="aspect-video bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 group-hover:bg-accent-blue/5 transition-colors">
                        <Monitor size={48} strokeWidth={1} />
                      </div>
                      <h4 className="font-bold text-gray-900">Whiteboard {i}</h4>
                      <p className="text-[10px] text-gray-400">Created {i} day{i > 1 ? 's' : ''} ago</p>
                    </div>
                  ))}
                  <div className="bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center p-6 text-gray-400 hover:border-accent-blue hover:text-accent-blue transition-all cursor-pointer">
                    <Plus size={32} />
                    <span className="mt-2 font-bold">Create New</span>
                  </div>
                </div>
              </div>
            )}

            {activeSidebarTab === 'settings' && (
              <div className="max-w-2xl space-y-8">
                <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4">
                    <h3 className="font-bold text-gray-900">Profile Settings</h3>
                    <div className="flex items-center gap-4">
                      <img src={user?.photoURL || ''} className="w-16 h-16 rounded-2xl" alt="Profile" />
                      <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm">Change Photo</button>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Display Name</label>
                      <input type="text" defaultValue={user?.displayName || ''} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl outline-none" />
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4">
                    <h3 className="font-bold text-gray-900">Meeting Settings</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Always mute microphone when joining</span>
                      <div className="w-10 h-5 bg-gray-200 rounded-full relative"><div className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full" /></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Always turn off video when joining</span>
                      <div className="w-10 h-5 bg-accent-blue rounded-full relative"><div className="absolute top-1 right-1 w-3 h-3 bg-white rounded-full" /></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Join Meeting Modal */}
      <AnimatePresence>
        {isJoining && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Join Meeting</h2>
                  <button onClick={() => setIsJoining(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                    <X size={20} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Meeting ID or Link</label>
                    <input 
                      type="text" 
                      placeholder="Enter meeting code"
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => joinMeeting(joinCode)}
                    disabled={!joinCode.trim()}
                    className="w-full py-4 bg-accent-blue text-white rounded-2xl font-bold shadow-lg shadow-accent-blue/20 hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50"
                  >
                    Join
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Screen Modal */}
      <AnimatePresence>
        {isSharing && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6 text-center">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Share Screen</h2>
                  <button onClick={() => setIsSharing(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                    <X size={20} />
                  </button>
                </div>
                <div className="py-8 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center">
                    <Monitor size={40} />
                  </div>
                  <p className="text-gray-600">Enter a meeting ID to start sharing your screen.</p>
                  <input 
                    type="text" 
                    placeholder="Meeting ID"
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none text-center"
                  />
                </div>
                <button 
                  className="w-full py-4 bg-orange-500 text-white rounded-2xl font-bold shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95"
                >
                  Share Screen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Scheduling Modal */}
      <AnimatePresence>
        {isScheduling && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Schedule Meeting</h2>
                  <button onClick={() => setIsScheduling(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSchedule} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Meeting Title</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Weekly Sync"
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                      value={newMeeting.title}
                      onChange={e => setNewMeeting(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date</label>
                      <input 
                        type="date" 
                        required
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                        value={newMeeting.date}
                        onChange={e => setNewMeeting(prev => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Time</label>
                      <input 
                        type="time" 
                        required
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                        value={newMeeting.time}
                        onChange={e => setNewMeeting(prev => ({ ...prev, time: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
                    <textarea 
                      placeholder="Optional meeting details..."
                      rows={3}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none resize-none"
                      value={newMeeting.description}
                      onChange={e => setNewMeeting(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-4 bg-accent-blue text-white rounded-2xl font-bold shadow-lg shadow-accent-blue/20 hover:bg-blue-600 transition-all active:scale-95 mt-4"
                  >
                    Schedule
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
        active ? "bg-accent-blue/10 text-accent-blue" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function QuickActionCard({ icon, label, sub, color, onClick }: { icon: React.ReactNode, label: string, sub: string, color: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-left group active:scale-[0.98]"
    >
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform", color)}>
        {icon}
      </div>
      <h4 className="font-bold text-gray-900">{label}</h4>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </button>
  );
}

function MeetingCard({ meeting, onJoin }: { meeting: Meeting, onJoin: () => void, key?: string }) {
  const isNow = Math.abs(meeting.startTime.getTime() - Date.now()) < 15 * 60 * 1000;

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0",
            isNow ? "bg-accent-blue text-white" : "bg-gray-50 text-gray-400"
          )}>
            <span className="text-[10px] font-bold uppercase">{format(meeting.startTime, 'MMM')}</span>
            <span className="text-xl font-bold leading-none">{format(meeting.startTime, 'dd')}</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-gray-900 group-hover:text-accent-blue transition-colors">{meeting.title}</h4>
              {meeting.isKomu && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-600 text-[10px] font-bold rounded-full">KOMU</span>
              )}
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Clock size={14} />
              {format(meeting.startTime, 'hh:mm a')} • {meeting.hostName}
            </p>
            {meeting.notes && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg w-fit">
                <FileText size={12} />
                <span className="truncate max-w-[200px] italic">Note: {meeting.notes.substring(0, 30)}...</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onJoin}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold transition-all active:scale-95",
              isNow 
                ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20 hover:bg-blue-600" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {isNow ? 'Join Now' : 'Join'}
          </button>
          <button className="p-2.5 text-gray-400 hover:bg-gray-100 rounded-xl transition-all">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteItem({ title, date }: { title: string, date: string }) {
  return (
    <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-all cursor-pointer group">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-100 rounded-lg text-gray-400 group-hover:bg-accent-blue/10 group-hover:text-accent-blue transition-all">
          <FileText size={16} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{title}</p>
          <p className="text-[10px] text-gray-400">{date}</p>
        </div>
      </div>
      <ChevronRight size={16} className="text-gray-300" />
    </div>
  );
}

function Monitor({ size, className, strokeWidth = 2 }: { size?: number, className?: string, strokeWidth?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={strokeWidth} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}
