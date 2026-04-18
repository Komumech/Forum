import * as React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Whiteboard from '../components/Whiteboard.tsx';
import { 
  Video, Calendar, Plus, Search, Settings, Clock, 
  MessageSquare, Users, ChevronRight, LogOut, 
  LayoutDashboard, FileText, Bell, RefreshCw, X, MoreVertical,
  Copy, Check, Monitor, ChevronLeft, Calendar as CalendarIcon,
  Filter, Grid, List as ListIcon, Trash2, Edit2, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { db, auth, komuDb, komuAuth, googleProvider } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, Timestamp, orderBy, doc, setDoc, writeBatch, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
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
  isGoogle?: boolean;
  isMeeting?: boolean;
  type?: 'event' | 'task' | 'focus' | 'meeting';
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
  const [showPastInUpcoming, setShowPastInUpcoming] = useState(false);
  const [meetingsPage, setMeetingsPage] = useState(1);
  const meetingsPerPage = 6;
  const [joinCode, setJoinCode] = useState('');
  const [isNewMeetingMenuOpen, setIsNewMeetingMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [newContact, setNewContact] = useState({ displayName: '', email: '' });
  const [editingNote, setEditingNote] = useState<any>(null);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editMeetingForm, setEditMeetingForm] = useState({ title: '', description: '', date: '', time: '' });
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');
  const [showAllEvents, setShowAllEvents] = useState(true);
  const [settings, setSettings] = useState({
    muteOnJoin: false,
    videoOffOnJoin: false,
    mirrorVideo: true,
  });
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = React.useRef<HTMLDivElement>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      const localMeetings = snapshot.docs.map(doc => {
        const data = doc.data();
        const startTime = data.startTime.toDate();
        return {
          id: doc.id,
          ...data,
          startTime,
          endTime: data.endTime?.toDate() || new Date(startTime.getTime() + 3600000),
          notes: data.description || '', // Ensure notes/description are synced
        };
      }) as Meeting[];
      
      setMeetings(prev => {
        const komuOnes = prev.filter(m => m.isKomu);
        return [...localMeetings, ...komuOnes].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      });
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'meetings');
    });

    // Initial Komu Sync
    const komuUnsubscribe = syncKomuCalendar();

    return () => {
      unsubscribe();
      profileUnsubscribe();
      if (komuUnsubscribe && typeof komuUnsubscribe === 'function') komuUnsubscribe();
    };
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

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newContact.email) return;
    try {
      // Try to find if user exists to get their photo
      let photoURL = '';
      const profilesRef = collection(db, 'userProfiles');
      const q = query(profilesRef, where('email', '==', newContact.email));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        photoURL = snap.docs[0].data().photoURL || '';
        // Also update displayName if it's missing or generic
        if (!newContact.displayName || newContact.displayName === newContact.email) {
          newContact.displayName = snap.docs[0].data().displayName || newContact.displayName;
        }
      }

      await addDoc(collection(db, 'contacts'), {
        ...newContact,
        photoURL,
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

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!user) return;
    if (!confirm("Are you sure you want to delete this meeting?")) return;
    try {
      await deleteDoc(doc(db, 'meetings', meetingId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `meetings/${meetingId}`);
    }
  };

  const handleEditMeeting = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setEditMeetingForm({
      title: meeting.title,
      description: meeting.description || '',
      date: format(meeting.startTime, 'yyyy-MM-dd'),
      time: format(meeting.startTime, 'HH:mm')
    });
  };

  const handleUpdateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingMeeting) return;

    const startTime = new Date(`${editMeetingForm.date}T${editMeetingForm.time}`);
    const endTime = new Date(startTime.getTime() + (editingMeeting.endTime ? editingMeeting.endTime.getTime() - editingMeeting.startTime.getTime() : 3600000));
    
    try {
      if (editingMeeting.isKomu) {
        try {
          await updateDoc(doc(komuDb, 'events', editingMeeting.id), {
            title: editMeetingForm.title,
            description: editMeetingForm.description, // Synchronize notes/desc
            start: Timestamp.fromDate(startTime),
            end: Timestamp.fromDate(endTime),
            isMeeting: true, // Mark it so it stays a meeting
            updatedAt: Timestamp.now()
          });
        } catch (komuErr) {
          console.warn("Failed to sync update to Komu:", komuErr);
        }
      }

      // If it's a Google event and we have a token, try to update it there too
      // Note: This is an optimistic update, we don't block on Google API success
      if (editingMeeting.isGoogle && googleToken) {
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${editingMeeting.roomId}`, {
          method: 'PATCH',
          headers: { 
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: editMeetingForm.title,
            description: editMeetingForm.description,
            start: { dateTime: startTime.toISOString() },
            end: { dateTime: new Date(startTime.getTime() + 3600000).toISOString() }
          })
        }).catch(err => console.warn("Google Sync Update failed:", err));
      }

      await updateDoc(doc(db, 'meetings', editingMeeting.id), {
        title: editMeetingForm.title,
        description: editMeetingForm.description,
        notes: editMeetingForm.description, // Keep notes synced with description
        startTime: Timestamp.fromDate(startTime)
      });
      setEditingMeeting(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `meetings/${editingMeeting.id}`);
    }
  };

  const saveSettings = (newSettings: any) => {
    setSettings(newSettings);
    if (user) {
      localStorage.setItem(`settings_${user.uid}`, JSON.stringify(newSettings));
    }
  };

  const syncKomuCalendar = () => {
    if (!user) return;
    setSyncing(true);
    try {
      // Use the email as a fallback link if UIDs differ, but standard is using current user UID
      const uid = user.uid;
      const q = query(collection(komuDb, 'events'), where('uid', '==', uid));

      return onSnapshot(q, (snapshot) => {
        const komuMeetings = snapshot.docs
          .map(doc => {
            const data = doc.data();
            // Perfectly sync by including all events, identifying meetings specifically
            const isMeeting = data.type === 'meeting' || 
                                 data.isMeeting || 
                                 data.title?.toLowerCase().includes('meeting') || 
                                 data.description?.toLowerCase().includes('meeting') ||
                                 (data.tags && data.tags.includes('meeting'));
            
            // We return all Komu events to show in calendar, but mark them
            return {
              id: doc.id,
              title: data.title,
              description: data.description,
              startTime: data.start?.toDate() || new Date(),
              endTime: data.end?.toDate() || new Date((data.start?.toDate()?.getTime() || Date.now()) + 3600000),
              roomId: data.roomId || doc.id,
              hostId: data.uid,
              hostName: data.hostName || 'Komu User',
              notes: data.description, // Synced notes
              isKomu: true,
              isMeeting: isMeeting,
              type: data.type || (isMeeting ? 'meeting' : 'event')
            };
          })
          .filter(m => m !== null && m.isMeeting) as Meeting[];

        setMeetings(prev => {
          const localOnes = prev.filter(m => !m.isKomu);
          return [...localOnes, ...komuMeetings].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        });
        setSyncing(false);
      }, (err) => {
        setSyncing(false);
        if (err.message.includes('permission')) {
          console.warn("[Dashboard] Komu Sync Permissions Restricted.");
        } else {
          handleFirestoreError(err, OperationType.LIST, 'komu/events');
        }
      });
    } catch (err) {
      console.error("Komu Sync Failed:", err);
      setSyncing(false);
      return undefined;
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
      setGoogleToken(token);

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
          isMeeting: true, // Google calendar events are treated as meetings/appointments
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

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const startTime = new Date(`${newMeeting.date}T${newMeeting.time}`);
    const roomId = Math.random().toString(36).substring(2, 12);

    try {
      await addDoc(collection(db, 'meetings'), {
        title: newMeeting.title,
        description: newMeeting.description,
        notes: newMeeting.description,
        startTime: Timestamp.fromDate(startTime),
        roomId,
        hostId: user.uid,
        hostName: user.displayName || 'Anonymous',
        participants: [user.uid],
        isMeeting: true,
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
          isMeeting: true,
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
      {/* Sidebar - Desktop */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex sticky top-0 h-screen shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg border border-gray-100 p-1.5 overflow-hidden">
            <img src="https://komuhost.vercel.app/favicon.ico" className="w-full h-full object-contain" alt="Forum" referrerPolicy="no-referrer" />
          </div>
          <span className="text-2xl font-bold text-gray-900 tracking-tight">Forum</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scroll">
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

      {/* Sidebar - Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] md:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-white z-[110] flex flex-col md:hidden"
            >
              <div className="p-6 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md border border-gray-100 p-1.5 overflow-hidden">
                    <img src="https://komuhost.vercel.app/favicon.ico" className="w-full h-full object-contain" alt="Forum" referrerPolicy="no-referrer" />
                  </div>
                  <span className="text-2xl font-bold text-gray-900 tracking-tight">Forum</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-all">
                  <X size={20} />
                </button>
              </div>

              <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                <SidebarItem 
                  icon={<LayoutDashboard size={20} />} 
                  label="Dashboard" 
                  active={activeSidebarTab === 'dashboard'} 
                  onClick={() => { setActiveSidebarTab('dashboard'); setIsMobileMenuOpen(false); }}
                />
                <SidebarItem 
                  icon={<Video size={20} />} 
                  label="Meetings" 
                  active={activeSidebarTab === 'meetings'} 
                  onClick={() => { setActiveSidebarTab('meetings'); setIsMobileMenuOpen(false); }}
                />
                <SidebarItem 
                  icon={<Calendar size={20} />} 
                  label="Calendar" 
                  active={activeSidebarTab === 'calendar'} 
                  onClick={() => { setActiveSidebarTab('calendar'); setIsMobileMenuOpen(false); }}
                />
                <SidebarItem 
                  icon={<Users size={20} />} 
                  label="Contacts" 
                  active={activeSidebarTab === 'contacts'} 
                  onClick={() => { setActiveSidebarTab('contacts'); setIsMobileMenuOpen(false); }}
                />
                <SidebarItem 
                  icon={<FileText size={20} />} 
                  label="Notes" 
                  active={activeSidebarTab === 'notes'} 
                  onClick={() => { setActiveSidebarTab('notes'); setIsMobileMenuOpen(false); }}
                />
                <SidebarItem 
                  icon={<Monitor size={20} />} 
                  label="Whiteboard" 
                  active={activeSidebarTab === 'whiteboard'} 
                  onClick={() => { setActiveSidebarTab('whiteboard'); setIsMobileMenuOpen(false); }}
                />
                <SidebarItem 
                  icon={<Settings size={20} />} 
                  label="Settings" 
                  active={activeSidebarTab === 'settings'} 
                  onClick={() => { setActiveSidebarTab('settings'); setIsMobileMenuOpen(false); }}
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
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 lg:h-20 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-[60] shrink-0">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-all"
            >
              <Menu size={20} />
            </button>
            <div className="relative w-full group/search" ref={searchRef}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search meetings, contacts or notes..." 
                className="w-full pl-10 lg:pl-12 pr-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none text-sm transition-all"
                value={searchQuery}
                onFocus={() => setShowSearchDropdown(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
              />
              
              {/* Outlook-style Search Results Card */}
              <AnimatePresence>
                {showSearchDropdown && searchQuery.trim().length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-[100] max-h-[480px] overflow-y-auto custom-scroll"
                  >
                    <div className="p-2 space-y-4">
                      {/* Meetings Results */}
                      {meetings.filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 && (
                        <div>
                          <p className="px-2 pb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Meetings</p>
                          <div className="space-y-1">
                            {meetings.filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5).map(m => (
                              <button 
                                key={m.id}
                                onClick={() => { 
                                  const isPast = m.startTime.getTime() < Date.now();
                                  // Keep the search query so the tab shows "just results"
                                  setShowSearchDropdown(false);
                                  setActiveSidebarTab('meetings');
                                  setMeetingSubTab(isPast ? 'previous' : 'upcoming');
                                  
                                  // Calculate page for when search is cleared
                                  let sortedList = meetings.filter(item => {
                                    const itemPast = item.startTime.getTime() < Date.now();
                                    return isPast ? itemPast : !itemPast;
                                  });
                                  if (isPast) sortedList = [...sortedList].sort((a,b) => b.startTime.getTime() - a.startTime.getTime());
                                  
                                  const index = sortedList.findIndex(item => item.id === m.id);
                                  if (index !== -1) {
                                    setMeetingsPage(Math.floor(index / meetingsPerPage) + 1);
                                  }

                                  // Close dropdown by blurring search or clearing temporarily if needed
                                  // For now, we scroll to it. If searchQuery is kept, results will be filtered.
                                  setTimeout(() => {
                                    const el = document.getElementById(`meeting-${m.id}`);
                                    if (el) {
                                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      el.classList.add('ring-2', 'ring-accent-blue', 'ring-offset-4', 'duration-500');
                                      setTimeout(() => el.classList.remove('ring-2', 'ring-accent-blue', 'ring-offset-4'), 3000);
                                    }
                                  }, 500);
                                }}
                                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl transition-all text-left group"
                              >
                                <div className="w-10 h-10 bg-blue-50 text-accent-blue rounded-lg flex items-center justify-center shrink-0">
                                  <Video size={18} />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-gray-900 group-hover:text-accent-blue transition-colors line-clamp-1">{m.title}</p>
                                  <p className="text-[10px] text-gray-500">{format(m.startTime, 'MMM d, h:mm a')}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Contacts Results */}
                      {contacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 && (
                        <div>
                          <p className="px-2 pb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Contacts</p>
                          <div className="space-y-1">
                            {contacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 3).map(c => (
                              <button 
                                key={c.id}
                                onClick={() => { 
                                  setSearchQuery(''); 
                                  setShowSearchDropdown(false);
                                  setActiveSidebarTab('contacts'); 
                                }}
                                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl transition-all text-left group"
                              >
                                <img src={c.avatar} className="w-10 h-10 rounded-lg object-cover shrink-0" alt="" referrerPolicy="no-referrer" />
                                <div>
                                  <p className="text-sm font-bold text-gray-900 group-hover:text-accent-blue transition-colors line-clamp-1">{c.name}</p>
                                  <p className="text-[10px] text-gray-500">{c.role}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes Results */}
                      {notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 && (
                        <div>
                          <p className="px-2 pb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Notes</p>
                          <div className="space-y-1">
                            {notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 3).map(n => (
                              <button 
                                key={n.id}
                                onClick={() => { 
                                  setSearchQuery(''); 
                                  setShowSearchDropdown(false);
                                  setActiveSidebarTab('notes'); 
                                }}
                                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl transition-all text-left group"
                              >
                                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                                  <FileText size={18} />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-gray-900 group-hover:text-accent-blue transition-colors line-clamp-1">{n.title}</p>
                                  <p className="text-[10px] text-gray-500 line-clamp-1">{n.content}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No Results */}
                      {meetings.filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 &&
                       contacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 &&
                       notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <div className="p-10 text-center space-y-3">
                          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                            <Search className="text-gray-300" size={32} />
                          </div>
                          <p className="text-sm font-bold text-gray-900">No results found</p>
                          <p className="text-xs text-gray-400">Try searching for something else</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scroll bg-gray-50/30">
          <div className="max-w-6xl mx-auto space-y-6 lg:space-y-10">
            {activeSidebarTab === 'dashboard' && (
              <>
                {/* Welcome Section */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="text-center lg:text-left">
                    <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">Welcome back, {user?.displayName?.split(' ')[0]}!</h2>
                    <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 lg:gap-4 mt-2">
                      <p className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">You have {meetings.filter(m => isToday(m.startTime)).length} meetings today.</p>
                      <div className="hidden sm:block h-4 w-px bg-gray-200" />
                      <p className="text-xs sm:text-sm text-gray-500">{format(new Date(), 'EEEE, MMMM do')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:items-center justify-center gap-2 lg:gap-3">
                    <button 
                      onClick={syncGoogleCalendar}
                      disabled={syncing}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-100 text-gray-700 rounded-xl text-xs sm:text-sm font-bold hover:bg-gray-50 transition-all disabled:opacity-50"
                    >
                      <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png" className="w-5 h-5 shrink-0" alt="Google" />
                      <span>Google</span>
                    </button>
                    <button 
                      onClick={syncKomuCalendar}
                      disabled={syncing}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-100 text-gray-700 rounded-xl text-xs sm:text-sm font-bold hover:bg-gray-50 transition-all disabled:opacity-50"
                    >
                      <RefreshCw size={16} className={cn("shrink-0", syncing && "animate-spin")} />
                      <span>Komu</span>
                    </button>
                    <button 
                      onClick={() => setIsScheduling(true)}
                      className="col-span-2 sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-accent-blue text-white rounded-xl font-bold text-sm shadow-lg shadow-accent-blue/10 hover:bg-blue-600 transition-all active:scale-95"
                    >
                      <Plus size={18} className="shrink-0" />
                      Schedule
                    </button>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-6">
                  <div className="relative">
                    <QuickActionCard 
                      icon={<Plus size={20} />} 
                      label="New Meeting" 
                      sub="Instant meeting" 
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
                    icon={<Users size={20} />} 
                    label="Join Meeting" 
                    sub="Using code" 
                    color="bg-success-green"
                    onClick={() => setIsJoinMeetingModalOpen(true)}
                  />
                  <QuickActionCard 
                    icon={<Calendar size={20} />} 
                    label="Schedule" 
                    sub="Plan ahead" 
                    color="bg-purple-500"
                    onClick={() => setIsScheduling(true)}
                  />
                  <QuickActionCard 
                    icon={<Monitor size={20} />} 
                    label="Share Screen" 
                    sub="Present" 
                    color="bg-orange-500"
                    onClick={() => setIsSharing(true)}
                  />
                </div>

                {/* Personal Meeting Room */}
                <div className="bg-white p-5 lg:p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-6 overflow-hidden">
                  <div className="flex items-center gap-4 w-full lg:w-auto min-w-0">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-accent-blue shrink-0">
                      <Video size={20} className="lg:size-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 text-sm lg:text-base truncate">Personal Meeting Room</h3>
                      <p className="text-xs lg:text-sm text-gray-500 truncate">Your permanent meeting link for quick syncs.</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto shrink-0 lg:ml-auto">
                    <div className="w-full lg:w-auto px-4 py-2.5 bg-gray-50 rounded-xl text-[10px] sm:text-xs font-mono text-gray-600 border border-gray-100 truncate text-center sm:text-left lg:max-w-[240px]">
                      forum.app/m/{user?.uid?.substring(0, 8)}
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`https://forum.app/m/${user?.uid?.substring(0, 8)}`);
                          alert("Link copied!");
                        }}
                        className="p-2.5 text-accent-blue hover:bg-accent-blue/5 rounded-xl transition-all border border-blue-50 sm:border-transparent flex items-center justify-center shrink-0"
                      >
                        <Copy size={18} />
                      </button>
                      <button 
                        onClick={() => joinMeeting(user?.uid?.substring(0, 8) || '')}
                        className="px-6 lg:px-8 py-2.5 bg-accent-blue text-white rounded-xl font-bold text-sm shadow-lg shadow-accent-blue/20 transition-all hover:bg-blue-600 active:scale-95 shrink-0"
                      >
                        Start
                      </button>
                    </div>
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
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <div 
                            onClick={() => setShowPastInUpcoming(!showPastInUpcoming)}
                            className={cn(
                              "w-8 h-4 rounded-full relative transition-all",
                              showPastInUpcoming ? "bg-accent-blue" : "bg-gray-200"
                            )}
                          >
                            <div className={cn(
                              "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm",
                              showPastInUpcoming ? "left-4.5" : "left-0.5"
                            )} />
                          </div>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider group-hover:text-gray-600 transition-colors">Past</span>
                        </label>
                        <button onClick={() => setActiveSidebarTab('meetings')} className="text-sm font-bold text-accent-blue hover:underline">View all</button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {loading ? (
                        <div className="p-12 flex justify-center">
                          <RefreshCw className="animate-spin text-gray-300" size={32} />
                        </div>
                      ) : (
                        (() => {
                          const items = meetings
                            .filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase()))
                            .filter(m => showPastInUpcoming || m.startTime.getTime() >= Date.now());
                          
                          if (items.length === 0) {
                            return (
                              <div className="p-12 bg-white rounded-3xl border border-dashed border-gray-200 text-center space-y-4">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                                  <Calendar className="text-gray-300" size={32} />
                                </div>
                                <p className="text-gray-500 font-medium">No meetings found.</p>
                                <button onClick={() => setIsScheduling(true)} className="text-accent-blue font-bold hover:underline">Schedule one now</button>
                              </div>
                            );
                          }

                          return items.slice(0, 3).map(meeting => (
                            <MeetingCard 
                              key={meeting.id} 
                              meeting={meeting} 
                              onJoin={() => joinMeeting(meeting.roomId)}
                              onEdit={() => handleEditMeeting(meeting)}
                              onDelete={() => handleDeleteMeeting(meeting.id)}
                            />
                          ));
                        })()
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
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <h2 className="text-2xl font-bold text-gray-900">Calendar</h2>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                      <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
                        <button 
                          onClick={() => setCalendarView('month')}
                          className={cn("px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all", calendarView === 'month' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500")}
                        >
                          Month
                        </button>
                        <button 
                          onClick={() => setCalendarView('week')}
                          className={cn("px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all", calendarView === 'week' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500")}
                        >
                          Week
                        </button>
                      </div>

                      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl shrink-0">
                        <button 
                          onClick={() => setShowAllEvents(true)}
                          className={cn(
                            "px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1.5",
                            showAllEvents ? "bg-white text-accent-blue shadow-sm" : "text-gray-500"
                          )}
                        >
                          <Grid size={12} />
                          All
                        </button>
                        <button 
                          onClick={() => setShowAllEvents(false)}
                          className={cn(
                            "px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1.5",
                            !showAllEvents ? "bg-white text-accent-blue shadow-sm" : "text-gray-500"
                          )}
                        >
                          <Video size={12} />
                          Meetings
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl px-1.5 py-1 shadow-sm">
                      <button onClick={() => {
                        const d = new Date(selectedDate);
                        if (calendarView === 'month') d.setMonth(d.getMonth() - 1);
                        else d.setDate(d.getDate() - 7);
                        setSelectedDate(d);
                      }} className="p-1.5 hover:bg-gray-50 rounded-lg"><ChevronLeft size={16} /></button>
                      <span className="text-xs sm:text-sm font-bold px-1 sm:px-2 whitespace-nowrap min-w-[100px] text-center">{format(selectedDate, calendarView === 'month' ? 'MMMM yyyy' : 'MMM d')}</span>
                      <button onClick={() => {
                        const d = new Date(selectedDate);
                        if (calendarView === 'month') d.setMonth(d.getMonth() + 1);
                        else d.setDate(d.getDate() + 7);
                        setSelectedDate(d);
                      }} className="p-1.5 hover:bg-gray-50 rounded-lg"><ChevronRight size={16} /></button>
                    </div>
                    <button 
                      onClick={() => setIsScheduling(true)}
                      className="px-4 py-2.5 bg-accent-blue text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-transform active:scale-95"
                    >
                      New Event
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  {calendarView === 'month' ? (
                    <CalendarMonthView 
                      selectedDate={selectedDate} 
                      meetings={meetings.filter(m => showAllEvents || m.isMeeting)} 
                      onEditMeeting={handleEditMeeting} 
                    />
                  ) : (
                    <CalendarWeekView 
                      selectedDate={selectedDate} 
                      meetings={meetings.filter(m => showAllEvents || m.isMeeting)} 
                      onEditMeeting={handleEditMeeting} 
                    />
                  )}
                </div>
              </div>
            )}
            {activeSidebarTab === 'meetings' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold text-gray-900">Meetings</h2>
                  <div className="flex p-1 bg-gray-100 rounded-xl self-start sm:self-auto overflow-x-auto no-scrollbar">
                    <button 
                      onClick={() => { setMeetingSubTab('upcoming'); setMeetingsPage(1); }}
                      className={cn(
                        "px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all shrink-0",
                        meetingSubTab === 'upcoming' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Upcoming
                    </button>
                    <button 
                      onClick={() => { setMeetingSubTab('previous'); setMeetingsPage(1); }}
                      className={cn(
                        "px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all shrink-0",
                        meetingSubTab === 'previous' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Previous
                    </button>
                    <button 
                      onClick={() => { setMeetingSubTab('recordings'); setMeetingsPage(1); }}
                      className={cn(
                        "px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all shrink-0",
                        meetingSubTab === 'recordings' ? "bg-white text-accent-blue shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Recordings
                    </button>
                  </div>
                </div>
                
                {meetingSubTab === 'upcoming' && (
                  <div className="space-y-4 pb-20">
                    {(() => {
                      const isSearching = searchQuery.trim().length > 0;
                      const list = meetings
                        .filter(m => m.startTime.getTime() >= Date.now())
                        .filter(m => !isSearching || m.title.toLowerCase().includes(searchQuery.toLowerCase()) || m.description?.toLowerCase().includes(searchQuery.toLowerCase()));
                      
                      const paginatedList = isSearching ? list : list.slice((meetingsPage - 1) * meetingsPerPage, meetingsPage * meetingsPerPage);
                      const totalPages = isSearching ? 1 : Math.ceil(list.length / meetingsPerPage);

                      if (list.length === 0) return (
                        <div className="p-12 text-center text-gray-500 bg-white rounded-3xl border border-gray-100">
                          {isSearching ? `No results for "${searchQuery}"` : "No upcoming meetings."}
                          {isSearching && <button onClick={() => setSearchQuery('')} className="block mx-auto mt-2 text-accent-blue font-bold text-xs uppercase tracking-wider">Clear Search</button>}
                        </div>
                      );

                      return (
                        <>
                          <div className="space-y-4">
                            {paginatedList.map(meeting => (
                              <MeetingCard 
                                key={meeting.id} 
                                meeting={meeting} 
                                onJoin={() => joinMeeting(meeting.roomId)}
                                onEdit={() => handleEditMeeting(meeting)}
                                onDelete={() => handleDeleteMeeting(meeting.id)}
                              />
                            ))}
                          </div>
                          
                          {!isSearching && totalPages > 1 && (
                            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 mt-6 shadow-sm">
                              <button 
                                disabled={meetingsPage === 1}
                                onClick={() => setMeetingsPage(p => p - 1)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-500 disabled:opacity-30 hover:bg-gray-50 rounded-xl transition-all"
                              >
                                <ChevronLeft size={18} />
                                Previous
                              </button>
                              <span className="text-xs font-bold text-gray-400">Page {meetingsPage} of {totalPages}</span>
                              <button 
                                disabled={meetingsPage === totalPages}
                                onClick={() => setMeetingsPage(p => p + 1)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-accent-blue disabled:opacity-30 hover:bg-blue-50 rounded-xl transition-all"
                              >
                                Next Page
                                <ChevronRight size={18} />
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {meetingSubTab === 'previous' && (
                  <div className="space-y-4 pb-20">
                    {(() => {
                      const isSearching = searchQuery.trim().length > 0;
                      const list = meetings
                        .filter(m => m.startTime.getTime() < Date.now())
                        .filter(m => !isSearching || m.title.toLowerCase().includes(searchQuery.toLowerCase()) || m.description?.toLowerCase().includes(searchQuery.toLowerCase()))
                        .sort((a,b) => b.startTime.getTime() - a.startTime.getTime());
                      
                      const paginatedList = isSearching ? list : list.slice((meetingsPage - 1) * meetingsPerPage, meetingsPage * meetingsPerPage);
                      const totalPages = isSearching ? 1 : Math.ceil(list.length / meetingsPerPage);

                      if (list.length === 0) return (
                        <div className="p-12 text-center text-gray-500 bg-white rounded-3xl border border-gray-100">
                           {isSearching ? `No results for "${searchQuery}"` : "No previous meetings found in your history."}
                           {isSearching && <button onClick={() => setSearchQuery('')} className="block mx-auto mt-2 text-accent-blue font-bold text-xs uppercase tracking-wider">Clear Search</button>}
                        </div>
                      );

                      return (
                        <>
                          <div className="space-y-4">
                            {paginatedList.map(meeting => (
                              <MeetingCard 
                                key={meeting.id} 
                                meeting={meeting} 
                                onJoin={() => joinMeeting(meeting.roomId)}
                                onEdit={() => handleEditMeeting(meeting)}
                                onDelete={() => handleDeleteMeeting(meeting.id)}
                              />
                            ))}
                          </div>
                          
                          {!isSearching && totalPages > 1 && (
                            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 mt-6 shadow-sm">
                              <button 
                                disabled={meetingsPage === 1}
                                onClick={() => setMeetingsPage(p => p - 1)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-500 disabled:opacity-30 hover:bg-gray-50 rounded-xl transition-all"
                              >
                                <ChevronLeft size={18} />
                                Previous
                              </button>
                              <span className="text-xs font-bold text-gray-400">Page {meetingsPage} of {totalPages}</span>
                              <button 
                                disabled={meetingsPage === totalPages}
                                onClick={() => setMeetingsPage(p => p + 1)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-accent-blue disabled:opacity-30 hover:bg-blue-50 rounded-xl transition-all"
                              >
                                Next Page
                                <ChevronRight size={18} />
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold text-gray-900">Contacts</h2>
                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-accent-blue transition-colors" size={18} />
                      <input 
                        type="text" 
                        placeholder="Search contacts..." 
                        value={contactSearchQuery}
                        onChange={(e) => setContactSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 bg-white border border-gray-100 rounded-xl focus:ring-2 focus:ring-accent-blue/10 outline-none w-full sm:w-64 transition-all"
                      />
                    </div>
                    <button 
                      onClick={() => setIsAddContactModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-xl font-bold text-sm hover:bg-blue-600 transition-all shrink-0 shadow-lg shadow-accent-blue/10"
                    >
                      <Plus size={18} />
                      <span className="hidden sm:inline">Add Contact</span>
                      <span className="sm:hidden">Add</span>
                    </button>
                  </div>
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
                    {contacts
                      .filter(c => 
                        c.displayName.toLowerCase().includes(contactSearchQuery.toLowerCase()) || 
                        c.email.toLowerCase().includes(contactSearchQuery.toLowerCase())
                      )
                      .map(contact => (
                      <div key={contact.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 hover:shadow-md hover:border-accent-blue/20 transition-all cursor-pointer group">
                        <div className={cn(
                          "w-12 h-12 rounded-xl relative overflow-hidden bg-gray-50",
                          !contact.photoURL && "flex items-center justify-center text-accent-blue font-bold text-lg"
                        )}>
                          {contact.photoURL ? (
                            <img 
                              src={contact.photoURL} 
                              className="w-full h-full object-cover" 
                              alt={contact.displayName} 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            contact.displayName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900 group-hover:text-accent-blue transition-colors line-clamp-1">{contact.displayName}</p>
                          <p className="text-xs text-gray-500 line-clamp-1">{contact.email}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button className="p-2 text-gray-400 hover:text-accent-blue hover:bg-accent-blue/5 rounded-lg transition-all" title="Message">
                            <MessageSquare size={18} />
                          </button>
                          <button 
                            className="p-2 text-gray-400 hover:text-accent-red hover:bg-red-50 rounded-lg transition-all" 
                            title="Remove"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if(confirm('Delete contact?')) {
                                try {
                                  await deleteDoc(doc(db, 'contacts', contact.id));
                                } catch (err) {
                                  console.error("Failed to delete contact:", err);
                                }
                              }
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
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
              <div className="max-w-2xl space-y-8 h-full pb-20">
                <div className="flex items-center justify-between sticky top-0 bg-gray-50/80 backdrop-blur-md z-10 py-2 -mx-2 px-2">
                  <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                  <button 
                    onClick={() => {
                      saveSettings(settings);
                      alert('Settings saved!');
                    }}
                    className="px-5 sm:px-8 py-2 bg-accent-blue text-white rounded-xl font-bold text-sm shadow-lg shadow-accent-blue/20 transition-all active:scale-95"
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

      {/* Edit Meeting Modal */}
      <AnimatePresence>
        {editingMeeting && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Edit Meeting</h2>
                  <button onClick={() => setEditingMeeting(null)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleUpdateMeeting} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Title</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Meeting Title"
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                      value={editMeetingForm.title}
                      onChange={e => setEditMeetingForm(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date</label>
                      <input 
                        type="date" 
                        required
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                        value={editMeetingForm.date}
                        onChange={e => setEditMeetingForm(prev => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Time</label>
                      <input 
                        type="time" 
                        required
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none"
                        value={editMeetingForm.time}
                        onChange={e => setEditMeetingForm(prev => ({ ...prev, time: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
                    <textarea 
                      placeholder="Optional meeting details..."
                      rows={3}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-accent-blue/20 outline-none resize-none"
                      value={editMeetingForm.description}
                      onChange={e => setEditMeetingForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-4 bg-accent-blue text-white rounded-2xl font-bold shadow-lg shadow-accent-blue/20 hover:bg-blue-600 transition-all active:scale-95 mt-4"
                  >
                    Save Changes
                  </button>
                </form>
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

function MeetingCard({ meeting, onJoin, onEdit, onDelete }: { meeting: Meeting, onJoin: () => void, onEdit: () => void, onDelete: () => void, key?: string }) {
  const isNow = Math.abs(meeting.startTime.getTime() - Date.now()) < 15 * 60 * 1000;
  const isMeetingToday = isToday(meeting.startTime);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div id={`meeting-${meeting.id}`} className="bg-white p-4 sm:p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group relative scroll-mt-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center sm:items-start gap-3 sm:gap-4 truncate">
          <div className={cn(
            "w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 relative",
            isNow ? "bg-accent-blue text-white" : "bg-gray-50 text-gray-400"
          )}>
            <span className="text-[8px] sm:text-[10px] font-bold uppercase leading-none">{format(meeting.startTime, 'MMM')}</span>
            <span className="text-lg sm:text-xl font-bold">{format(meeting.startTime, 'dd')}</span>
            {isMeetingToday && (
              <div className="absolute -top-1 -right-1 px-1 py-0.5 bg-accent-red text-[7px] text-white font-black rounded-md shadow-sm">
                NOW
              </div>
            )}
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-gray-900 group-hover:text-accent-blue transition-colors text-sm sm:text-base truncate">{meeting.title}</h4>
              {meeting.isKomu && (
                <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[8px] sm:text-[10px] font-bold rounded-full border border-purple-100 shrink-0">KOMU</span>
              )}
            </div>
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <Clock size={12} className="shrink-0" />
              <span className="truncate">{format(meeting.startTime, 'hh:mm a')} • {meeting.hostName}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <button 
            onClick={onJoin}
            className={cn(
              "flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-xs sm:text-sm",
              isNow 
                ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/10 hover:bg-blue-600" 
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            )}
          >
            {isNow ? 'Join Now' : 'Join'}
          </button>
          <div className="relative">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2.5 text-gray-400 hover:bg-gray-100 rounded-xl transition-all"
            >
              <MoreVertical size={20} />
            </button>
            <AnimatePresence>
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 bottom-full mb-2 w-40 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50"
                  >
                    {!meeting.isKomu && (
                      <button 
                        onClick={() => { onEdit(); setIsMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Edit2 size={16} className="text-gray-400" />
                        Edit
                      </button>
                    )}
                    <button 
                      onClick={() => { onDelete(); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-accent-red hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteItem({ title, date, onClick }: { title: string, date: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-all cursor-pointer group"
    >
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

function getEventColorClass(m: Meeting) {
  if (m.type === 'task') return "bg-cyan-500 hover:bg-cyan-600";
  if (m.type === 'focus') return "bg-indigo-600 hover:bg-indigo-700";
  if (m.isMeeting || m.type === 'meeting') return "bg-accent-blue hover:bg-blue-600";
  if (m.isKomu) return "bg-purple-500 hover:bg-purple-600";
  return "bg-accent-blue hover:bg-blue-600";
}

function CalendarMonthView({ selectedDate, meetings, onEditMeeting }: { selectedDate: Date, meetings: Meeting[], onEditMeeting: (m: Meeting) => void }) {
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
          const isTodayCell = d.toDateString() === new Date().toDateString();
          
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
                isTodayCell ? "bg-accent-blue text-white" : isDiffMonth ? "text-gray-300" : "text-gray-900"
              )}>{d.getDate()}</span>
              <div className="space-y-1 mt-1 font-sans">
                {dayMeetings.map(m => (
                  <div 
                    key={m.id} 
                    onClick={() => onEditMeeting(m)}
                    className={cn(
                      "text-[9px] p-1 text-white rounded shadow-sm truncate font-bold cursor-pointer transition-colors flex items-center gap-1",
                      getEventColorClass(m)
                    )}
                  >
                    {m.type === 'task' && <Check size={8} />}
                    {m.type === 'focus' && <Clock size={8} />}
                    {m.isMeeting && <Video size={8} />}
                    <span className="truncate">{format(m.startTime, 'h:mm')} {m.title}</span>
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

function CalendarWeekView({ selectedDate, meetings, onEditMeeting }: { selectedDate: Date, meetings: Meeting[], onEditMeeting: (m: Meeting) => void }) {
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
            <div key={h} className="h-20 text-[10px] font-bold text-gray-400 p-2 text-right border-b border-gray-50">
              {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 relative">
          {days.map((day, di) => {
            const dayMeetings = meetings.filter(m => m.startTime.toDateString() === day.toDateString());
            // Sort meetings to handle stacking
            const sorted = [...dayMeetings].sort((a,b) => a.startTime.getTime() - b.startTime.getTime());
            
            // Assign columns to handle overlapping
            const columns: Meeting[][] = [];
            sorted.forEach(m => {
              let placed = false;
              for(let i=0; i<columns.length; i++) {
                const lastInCol = columns[i][columns[i].length - 1];
                const colEnd = lastInCol.endTime?.getTime() || (lastInCol.startTime.getTime() + 60 * 60 * 1000);
                if(m.startTime.getTime() >= colEnd) {
                  columns[i].push(m);
                  placed = true;
                  break;
                }
              }
              if(!placed) columns.push([m]);
            });

            return (
              <div key={day.toString()} className="border-l border-gray-100 relative group/day">
                {hours.map(h => <div key={h} className="h-20 border-b border-gray-50" />)}
                {columns.map((col, colIndex) => (
                  col.map(m => {
                    const top = (m.startTime.getHours() * 60 + m.startTime.getMinutes()) / (24 * 60) * 100;
                    const durationMs = (m.endTime?.getTime() || (m.startTime.getTime() + 3600000)) - m.startTime.getTime();
                    const height = (durationMs / (24 * 60 * 60 * 1000)) * 100;
                    const width = 100 / columns.length;
                    const left = colIndex * width;
                    
                    return (
                      <div 
                        key={m.id}
                        onClick={() => onEditMeeting(m)}
                        className={cn(
                          "absolute p-2 rounded-lg shadow-sm z-10 cursor-pointer transition-all border border-white/20 flex flex-col overflow-hidden hover:shadow-lg hover:z-20",
                          getEventColorClass(m),
                          "text-white"
                        )}
                        style={{ 
                          top: `${top}%`, 
                          height: `${Math.max(height, 2)}%`, // Minimum height for visibility
                          left: `${left}%`, 
                          width: `${width}%` 
                        }}
                      >
                        <div className="flex items-center justify-between gap-1 overflow-hidden">
                          <p className="text-[10px] font-black truncate tracking-tight uppercase flex items-center gap-1">
                            {m.type === 'task' && <Check size={10} />}
                            {m.type === 'focus' && <Clock size={10} />}
                            {m.title}
                          </p>
                          {m.isMeeting && <Video size={10} className="shrink-0" />}
                        </div>
                        <p className="text-[8px] opacity-80 font-medium whitespace-nowrap">
                          {format(m.startTime, 'h:mm')} - {m.endTime ? format(m.endTime, 'h:mm a') : '...'}
                        </p>
                        {height > 5 && m.description && (
                          <p className="text-[7px] opacity-70 line-clamp-2 mt-1 italic">{m.description}</p>
                        )}
                        {m.isKomu && (
                          <div className="mt-auto text-[6px] font-black uppercase tracking-tighter self-end bg-black/10 px-1 rounded backdrop-blur-sm">KOMU</div>
                        )}
                      </div>
                    );
                  })
                ))}
              </div>
            );
          })}
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
