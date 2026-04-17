import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Whiteboard from '../components/Whiteboard';
import { 
  Video, Calendar, Plus, Search, Settings, Clock, 
  MessageSquare, Users, ChevronRight, LogOut, 
  LayoutDashboard, FileText, Bell, RefreshCw, X, MoreVertical,
  Copy, Check, Monitor, ChevronLeft, Calendar as CalendarIcon,
  Filter, Grid, List as ListIcon, Trash2, Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { db, auth, komuDb, komuAuth, googleProvider } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, Timestamp, orderBy, doc, setDoc, writeBatch } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSidebarTab, setActiveSidebarTab] = useState<'dashboard' | 'meetings' | 'contacts' | 'notes' | 'settings' | 'whiteboard' | 'calendar'>('dashboard');
  const [meetingSubTab, setMeetingSubTab] = useState<'upcoming' | 'previous' | 'recordings'>('upcoming');
  const [userStatus, setUserStatus] = useState<'available' | 'away' | 'busy' | 'offline'>('available');
  const [searchQuery, setSearchQuery] = useState('');
  const [isJoinMeetingModalOpen, setIsJoinMeetingModalOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [newMeeting, setNewMeeting] = useState({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), time: format(new Date(), 'HH:mm') });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [isNewMeetingMenuOpen, setIsNewMeetingMenuOpen] = useState(false);
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [newContact, setNewContact] = useState({ displayName: '', email: '' });
  const [editingNote, setEditingNote] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');
  const [settings, setSettings] = useState({
    muteOnJoin: false,
    videoOffOnJoin: false,
    mirrorVideo: true,
  });

  useEffect(() => {
    if (!user) return;
    
    // Load local settings
    const savedSettings = localStorage.getItem(`settings_${user.uid}`);
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    // Fetch user profile for status
    const profileUnsubscribe = onSnapshot(doc(db, 'userProfiles', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.status) setUserStatus(data.status);
      }
    });

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
    if (user) {
      syncKomuCalendar();
    }

    return () => unsubscribe();
  }, [user]);

  // Fetch Contacts
  useEffect(() => {
    if (!user || activeSidebarTab !== 'contacts') return;
    const q = query(collection(db, 'contacts'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user, activeSidebarTab]);

  // Fetch Notes
  useEffect(() => {
    if (!user || activeSidebarTab !== 'notes') return;
    const q = query(collection(komuDb, 'notes'), where('uid', '==', user.uid), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user, activeSidebarTab]);

  const [recordings, setRecordings] = useState<any[]>([]);
  
  // Fetch Recordings
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'recordings'), where('participants', 'array-contains', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecordings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user]);

  const handleStatusChange = async (status: 'available' | 'away' | 'busy' | 'offline') => {
    setUserStatus(status);
    if (!user) return;
    try {
      await setDoc(doc(db, 'userProfiles', user.uid), { status }, { merge: true });
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleAddContact = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !newContact.email) return;
    try {
      await addDoc(collection(db, 'contacts'), {
        ...newContact,
        ownerId: user.uid,
        createdAt: Timestamp.now()
      });
      setIsAddContactModalOpen(false);
      setNewContact({ displayName: '', email: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'contacts');
    }
  };

  const handleUpdateNote = async (note: any) => {
    if (!user) return;
    try {
      await setDoc(doc(komuDb, 'notes', note.id), {
        ...note,
        updatedAt: Timestamp.now()
      }, { merge: true });
      setEditingNote(null);
    } catch (err) {
      console.error("Failed to update note:", err);
    }
  };

  const saveSettings = (newSettings: any) => {
    setSettings(newSettings);
    if (user) {
      localStorage.setItem(`settings_${user.uid}`, JSON.stringify(newSettings));
    }
  };

  const syncKomuCalendar = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const uid = komuAuth.currentUser?.uid || user.uid;
      const q = query(collection(komuDb, 'events'), where('uid', '==', uid));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const komuMeetings = snapshot.docs
          .map(doc => {
            const data = doc.data();
            const isEvent = data.type === 'event';
            const hasMeetingTag = data.title?.toLowerCase().includes('meeting') || 
                                 data.description?.toLowerCase().includes('meeting') ||
                                 (data.tags && data.tags.includes('meeting'));
            
            if (!isEvent && !hasMeetingTag) return null;

            return {
              id: doc.id,
              title: data.title,
              description: data.description,
              startTime: data.start?.toDate() || new Date(),
              roomId: data.roomId || doc.id,
              hostId: data.uid,
              hostName: 'Komu User',
              notes: data.description,
              isKomu: true
            };
          })
          .filter(m => m !== null) as Meeting[];

        setMeetings(prev => {
          const localOnes = prev.filter(m => !m.isKomu);
          return [...localOnes, ...komuMeetings].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        });
      }, (err) => {
        if (err.message.includes('permission')) {
          console.warn("[Dashboard] Komu Sync Permissions Restricted.");
        } else {
          handleFirestoreError(err, OperationType.LIST, 'komu/events');
        }
      });
    } catch (err) {
      console.error("Komu Sync Failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  const syncGoogleCalendar = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (!token) throw new Error("No access token");

      // Fetch from Google Calendar
      const now = new Date();
      const timeMin = now.toISOString();
      const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&singleEvents=true&orderBy=startTime`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!resp.ok) throw new Error("Google Calendar API failed");
      const data = await resp.json();
      
      const batch = writeBatch(db);
      data.items?.forEach((item: any) => {
        if (!item.start) return;
        const eventRef = doc(collection(db, 'meetings'));
        batch.set(eventRef, {
          title: item.summary || 'Google Event',
          description: item.description || '',
          startTime: Timestamp.fromDate(new Date(item.start.dateTime || item.start.date)),
          roomId: item.id,
          hostId: user.uid,
          hostName: 'Google Calendar',
          participants: [user.uid],
          isGoogle: true,
          createdAt: Timestamp.now()
        });
      });
      await batch.commit();
      alert("Google Calendar synced!");
    } catch (err) {
      console.error("Google Sync Failed:", err);
      alert("Sync failed. Ensure you granted permissions.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSchedule = async (e: FormEvent) => {
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
    <div className="min-h-screen bg-[#f8f9fa] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex sticky top-0 h-screen">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-accent-blue rounded-xl flex items-center justify-center shadow-lg shadow-accent-blue/20">
            <Video className="text-white" size={24} />
          </div>
          <span className="text-2xl font-bold text-gray-900 tracking-tight">Forum</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
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
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search meetings, notes..." 
                className="w-full pl-12 pr-4 py-2.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-all">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-accent-red rounded-full border-2 border-white" />
            </button>
            <div className="flex items-center gap-3 pl-6 border-l border-gray-100">
              <div className="text-right hidden sm:block">
                <div className="flex items-center justify-end gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    userStatus === 'available' ? "bg-success-green" :
                    userStatus === 'away' ? "bg-orange-400" :
                    userStatus === 'busy' ? "bg-accent-red" : "bg-gray-400"
                  )} />
                  <p className="text-sm font-bold text-gray-900">{user?.displayName}</p>
                </div>
                <select 
                  className="text-[10px] text-gray-500 bg-transparent border-none outline-none cursor-pointer p-0 h-auto"
                  value={userStatus}
                  onChange={(e) => handleStatusChange(e.target.value as any)}
                >
                  <option value="available">Available</option>
                  <option value="away">Away</option>
                  <option value="busy">Busy</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
              <img 
                src={user?.photoURL || `https://picsum.photos/seed/${user?.uid}/40/40`} 
                alt="Avatar" 
                className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scroll">
          <div className="max-w-6xl mx-auto space-y-10">
            {activeSidebarTab === 'dashboard' && (
              <>
                {/* Welcome Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome back, {user?.displayName?.split(' ')[0]}!</h2>
                    <div className="flex items-center gap-4 mt-2">
                      <p className="text-gray-500">You have {meetings.filter(m => isToday(m.startTime)).length} meetings scheduled for today.</p>
                      <div className="h-4 w-px bg-gray-200" />
                      <p className="text-gray-500">{format(new Date(), 'EEEE, MMMM do')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={syncGoogleCalendar}
                      disabled={syncing}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-all disabled:opacity-50"
                    >
                      <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png" className="w-5 h-5" alt="Google" />
                      Sync Google
                    </button>
                    <button 
                      onClick={syncKomuCalendar}
                      disabled={syncing}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-all disabled:opacity-50"
                    >
                      <RefreshCw size={18} className={cn(syncing && "animate-spin")} />
                      Sync Komu
                    </button>
                    <button 
                      onClick={() => setIsScheduling(true)}
                      className="flex items-center gap-2 px-6 py-2.5 bg-accent-blue text-white rounded-xl font-bold shadow-lg shadow-accent-blue/20 hover:bg-blue-600 transition-all active:scale-95"
                    >
                      <Plus size={20} />
                      Schedule Meeting
                    </button>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="relative">
                    <QuickActionCard 
                      icon={<Plus size={24} />} 
                      label="New Meeting" 
                      sub="Start an instant meeting" 
                      color="bg-accent-blue"
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
                    color="bg-success-green"
                    onClick={() => setIsJoinMeetingModalOpen(true)}
                  />
                  <QuickActionCard 
                    icon={<Calendar size={24} />} 
                    label="Schedule" 
                    sub="Plan a future meeting" 
                    color="bg-purple-500"
                    onClick={() => setIsScheduling(true)}
                  />
                  <QuickActionCard 
                    icon={<Monitor size={24} />} 
                    label="Share Screen" 
                    sub="Present in a meeting" 
                    color="bg-orange-500"
                    onClick={() => setIsSharing(true)}
                  />
                </div>

                {/* Personal Meeting Room */}
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-accent-blue">
                      <Video size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Personal Meeting Room</h3>
                      <p className="text-sm text-gray-500">Your permanent meeting link for quick syncs.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex-1 md:flex-none px-4 py-2 bg-gray-50 rounded-xl text-sm font-mono text-gray-600 border border-gray-100">
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
                      className="px-6 py-2 bg-accent-blue text-white rounded-xl font-bold text-sm shadow-lg shadow-accent-blue/20"
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
                        {recordings.length === 0 ? (
                          <div className="p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center">
                            <Video className="text-gray-300 mx-auto mb-2" size={24} />
                            <p className="text-xs text-gray-500">No recordings yet.</p>
                          </div>
                        ) : (
                          recordings.slice(0, 3).map(rec => (
                            <div key={rec.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3 group cursor-pointer hover:bg-white hover:shadow-md transition-all">
                              <div className="w-10 h-10 bg-accent-red/10 text-accent-red rounded-xl flex items-center justify-center">
                                <Video size={18} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{rec.title || 'Meeting Recording'}</p>
                                <p className="text-[10px] text-gray-500">
                                  {rec.createdAt?.toDate ? format(rec.createdAt.toDate(), 'MMM d, yyyy') : 'Recently'}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
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
              <div className="space-y-6 h-full flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-gray-900">Calendar</h2>
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                      <button 
                        onClick={() => setCalendarView('month')}
                        className={cn("px-4 py-1.5 rounded-lg text-sm font-bold transition-all", calendarView === 'month' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500")}
                      >
                        Month
                      </button>
                      <button 
                        onClick={() => setCalendarView('week')}
                        className={cn("px-4 py-1.5 rounded-lg text-sm font-bold transition-all", calendarView === 'week' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500")}
                      >
                        Week
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-2 py-1 shadow-sm">
                      <button onClick={() => {
                        const d = new Date(selectedDate);
                        if (calendarView === 'month') d.setMonth(d.getMonth() - 1);
                        else d.setDate(d.getDate() - 7);
                        setSelectedDate(d);
                      }} className="p-1.5 hover:bg-gray-50 rounded-lg"><ChevronLeft size={18} /></button>
                      <span className="text-sm font-bold px-2 whitespace-nowrap">{format(selectedDate, calendarView === 'month' ? 'MMMM yyyy' : 'MMM d')}</span>
                      <button onClick={() => {
                        const d = new Date(selectedDate);
                        if (calendarView === 'month') d.setMonth(d.getMonth() + 1);
                        else d.setDate(d.getDate() + 7);
                        setSelectedDate(d);
                      }} className="p-1.5 hover:bg-gray-50 rounded-lg"><ChevronRight size={18} /></button>
                    </div>
                    <button 
                      onClick={() => setIsScheduling(true)}
                      className="px-6 py-2.5 bg-accent-blue text-white rounded-xl font-bold text-sm shadow-md"
                    >
                      New Event
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  {calendarView === 'month' ? (
                    <CalendarMonthView selectedDate={selectedDate} meetings={meetings} />
                  ) : (
                    <CalendarWeekView selectedDate={selectedDate} meetings={meetings} />
                  )}
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
                  <div className="space-y-4">
                    {recordings.length === 0 ? (
                      <div className="p-12 bg-white rounded-3xl border border-dashed border-gray-200 text-center text-gray-500">
                        Cloud recordings will appear here once available.
                      </div>
                    ) : (
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {recordings.map(rec => (
                          <div key={rec.id} className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4 hover:shadow-md transition-all cursor-pointer group">
                             <div className="aspect-video bg-gray-50 rounded-2xl flex items-center justify-center text-accent-red group-hover:bg-accent-red group-hover:text-white transition-all overflow-hidden relative">
                                <Video size={32} />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                   <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-accent-blue shadow-lg">
                                      <Video size={20} fill="currentColor" />
                                   </div>
                                </div>
                             </div>
                             <h4 className="font-bold text-gray-900 line-clamp-1">{rec.title || 'Meeting Recording'}</h4>
                             <p className="text-xs text-gray-500">
                                {rec.createdAt?.toDate ? format(rec.createdAt.toDate(), 'MMMM d, yyyy • h:mm a') : 'Recently'}
                             </p>
                          </div>
                        ))}
                       </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSidebarTab === 'contacts' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Contacts</h2>
                    <button 
                      onClick={() => setIsAddContactModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-xl font-bold text-sm hover:bg-blue-600 transition-all"
                    >
                    <Plus size={18} />
                    Add Contact
                  </button>
                </div>
                {contacts.length === 0 ? (
                  <div className="p-12 bg-white rounded-3xl border border-dashed border-gray-200 text-center space-y-4">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                      <Users className="text-gray-300" size={32} />
                    </div>
                    <p className="text-gray-500 font-medium">No contacts imported yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {contacts.map(contact => (
                      <div key={contact.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 hover:shadow-md transition-all cursor-pointer group">
                        <img 
                          src={contact.photoURL || `https://picsum.photos/seed/${contact.id}/40/40`} 
                          className="w-12 h-12 rounded-xl object-cover" 
                          alt="Contact" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex-1">
                          <p className="font-bold text-gray-900 group-hover:text-accent-blue transition-colors">{contact.displayName}</p>
                          <p className="text-xs text-gray-500">{contact.email}</p>
                        </div>
                        <button className="p-2 text-gray-400 hover:text-accent-blue transition-colors">
                          <MessageSquare size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSidebarTab === 'notes' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Notes from Komu</h2>
                  <button 
                    onClick={() => window.open('https://komu-notes.web.app', '_blank')}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-xl font-bold text-sm hover:bg-blue-600 transition-all"
                  >
                    <Plus size={18} />
                    Manage in Komu
                  </button>
                </div>
                {notes.length === 0 ? (
                  <div className="p-12 bg-white rounded-3xl border border-dashed border-gray-200 text-center space-y-4">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                      <FileText className="text-gray-300" size={32} />
                    </div>
                    <p className="text-gray-500 font-medium">No notes found in your Komu account.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {notes.map(note => (
                      <div 
                        key={note.id} 
                        onClick={() => setEditingNote(note)}
                        className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-accent-blue group-hover:bg-accent-blue group-hover:text-white transition-all">
                          <FileText size={20} />
                        </div>
                        <h4 className="font-bold text-gray-900 line-clamp-1">{note.title || 'Untitled'}</h4>
                        <p className="text-sm text-gray-500 line-clamp-3">{note.body || 'No content'}</p>
                        <p className="text-[10px] text-gray-400">
                          Last edited {note.updatedAt?.toDate ? format(note.updatedAt.toDate(), 'MMM d, yyyy') : 'Recently'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSidebarTab === 'whiteboard' && (
              <div className="h-full flex flex-col space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Whiteboard</h2>
                </div>
                <div className="flex-1 min-h-[600px]">
                  <Whiteboard />
                </div>
              </div>
            )}

            {activeSidebarTab === 'settings' && (
              <div className="max-w-2xl space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                  <button 
                    onClick={() => saveSettings(settings)}
                    className="px-6 py-2 bg-accent-blue text-white rounded-xl font-bold text-sm shadow-md"
                  >
                    Save Changes
                  </button>
                </div>
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4">
                    <h3 className="font-bold text-gray-900">Profile Settings</h3>
                    <div className="flex items-center gap-4">
                      <img src={user?.photoURL || ''} className="w-16 h-16 rounded-2xl object-cover" alt="Profile" referrerPolicy="no-referrer" />
                      <div className="space-y-1">
                        <p className="font-bold text-gray-900">{user?.displayName}</p>
                        <p className="text-sm text-gray-500">{user?.email}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Display Name</label>
                      <input 
                        type="text" 
                        defaultValue={user?.displayName || ''} 
                        readOnly
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl outline-none text-gray-400 cursor-not-allowed" 
                      />
                      <p className="text-[10px] text-gray-400 italic">Managed by Google Account</p>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4">
                    <h3 className="font-bold text-gray-900">Meeting Experience</h3>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-gray-900">Always mute microphone</span>
                        <p className="text-[10px] text-gray-500">Mute yourself automatically when joining a call</p>
                      </div>
                      <button 
                        onClick={() => saveSettings({ ...settings, muteOnJoin: !settings.muteOnJoin })}
                        className={cn("w-10 h-5 rounded-full relative transition-all", settings.muteOnJoin ? "bg-accent-blue" : "bg-gray-200")}
                      >
                        <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all", settings.muteOnJoin ? "right-1" : "left-1")} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-gray-900">Always turn off video</span>
                        <p className="text-[10px] text-gray-500">Join meetings with your camera disabled</p>
                      </div>
                      <button 
                        onClick={() => saveSettings({ ...settings, videoOffOnJoin: !settings.videoOffOnJoin })}
                        className={cn("w-10 h-5 rounded-full relative transition-all", settings.videoOffOnJoin ? "bg-accent-blue" : "bg-gray-200")}
                      >
                        <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all", settings.videoOffOnJoin ? "right-1" : "left-1")} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-gray-900">Mirror my video</span>
                        <p className="text-[10px] text-gray-500">See a mirrored view of your own camera</p>
                      </div>
                      <button 
                        onClick={() => saveSettings({ ...settings, mirrorVideo: !settings.mirrorVideo })}
                        className={cn("w-10 h-5 rounded-full relative transition-all", settings.mirrorVideo ? "bg-accent-blue" : "bg-gray-200")}
                      >
                        <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all", settings.mirrorVideo ? "right-1" : "left-1")} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {isAddContactModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Add New Contact</h2>
                  <button onClick={() => setIsAddContactModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleAddContact} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Name</label>
                    <input 
                      type="text" 
                      required
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                      value={newContact.displayName}
                      onChange={e => setNewContact(prev => ({ ...prev, displayName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
                    <input 
                      type="email" 
                      required
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                      value={newContact.email}
                      onChange={e => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-4 bg-accent-blue text-white rounded-2xl font-bold shadow-lg shadow-accent-blue/20"
                  >
                    Add Contact
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Note Modal */}
      <AnimatePresence>
        {editingNote && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl h-[80vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Edit Note</h2>
                  <p className="text-xs text-gray-400 mt-1">Changes are saved automatically</p>
                </div>
                <button onClick={() => setEditingNote(null)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 p-8 overflow-y-auto space-y-6">
                <input 
                  type="text"
                  value={editingNote.title}
                  onChange={e => setEditingNote({ ...editingNote, title: e.target.value })}
                  placeholder="Note Title"
                  className="text-3xl font-bold text-gray-900 border-none outline-none w-full bg-transparent"
                />
                <textarea 
                  value={editingNote.body}
                  onChange={e => setEditingNote({ ...editingNote, body: e.target.value })}
                  placeholder="Start writing..."
                  className="w-full flex-1 min-h-[400px] border-none outline-none resize-none text-gray-700 leading-relaxed text-lg"
                />
              </div>
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                <button 
                  onClick={() => setEditingNote(null)}
                  className="px-6 py-2.5 text-gray-500 font-bold"
                >
                  Close
                </button>
                <button 
                  onClick={() => handleUpdateNote(editingNote)}
                  className="px-8 py-2.5 bg-accent-blue text-white rounded-xl font-bold shadow-lg shadow-accent-blue/20"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Join Meeting Modal */}
      <AnimatePresence>
        {isJoinMeetingModalOpen && (
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
                  <button onClick={() => setIsJoinMeetingModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                    <X size={20} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Meeting ID or Link</label>
                    <input 
                      type="text" 
                      placeholder="Enter ID or link"
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => {
                      if (joinCode) {
                        joinMeeting(joinCode.includes('/') ? joinCode.split('/').pop() || '' : joinCode);
                        setIsJoinMeetingModalOpen(false);
                      }
                    }}
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
                <div className="flex items-center justify-between text-left">
                  <h2 className="text-2xl font-bold text-gray-900">Share Screen</h2>
                  <button onClick={() => setIsSharing(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                    <X size={20} />
                  </button>
                </div>
                <div className="py-8 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center">
                    <Monitor size={40} />
                  </div>
                  <p className="text-gray-600 text-sm">Enter a meeting ID to start sharing your screen instantly.</p>
                  <input 
                    type="text" 
                    placeholder="Meeting ID (optional)"
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500/20 outline-none text-center font-bold"
                    value={shareCode}
                    onChange={e => setShareCode(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400 italic">If left blank, a new meeting will be created.</p>
                </div>
                <button 
                  onClick={() => {
                    const target = shareCode || Math.random().toString(36).substring(2, 12);
                    navigate(`/meeting/${target}?share=true`);
                    setIsSharing(false);
                  }}
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

function SidebarItem({ icon, label, active = false, onClick }: { icon: import('react').ReactNode, label: string, active?: boolean, onClick?: () => void }) {
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

function QuickActionCard({ icon, label, sub, color, onClick }: { icon: import('react').ReactNode, label: string, sub: string, color: string, onClick?: () => void }) {
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

function CalendarMonthView({ selectedDate, meetings }: { selectedDate: Date, meetings: Meeting[] }) {
  const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const totalCells = 42;

  const daysHeader = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="grid grid-cols-7 border-b border-gray-100">
        {daysHeader.map(day => (
          <div key={day} className="py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">{day}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 border-collapse overflow-y-auto">
        {Array.from({ length: totalCells }).map((_, i) => {
          const date = i - firstDay + 1;
          const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), date);
          const isDiffMonth = d.getMonth() !== selectedDate.getMonth();
          const isToday = d.toDateString() === new Date().toDateString();
          
          const dayMeetings = meetings.filter(m => 
            m.startTime.getDate() === d.getDate() && 
            m.startTime.getMonth() === d.getMonth() &&
            m.startTime.getFullYear() === d.getFullYear()
          );

          return (
            <div key={i} className={cn(
              "border-r border-b border-gray-50 min-h-[100px] p-2 hover:bg-gray-50/50 transition-all",
              isDiffMonth && "bg-gray-50/20 text-gray-300"
            )}>
              <span className={cn(
                "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-md",
                isToday ? "bg-accent-blue text-white" : isDiffMonth ? "text-gray-300" : "text-gray-900"
              )}>{d.getDate()}</span>
              <div className="space-y-1 mt-1">
                {dayMeetings.map(m => (
                  <div key={m.id} className="text-[10px] p-1 bg-accent-blue/5 text-accent-blue rounded border border-accent-blue/10 truncate font-semibold">
                    {format(m.startTime, 'h:mm a')} {m.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarWeekView({ selectedDate, meetings }: { selectedDate: Date, meetings: Meeting[] }) {
  const startDay = new Date(selectedDate);
  startDay.setDate(startDay.getDate() - startDay.getDay()); // Sunday

  const hours = Array.from({ length: 24 }).map((_, i) => i);
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startDay);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="grid grid-cols-[80px_1fr] border-b border-gray-100">
        <div />
        <div className="grid grid-cols-7">
          {days.map(day => (
            <div key={day.toString()} className="py-4 text-center border-l border-gray-50">
              <p className="text-[10px] font-bold text-gray-400 uppercase">{format(day, 'EEE')}</p>
              <p className={cn("text-lg font-bold", day.toDateString() === new Date().toDateString() ? "text-accent-blue" : "text-gray-900")}>{day.getDate()}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto grid grid-cols-[80px_1fr] custom-scroll relative">
        <div className="border-r border-gray-100">
          {hours.map(h => (
            <div key={h} className="h-20 text-[10px] font-bold text-gray-400 p-2 text-right">
              {h}:00 {h >= 12 ? 'PM' : 'AM'}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 relative">
          {days.map((day, di) => (
            <div key={day.toString()} className="border-l border-gray-100 relative">
              {hours.map(h => <div key={h} className="h-20 border-b border-gray-50" />)}
              {meetings
                .filter(m => m.startTime.toDateString() === day.toDateString())
                .map(m => {
                  const top = (m.startTime.getHours() * 60 + m.startTime.getMinutes()) / (24 * 60) * 100;
                  return (
                    <div 
                      key={m.id}
                      className="absolute left-1 right-1 bg-accent-blue/10 border-l-4 border-accent-blue p-2 rounded shadow-sm z-10"
                      style={{ top: `${top}%`, height: '80px' }}
                    >
                      <p className="text-[10px] font-bold text-accent-blue truncate">{m.title}</p>
                      <p className="text-[8px] text-gray-500">{format(m.startTime, 'h:mm a')}</p>
                    </div>
                  );
                })}
            </div>
          ))}
          {/* Current Time Indicator */}
          {days.some(d => d.toDateString() === new Date().toDateString()) && (
            <div 
              className="absolute left-0 right-0 h-0.5 bg-accent-red z-20 pointer-events-none"
              style={{ top: `${(new Date().getHours() * 60 + new Date().getMinutes()) / (24 * 60) * 100}%` }}
            >
              <div className="w-2 h-2 bg-accent-red rounded-full -mt-0.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
