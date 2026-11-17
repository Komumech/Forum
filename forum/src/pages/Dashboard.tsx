import * as React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Whiteboard from '../components/Whiteboard.tsx';
import { 
  Video, Calendar, Plus, Search, Settings, Clock, 
  MessageSquare, Users, ChevronRight, ChevronDown, LogOut, 
  LayoutDashboard, FileText, Bell, RefreshCw, X, MoreVertical, Globe,
  Copy, Check, Monitor, ChevronLeft, Calendar as CalendarIcon,
  Filter, Grid, List as ListIcon, Trash2, Edit2, Menu,
  Paperclip, FolderUp, ArrowUpRight, Download, Send, Share2, Sparkles, Layers,
  FileCheck, HardDrive, ShieldCheck, ArrowRight, Upload, Mail, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { db, auth, komuDb, komuAuth, googleProvider } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, Timestamp, orderBy, doc, setDoc, writeBatch, deleteDoc, updateDoc, getDocs, getDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { cn } from '../lib/utils';
import { downloadICSFile, getGoogleCalendarUrl } from '../utils/calendarExport';
import {
  getPushPreferences,
  savePushPreferences,
  getNotificationSupportStatus,
  registerForumServiceWorker,
  requestForumNotificationPermission,
  triggerForumPushNotification
} from '../utils/pushNotifications';
import MeetingCanvas from '../components/MeetingCanvas';
import { SendErrorFeedbackButton } from '../components/ErrorFeedbackModal';
import ClipsBasic from '../components/ClipsBasic';

interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  roomId: string;
  hostId: string;
  hostName: string;
  tags?: string[];
  notes?: string;
  isKomu?: boolean;
  isGoogle?: boolean;
  isMeeting?: boolean;
  type?: 'event' | 'task' | 'focus' | 'meeting';
  coverImage?: string;
  invitedEmails?: string[];
  participants?: string[];
  acceptedUids?: string[];
  acceptedNames?: string[];
}

function getRoundedScheduleTime(offsetMins = 15): string {
  const target = new Date(Date.now() + offsetMins * 60000);
  const mins = target.getMinutes();
  const rounded = Math.ceil(mins / 15) * 15;
  target.setMinutes(rounded, 0, 0);
  return format(target, 'HH:mm');
}

function getNextHourTime(): string {
  const target = new Date();
  target.setHours(target.getHours() + 1, 0, 0, 0);
  return format(target, 'HH:mm');
}

function formatTimePreview(dateStr: string, timeStr: string, durationMins: number): string {
  if (!dateStr || !timeStr) return '';
  const start = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + durationMins * 60000);
  const dayLabel = isToday(start)
    ? 'Today'
    : isTomorrow(start)
      ? 'Tomorrow'
      : format(start, 'EEE, MMM d');
  return `${dayLabel} · ${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
}

function compressCoverImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const maxW = 1200;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

type UserPresenceStatus = 'available' | 'away' | 'busy' | 'in_meeting' | 'offline';

function getPresenceMeta(
  rawStatus?: string,
  isOnline?: boolean,
  lastSeen?: string,
  inMeetingHeartbeat?: number | null
): { label: string; dotClass: string } {
  let normalized = rawStatus || (isOnline ? 'available' : 'offline');
  if (normalized === 'in_meeting') {
    const now = Date.now();
    const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
    const isStale =
      isOnline === false ||
      (typeof inMeetingHeartbeat === 'number' && inMeetingHeartbeat > 0
        ? now - inMeetingHeartbeat > 120_000
        : lastSeenMs > 0 && now - lastSeenMs > 180_000);
    if (isStale) {
      normalized = isOnline ? 'available' : 'offline';
    }
  }
  switch (normalized) {
    case 'in_meeting':
      return { label: 'In meeting', dotClass: 'bg-amber-500' };
    case 'busy':
      return { label: 'Busy', dotClass: 'bg-rose-500' };
    case 'away':
      return { label: 'Away', dotClass: 'bg-amber-400' };
    case 'offline':
      return { label: 'Offline', dotClass: 'bg-slate-300' };
    case 'available':
    default:
      return { label: 'Available', dotClass: 'bg-emerald-500' };
  }
}

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    };
    playTone(659.25, now, 0.18);
    playTone(880, now + 0.11, 0.25);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // Ignore autoplay errors
  }
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
  const { user, login, isLoggingIn, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSidebarTab, setActiveSidebarTab] = useState<'dashboard' | 'meetings' | 'contacts' | 'notes' | 'settings' | 'whiteboard' | 'calendar' | 'files' | 'canvas' | 'clips'>('dashboard');
  const [dashboardFiles, setDashboardFiles] = useState<Array<{ id: string; name: string; size: number; type: string; timestamp: number; url?: string }>>([
    { id: 'f-1', name: 'Project_Architecture_Overview.pdf', size: 2450000, type: 'application/pdf', timestamp: Date.now() - 3600000 },
    { id: 'f-2', name: 'Q3_Sprint_Deliverables.xlsx', size: 840000, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', timestamp: Date.now() - 86400000 },
    { id: 'f-3', name: 'Design_System_Tokens.json', size: 124000, type: 'application/json', timestamp: Date.now() - 172800000 }
  ]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [fileTransferCopied, setFileTransferCopied] = useState(false);
  const [meetingSubTab, setMeetingSubTab] = useState<'upcoming' | 'previous' | 'recordings'>('upcoming');
  const [userStatus, setUserStatus] = useState<UserPresenceStatus>('available');
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [contactStatuses, setContactStatuses] = useState<Record<string, { status: string; isOnline?: boolean; lastSeen?: string; inMeetingHeartbeat?: number | null }>>({});
  const [liveNotificationAlert, setLiveNotificationAlert] = useState<{ title: string; body: string; url?: string } | null>(null);
  const liveAlertTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isJoinMeetingModalOpen, setIsJoinMeetingModalOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [newMeeting, setNewMeeting] = useState({ 
    title: '', 
    description: '', 
    date: format(new Date(), 'yyyy-MM-dd'), 
    time: getRoundedScheduleTime(15), 
    durationMins: 30,
    recurrence: 'none' as 'none' | 'daily' | 'weekly' | 'monthly',
    coverImage: '',
    invitedEmails: ''
  });
  const [showScheduleExtras, setShowScheduleExtras] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showPastInUpcoming, setShowPastInUpcoming] = useState(false);
  const [meetingsPage, setMeetingsPage] = useState(1);
  const meetingsPerPage = 6;
  const [joinCode, setJoinCode] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [pushPrefs, setPushPrefs] = useState(() => getPushPreferences());
  const [notifPermission, setNotifPermission] = useState(() => getNotificationSupportStatus());
  const [inviteModalMeeting, setInviteModalMeeting] = useState<Meeting | null>(null);
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const loadedNotifIdsRef = React.useRef<Set<string>>(new Set());
  const notifsHydratedRef = React.useRef(false);
  const lastScrollTop = React.useRef(0);

  useEffect(() => {
    setIsHeaderVisible(true);
  }, [activeSidebarTab]);

  useEffect(() => {
    registerForumServiceWorker();
    setNotifPermission(getNotificationSupportStatus());

    const handleForumNotification = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string; body?: string; url?: string }>).detail;
      if (!detail?.title) return;
      setLiveNotificationAlert({
        title: detail.title,
        body: detail.body || '',
        url: detail.url,
      });
      if (liveAlertTimerRef.current) clearTimeout(liveAlertTimerRef.current);
      liveAlertTimerRef.current = setTimeout(() => {
        setLiveNotificationAlert(null);
      }, 8000);
    };

    window.addEventListener('forum:notification', handleForumNotification);
    return () => {
      window.removeEventListener('forum:notification', handleForumNotification);
      if (liveAlertTimerRef.current) clearTimeout(liveAlertTimerRef.current);
    };
  }, []);

  // Support deep links to Calendar tabs and pending invite auto-calendar sync
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const dateParam = searchParams.get('date');
    if (tabParam === 'calendar' || tabParam === 'meetings' || tabParam === 'contacts' || tabParam === 'notes' || tabParam === 'settings') {
      setActiveSidebarTab(tabParam);
    }
    if (dateParam) {
      const parsed = new Date(`${dateParam}T12:00:00`);
      if (!Number.isNaN(parsed.getTime())) setSelectedDate(parsed);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    const urlInvite = searchParams.get('invite');
    let pendingInvite: string | null = urlInvite;
    try {
      if (!pendingInvite) pendingInvite = localStorage.getItem('pending_forum_invite');
    } catch {}
    if (!pendingInvite) return;

    const roomId = pendingInvite;
    const syncPendingInvite = async () => {
      try {
        const emailLower = user.email?.toLowerCase();
        const mRef = doc(db, 'meetings', roomId);
        const snap = await getDoc(mRef);
        if (snap.exists()) {
          const data = snap.data();
          const inviteeName = user.displayName || user.email?.split('@')[0] || 'Participant';
          const currentAccepted: string[] = Array.isArray(data.acceptedUids) ? data.acceptedUids : [];
          const wasAccepted = currentAccepted.includes(user.uid);
          const isHostUser = data.hostId === user.uid;

          await updateDoc(mRef, {
            participants: arrayUnion(user.uid),
            acceptedUids: arrayUnion(user.uid),
            acceptedNames: arrayUnion(inviteeName),
            ...(emailLower ? { invitedEmails: arrayUnion(emailLower) } : {})
          });

          if (!wasAccepted && !isHostUser && data.hostId) {
            const updatedCount = new Set([...currentAccepted, user.uid]).size;
            addDoc(collection(db, 'notifications'), {
              userId: data.hostId,
              type: 'meeting',
              title: `Invite Accepted: ${data.title || roomId}`,
              message: `${inviteeName} accepted your invite · ${updatedCount} ${updatedCount === 1 ? 'participant' : 'participants'} confirmed`,
              roomId,
              read: false,
              createdAt: serverTimestamp(),
            }).catch(() => {});
          }

          setDashboardToast({
            message: `Added "${data?.title || roomId}" to your Forum Calendar`,
            type: 'success'
          });
          setActiveSidebarTab('calendar');
        }
      } catch (err) {
        console.warn('[Dashboard] Pending invite sync error:', err);
      } finally {
        try {
          localStorage.removeItem('pending_forum_invite');
        } catch {}
        if (urlInvite) {
          const next = new URLSearchParams(searchParams);
          next.delete('invite');
          setSearchParams(next, { replace: true });
        }
      }
    };
    syncPendingInvite();
  }, [user, searchParams, setSearchParams]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    if (Math.abs(scrollTop - lastScrollTop.current) < 10) return;
    
    if (scrollTop > lastScrollTop.current && scrollTop > 60) {
      setIsHeaderVisible(false);
    } else {
      setIsHeaderVisible(true);
    }
    lastScrollTop.current = scrollTop;
  };

  // Flush any pending transcript saved locally during an abrupt tab close
  useEffect(() => {
    if (!user?.uid) return;
    try {
      const raw = localStorage.getItem('forum_pending_transcript_sync_v1');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending || typeof pending !== 'object') return;
      const entries = Object.values(pending) as Array<{
        docId: string;
        uid: string;
        title: string;
        body: string;
        roomId: string;
      }>;
      const mine = entries.filter((e) => e && e.uid === user.uid && e.docId && e.body);
      if (mine.length === 0) return;

      void Promise.all(
        mine.map((item) =>
          setDoc(
            doc(komuDb, 'notes', item.docId),
            {
              uid: item.uid,
              title: item.title,
              body: item.body,
              type: 'transcript',
              roomId: item.roomId || '',
              isArchive: false,
              isTrash: false,
              updatedAt: serverTimestamp(),
              color: '#ffffff',
            },
            { merge: true }
          )
        )
      )
        .then(() => {
          const remaining = { ...pending };
          mine.forEach((item) => {
            delete remaining[item.docId];
          });
          if (Object.keys(remaining).length === 0) {
            localStorage.removeItem('forum_pending_transcript_sync_v1');
          } else {
            localStorage.setItem('forum_pending_transcript_sync_v1', JSON.stringify(remaining));
          }
        })
        .catch(() => {});
    } catch {}
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    notifsHydratedRef.current = false;
    loadedNotifIdsRef.current.clear();
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid));
    return onSnapshot(q, (snapshot) => {
      const list = (snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[]).sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
      if (!notifsHydratedRef.current) {
        list.forEach(item => loadedNotifIdsRef.current.add(item.id));
        notifsHydratedRef.current = true;
      } else {
        list.forEach(item => {
          if (!loadedNotifIdsRef.current.has(item.id)) {
            loadedNotifIdsRef.current.add(item.id);
            const prefs = getPushPreferences();
            if (!item.read) {
              if (prefs.enabled) {
                playNotificationChime();
              }
              if (prefs.inviteAlerts) {
                const payload = {
                  title: item.title || 'Forum Notification',
                  body: item.message || 'You have a new update in Forum',
                  url: item.roomId ? `/invite/${item.roomId}` : '/dashboard',
                  tag: `notif-${item.id}`
                };
                setLiveNotificationAlert({
                  title: payload.title,
                  body: payload.body,
                  url: payload.url,
                });
                if (liveAlertTimerRef.current) clearTimeout(liveAlertTimerRef.current);
                liveAlertTimerRef.current = setTimeout(() => {
                  setLiveNotificationAlert(null);
                }, 8000);
                if (prefs.enabled) {
                  void triggerForumPushNotification(payload);
                }
              }
            }
          }
        });
      }
      setNotifications(list);
    }, (err) => {
      console.warn('[Dashboard] Notifications listener notice:', err);
    });
  }, [user]);

  const markNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllNotificationsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
    }
  };

  const [isNewMeetingMenuOpen, setIsNewMeetingMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [isImportContactsModalOpen, setIsImportContactsModalOpen] = useState(false);
  const [importContactsText, setImportContactsText] = useState('');
  const [contactToDelete, setContactToDelete] = useState<any | null>(null);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);
  const [dashboardToast, setDashboardToast] = useState<{ message: string; type?: 'info' | 'success' | 'error' } | null>(null);
  const [newContact, setNewContact] = useState({ displayName: '', email: '' });
  const [editingNote, setEditingNote] = useState<any>(null);
  const [noteCopied, setNoteCopied] = useState(false);
  const [notesFilter, setNotesFilter] = useState<'all' | 'transcripts' | 'notes'>('all');
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editMeetingForm, setEditMeetingForm] = useState({ title: '', description: '', date: '', time: '', durationMins: 30, coverImage: '' });
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
    if (!user) {
      setLoading(false);
      return;
    }
    
    // Load local settings
    const savedSettings = localStorage.getItem(`settings_${user.uid}`);
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    // Fetch user profile for status — if user is on Dashboard, they are never stuck in_meeting
    const profileUnsubscribe = onSnapshot(doc(db, 'userProfiles', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === 'in_meeting') {
          const restored =
            data.previousStatus && data.previousStatus !== 'in_meeting' && data.previousStatus !== 'offline'
              ? data.previousStatus
              : 'available';
          setUserStatus(restored);
          setDoc(doc(db, 'userProfiles', user.uid), {
            status: restored,
            isOnline: true,
            currentRoomId: null,
            inMeetingHeartbeat: null,
            lastSeen: new Date().toISOString()
          }, { merge: true }).catch(() => {});
        } else if (data.status) {
          setUserStatus(data.status);
        }
      }
    });

    // Fetch meetings from local Forum DB (by participant UID + invitedEmail)
    let participantMeetings: Meeting[] = [];
    let emailInvitedMeetings: Meeting[] = [];

    const mergeAndSetMeetings = (komuOverride?: Meeting[]) => {
      setMeetings(prev => {
        const komuOnes = komuOverride ?? prev.filter(m => m.isKomu);
        const map = new Map<string, Meeting>();
        participantMeetings.forEach(m => map.set(m.id, m));
        emailInvitedMeetings.forEach(m => {
          if (!map.has(m.id)) map.set(m.id, m);
        });
        const mergedLocal = Array.from(map.values());
        return [...mergedLocal, ...komuOnes].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      });
    };

    const q = query(
      collection(db, 'meetings'), 
      where('participants', 'array-contains', user.uid),
      orderBy('startTime', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      participantMeetings = snapshot.docs.map(d => {
        const data = d.data();
        const startTime = data.startTime?.toDate ? data.startTime.toDate() : new Date();
        return {
          id: d.id,
          ...data,
          startTime,
          endTime: data.endTime?.toDate ? data.endTime.toDate() : new Date(startTime.getTime() + 3600000),
          notes: data.description || '',
        };
      }) as Meeting[];
      
      mergeAndSetMeetings();
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'meetings');
    });

    let unsubInvited = () => {};
    if (user.email) {
      const emailQ = query(
        collection(db, 'meetings'),
        where('invitedEmails', 'array-contains', user.email.toLowerCase())
      );
      unsubInvited = onSnapshot(emailQ, (snapshot) => {
        emailInvitedMeetings = snapshot.docs.map(d => {
          const data = d.data();
          const startTime = data.startTime?.toDate ? data.startTime.toDate() : new Date();
          return {
            id: d.id,
            ...data,
            startTime,
            endTime: data.endTime?.toDate ? data.endTime.toDate() : new Date(startTime.getTime() + 3600000),
            notes: data.description || '',
          };
        }) as Meeting[];
        mergeAndSetMeetings();
      }, (err) => {
        console.warn('[Dashboard] Invited meetings query notice:', err);
      });
    }

    // Initial Komu Sync
    const komuUnsubscribe = syncKomuCalendar();

    return () => {
      unsubscribe();
      unsubInvited();
      profileUnsubscribe();
      if (komuUnsubscribe && typeof komuUnsubscribe === 'function') komuUnsubscribe();
    };
  }, [user]);

  // Scheduled meeting reminders (10 minutes prior)
  useEffect(() => {
    if (!user || meetings.length === 0) return;

    const checkReminders = () => {
      const prefs = getPushPreferences();
      if (!prefs.enabled || !prefs.meetingReminders || getNotificationSupportStatus() !== 'granted') return;
      const now = Date.now();
      let sentIds: Record<string, boolean> = {};
      try {
        sentIds = JSON.parse(localStorage.getItem('forum_sent_reminders_v1') || '{}');
      } catch {}

      let updated = false;
      meetings.forEach((m) => {
        const diff = m.startTime.getTime() - now;
        if (diff > -60000 && diff <= 10 * 60 * 1000 && !sentIds[m.id]) {
          sentIds[m.id] = true;
          updated = true;
          const mins = Math.max(0, Math.round(diff / 60000));
          void triggerForumPushNotification({
            title: mins <= 1 ? `${m.title} is starting now` : `${m.title} in ${mins} min`,
            body: `Click to join Room ${m.roomId}`,
            url: `/meeting/${m.roomId}`,
            tag: `reminder-${m.id}`,
          });
        }
      });

      if (updated) {
        try {
          localStorage.setItem('forum_sent_reminders_v1', JSON.stringify(sentIds));
        } catch {}
      }
    };

    checkReminders();
    const timer = setInterval(checkReminders, 30000);
    return () => clearInterval(timer);
  }, [user, meetings]);

  // Fetch Contacts
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'contacts'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.warn("[Dashboard] Contacts snapshot notice:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // Subscribe to real-time presence statuses for Contacts from userProfiles
  useEffect(() => {
    if (!user || contacts.length === 0) {
      setContactStatuses({});
      return;
    }
    const emails = Array.from(
      new Set(
        contacts
          .map((c) => (c.email || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (emails.length === 0) return;

    const chunks: string[][] = [];
    for (let i = 0; i < emails.length; i += 10) {
      chunks.push(emails.slice(i, i + 10));
    }

    const chunkMaps: Record<number, Record<string, { status: string; isOnline?: boolean; lastSeen?: string; inMeetingHeartbeat?: number | null }>> = {};
    const unsubs = chunks.map((chunk, chunkIdx) => {
      const q = query(collection(db, 'userProfiles'), where('email', 'in', chunk));
      return onSnapshot(
        q,
        (snapshot) => {
          const nextChunk: Record<string, { status: string; isOnline?: boolean; lastSeen?: string; inMeetingHeartbeat?: number | null }> = {};
          snapshot.docs.forEach((d) => {
            const data = d.data();
            const key = (data.email || '').trim().toLowerCase();
            if (key) {
              nextChunk[key] = {
                status: data.status || (data.isOnline ? 'available' : 'offline'),
                isOnline: Boolean(data.isOnline),
                lastSeen: data.lastSeen,
                inMeetingHeartbeat: typeof data.inMeetingHeartbeat === 'number' ? data.inMeetingHeartbeat : null,
              };
            }
          });
          chunkMaps[chunkIdx] = nextChunk;
          const merged: Record<string, { status: string; isOnline?: boolean; lastSeen?: string; inMeetingHeartbeat?: number | null }> = {};
          Object.values(chunkMaps).forEach((m) => Object.assign(merged, m));
          setContactStatuses(merged);
        },
        (err) => {
          console.warn('[Dashboard] Contact status snapshot notice:', err);
        }
      );
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [user, contacts]);

  // Fetch Notes & Transcripts with resilient client-side sort
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notes'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      items.sort((a: any, b: any) => {
        const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : (typeof a.updatedAt === 'number' ? a.updatedAt : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0)));
        const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : (typeof b.updatedAt === 'number' ? b.updatedAt : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0)));
        return timeB - timeA;
      });
      setNotes(items);
    }, (err) => {
      console.warn("[Dashboard] Notes snapshot notice:", err);
    });
    return () => unsubscribe();
  }, [user]);

  const [recordings, setRecordings] = useState<any[]>([]);
  
  // Fetch Recordings
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'recordings'), where('participants', 'array-contains', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecordings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.warn("[Dashboard] Recordings snapshot notice:", err);
    });
    return () => unsubscribe();
  }, [user]);

  const handleStatusChange = async (status: UserPresenceStatus) => {
    setUserStatus(status);
    setIsStatusMenuOpen(false);
    if (!user) return;
    try {
      await setDoc(doc(db, 'userProfiles', user.uid), {
        status,
        isOnline: status !== 'offline',
        lastSeen: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newContact.email) return;
    try {
      const normalizedEmail = newContact.email.trim().toLowerCase();
      let displayName = newContact.displayName.trim();
      let photoURL = '';
      const profilesRef = collection(db, 'userProfiles');
      const q = query(profilesRef, where('email', '==', normalizedEmail));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        photoURL = snap.docs[0].data().photoURL || '';
        if (!displayName || displayName === normalizedEmail) {
          displayName = snap.docs[0].data().displayName || displayName;
        }
      }

      await addDoc(collection(db, 'contacts'), {
        displayName: displayName || normalizedEmail.split('@')[0],
        email: normalizedEmail,
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

  const handleImportContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !importContactsText.trim()) return;

    try {
      const lines = importContactsText.split('\n').map(l => l.trim()).filter(Boolean);
      const batch = writeBatch(db);
      let count = 0;

      lines.forEach(line => {
        let name = '';
        let email = '';
        if (line.includes(',')) {
          const parts = line.split(',');
          name = parts[0].trim();
          email = parts[1].trim();
        } else if (line.includes('\t')) {
          const parts = line.split('\t');
          name = parts[0].trim();
          email = parts[1].trim();
        } else {
          email = line.trim();
          name = email.split('@')[0];
        }

        if (email && email.includes('@')) {
          const newRef = doc(collection(db, 'contacts'));
          batch.set(newRef, {
            displayName: name || email.split('@')[0],
            email: email.toLowerCase(),
            ownerId: user.uid,
            createdAt: Timestamp.now()
          });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
        setDashboardToast({ message: `Successfully imported ${count} contacts`, type: 'success' });
      }
      setIsImportContactsModalOpen(false);
      setImportContactsText('');
    } catch (err) {
      console.error("Failed to import contacts:", err);
      setDashboardToast({ message: "Failed to import contacts", type: 'error' });
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!contactId) return;
    try {
      setContacts(prev => prev.filter(c => c.id !== contactId));
      setContactToDelete(null);
      await deleteDoc(doc(db, 'contacts', contactId));
      setDashboardToast({ message: "Contact deleted", type: 'success' });
    } catch (err) {
      console.error("Failed to delete contact:", err);
      setContacts(prev => prev.filter(c => c.id !== contactId));
      setContactToDelete(null);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!user || !noteId) return;
    try {
      await deleteDoc(doc(db, 'notes', noteId));
      setEditingNote(null);
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
  };

  const handleDeleteMeeting = (meetingId: string) => {
    const target = meetings.find(m => m.id === meetingId);
    if (target) {
      setMeetingToDelete(target);
    } else {
      setMeetingToDelete({ id: meetingId, title: "Meeting" } as Meeting);
    }
  };

  const confirmDeleteMeeting = async () => {
    if (!user || !meetingToDelete) return;
    try {
      await deleteDoc(doc(db, 'meetings', meetingToDelete.id));
      setMeetingToDelete(null);
      setDashboardToast({ message: "Meeting deleted successfully", type: 'success' });
      setTimeout(() => setDashboardToast(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `meetings/${meetingToDelete.id}`);
    }
  };

  const handleEditMeeting = (meeting: Meeting) => {
    const rawMins = meeting.endTime
      ? Math.round((meeting.endTime.getTime() - meeting.startTime.getTime()) / 60000)
      : 30;
    const durationMins = rawMins > 0 && rawMins <= 240 ? rawMins : 30;
    setEditingMeeting(meeting);
    setEditMeetingForm({
      title: meeting.title,
      description: meeting.description || '',
      date: format(meeting.startTime, 'yyyy-MM-dd'),
      time: format(meeting.startTime, 'HH:mm'),
      durationMins,
      coverImage: meeting.coverImage || ''
    });
  };

  const handleUpdateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingMeeting) return;

    const startTime = new Date(`${editMeetingForm.date}T${editMeetingForm.time}`);
    const durationMs = Math.max(15, editMeetingForm.durationMins || 30) * 60000;
    const endTime = new Date(startTime.getTime() + durationMs);
    
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
            end: { dateTime: endTime.toISOString() }
          })
        }).catch(err => console.warn("Google Sync Update failed:", err));
      }

      await updateDoc(doc(db, 'meetings', editingMeeting.id), {
        title: editMeetingForm.title,
        description: editMeetingForm.description,
        notes: editMeetingForm.description,
        coverImage: editMeetingForm.coverImage || '',
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime)
      });
      setEditingMeeting(null);
      setDashboardToast({ message: 'Meeting updated', type: 'success' });
      setTimeout(() => setDashboardToast(null), 2500);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `meetings/${editingMeeting.id}`);
    }
  };

  const saveSettings = (newSettings: any) => {
    setSettings(newSettings);
    if (user) {
      localStorage.setItem(`settings_${user.uid}`, JSON.stringify(newSettings));
      // Persist to Cloud for cross-device sync
      setDoc(doc(db, 'userProfiles', user.uid), {
        settings: newSettings,
        updatedAt: Timestamp.now()
      }, { merge: true }).catch(err => console.error("Cloud settings sync failed:", err));
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
      setDashboardToast({ message: "Google Calendar synced successfully!", type: 'success' });
      setTimeout(() => setDashboardToast(null), 3000);
    } catch (err) {
      console.error("Google Sync Failed:", err);
      setDashboardToast({ message: "Sync failed. Ensure you granted permissions.", type: 'error' });
      setTimeout(() => setDashboardToast(null), 4000);
    } finally {
      setSyncing(false);
    }
  };

  const sendMeetingInviteToEmails = async (meetingObj: { id: string; roomId: string; title: string; hostName?: string }, rawEmails: string[]) => {
    const emails = Array.from(new Set(rawEmails.map(e => e.trim().toLowerCase()).filter(e => e.includes('@'))));
    if (emails.length === 0) return 0;

    const participantUids: string[] = [];
    for (const email of emails) {
      try {
        const snap = await getDocs(query(collection(db, 'userProfiles'), where('email', '==', email)));
        if (!snap.empty) {
          snap.docs.forEach(d => {
            const uid = d.data().uid || d.id;
            if (uid && !participantUids.includes(uid)) {
              participantUids.push(uid);
            }
          });
        }
      } catch {}
    }

    try {
      await updateDoc(doc(db, 'meetings', meetingObj.id), {
        invitedEmails: arrayUnion(...emails),
        ...(participantUids.length > 0 ? { participants: arrayUnion(...participantUids) } : {})
      });
    } catch {}

    await Promise.all(
      participantUids.map((uid) =>
        addDoc(collection(db, 'notifications'), {
          userId: uid,
          type: 'meeting',
          title: `Meeting Invite: ${meetingObj.title}`,
          message: `${meetingObj.hostName || 'Host'} invited you. Added to your Forum Calendar.`,
          roomId: meetingObj.roomId,
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      )
    );
    return emails.length;
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const startTime = new Date(`${newMeeting.date}T${newMeeting.time}`);
    const durationMs = Math.max(15, newMeeting.durationMins || 30) * 60000;
    const endTime = new Date(startTime.getTime() + durationMs);
    const roomId = Math.random().toString(36).substring(2, 12);
    const parsedEmails = newMeeting.invitedEmails
      .split(/[\s,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.includes('@'));

    try {
      const hostEmail = user.email || "";
      const hostName = user.displayName || user.email?.split('@')[0] || 'Host';
      const resolvedTitle = newMeeting.title.trim() || `Meeting ${roomId}`;

      await setDoc(doc(db, 'meetings', roomId), {
        title: resolvedTitle,
        description: newMeeting.description,
        notes: newMeeting.description,
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime),
        recurrence: newMeeting.recurrence,
        roomId,
        hostId: user.uid,
        hostEmail,
        hostName,
        createdBy: hostEmail || hostName,
        participants: [user.uid],
        acceptedUids: [user.uid],
        acceptedNames: [hostName],
        invitedEmails: parsedEmails,
        isMeeting: true,
        coverImage: newMeeting.coverImage || '',
        createdAt: Timestamp.now()
      });

      await setDoc(doc(db, 'rooms', roomId), {
        hostId: user.uid,
        hostEmail,
        hostName,
        title: resolvedTitle,
        createdAt: Date.now(),
        lobby: false,
        admittedList: [user.uid, hostEmail, hostName].filter(Boolean)
      }, { merge: true });

      if (parsedEmails.length > 0) {
        await sendMeetingInviteToEmails({ id: roomId, roomId, title: resolvedTitle, hostName }, parsedEmails);
      }

      const inviteLink = `${window.location.origin}/invite/${roomId}`;
      try {
        await navigator.clipboard.writeText(inviteLink);
      } catch {}

      setIsScheduling(false);
      setShowScheduleExtras(false);
      setNewMeeting({ 
        title: '', 
        description: '', 
        date: format(new Date(), 'yyyy-MM-dd'), 
        time: getRoundedScheduleTime(15), 
        durationMins: 30,
        recurrence: 'none',
        coverImage: '',
        invitedEmails: ''
      });
      setDashboardToast({
        message: parsedEmails.length > 0
          ? `Meeting scheduled & invite link copied (${parsedEmails.length} invited)`
          : 'Meeting scheduled & invite link copied',
        type: 'success'
      });
      setTimeout(() => setDashboardToast(null), 3500);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'meetings');
    }
  };

  const joinMeeting = async (roomId: string, isInstant = false) => {
    if (isInstant && user) {
      const hostEmail = user.email || "";
      const hostName = user.displayName || user.email?.split('@')[0] || 'Host';

      try {
        await setDoc(doc(db, 'meetings', roomId), {
          title: `Instant Meeting ${roomId}`,
          roomId,
          hostId: user.uid,
          hostEmail,
          hostName,
          createdBy: hostEmail || hostName,
          participants: [user.uid],
          isMeeting: true,
          isInstant: true,
          createdAt: Timestamp.now()
        }, { merge: true });

        await setDoc(doc(db, 'rooms', roomId), {
          hostId: user.uid,
          hostEmail,
          hostName,
          createdAt: Date.now(),
          lobby: false,
          admittedList: [user.uid, hostEmail, hostName].filter(Boolean)
        }, { merge: true });
      } catch (err) {
        console.warn("Instant meeting Firestore setup:", err);
      }
    }

    if (isInstant || typeof window !== 'undefined') {
      try {
        localStorage.setItem(`forum_room_host_${roomId}`, 'true');
      } catch (e) {}
    }
    navigate(`/meeting/${roomId}`);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex">
      {/* Sidebar - Desktop */}
      <aside className={cn(
        "bg-white border-r border-gray-200 flex flex-col hidden md:flex sticky top-0 h-screen shrink-0 transition-all duration-300",
        isSidebarCollapsed ? "w-20" : "w-64"
      )}>
        <div className="p-6 flex items-center justify-between gap-3 overflow-hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-gray-100 p-1.5 overflow-hidden shrink-0">
              <img src="https://komuhost.vercel.app/favicon.ico" className="w-full h-full object-contain" alt="Forum" referrerPolicy="no-referrer" />
            </div>
            {!isSidebarCollapsed && (
              <span className="text-2xl font-bold text-gray-900 tracking-tight truncate">Forum</span>
            )}
          </div>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all shrink-0"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scroll">
          <SidebarItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeSidebarTab === 'dashboard'} 
            onClick={() => setActiveSidebarTab('dashboard')}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<Video size={20} />} 
            label="Meetings" 
            active={activeSidebarTab === 'meetings'} 
            onClick={() => setActiveSidebarTab('meetings')}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<Calendar size={20} />} 
            label="Calendar" 
            active={activeSidebarTab === 'calendar'} 
            onClick={() => setActiveSidebarTab('calendar')}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<Users size={20} />} 
            label="Contacts" 
            active={activeSidebarTab === 'contacts'} 
            onClick={() => setActiveSidebarTab('contacts')}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<FileText size={20} />} 
            label="Notes" 
            active={activeSidebarTab === 'notes'} 
            onClick={() => setActiveSidebarTab('notes')}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<Layers size={20} />} 
            label="Canvas" 
            active={activeSidebarTab === 'canvas'} 
            onClick={() => setActiveSidebarTab('canvas')}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<Video size={20} />} 
            label="Clips" 
            active={activeSidebarTab === 'clips'} 
            onClick={() => setActiveSidebarTab('clips')}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<Star size={20} />} 
            label="Feedback" 
            active={false} 
            onClick={() => navigate('/feedback')}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<Settings size={20} />} 
            label="Settings" 
            active={activeSidebarTab === 'settings'} 
            onClick={() => setActiveSidebarTab('settings')}
            collapsed={isSidebarCollapsed}
          />
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={logout}
            className={cn(
              "w-full flex items-center text-gray-500 hover:text-accent-red hover:bg-red-50 rounded-xl transition-all",
              isSidebarCollapsed ? "justify-center p-3 gap-0" : "px-4 py-3 gap-3"
            )}
            title={isSidebarCollapsed ? "Sign out" : undefined}
          >
            <LogOut size={20} className="shrink-0" />
            {!isSidebarCollapsed && <span className="font-medium">Sign out</span>}
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
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-gray-100 p-1.5 overflow-hidden">
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
                  icon={<Layers size={20} />} 
                  label="Canvas" 
                  active={activeSidebarTab === 'canvas'} 
                  onClick={() => { setActiveSidebarTab('canvas'); setIsMobileMenuOpen(false); }}
                />
                <SidebarItem 
                  icon={<Video size={20} />} 
                  label="Clips" 
                  active={activeSidebarTab === 'clips'} 
                  onClick={() => { setActiveSidebarTab('clips'); setIsMobileMenuOpen(false); }}
                />
                <SidebarItem 
                  icon={<Star size={20} />} 
                  label="Feedback" 
                  active={false} 
                  onClick={() => { setIsMobileMenuOpen(false); navigate('/feedback'); }}
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
        <header className={cn(
          "bg-white flex items-center justify-between px-4 lg:px-8 sticky top-0 z-[60] shrink-0 transition-all duration-300 ease-in-out border-b border-gray-100",
          isHeaderVisible
            ? "h-16 lg:h-20 opacity-100 overflow-visible"
            : "h-0 opacity-0 border-b-transparent pointer-events-none overflow-hidden"
        )}>
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
                      {contacts.filter(c => (c.displayName || c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (c.email || '').toLowerCase().includes(searchQuery.toLowerCase())).length > 0 && (
                        <div>
                          <p className="px-2 pb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Contacts</p>
                          <div className="space-y-1">
                            {contacts.filter(c => (c.displayName || c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (c.email || '').toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 3).map(c => (
                              <button 
                                key={c.id}
                                onClick={() => { 
                                  setSearchQuery(''); 
                                  setShowSearchDropdown(false);
                                  setActiveSidebarTab('contacts'); 
                                }}
                                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl transition-all text-left group"
                              >
                                <img 
                                  src={c.photoURL || c.avatar || `https://www.gravatar.com/avatar/${btoa(c.email || 'user').substring(0, 10)}?d=identicon`} 
                                  className="w-10 h-10 rounded-lg object-cover shrink-0" 
                                  alt="" 
                                  referrerPolicy="no-referrer" 
                                />
                                <div>
                                  <p className="text-sm font-bold text-gray-900 group-hover:text-accent-blue transition-colors line-clamp-1">{c.displayName || c.name || c.email}</p>
                                  <p className="text-[10px] text-gray-500">{c.role || c.email || 'Contact'}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes Results */}
                      {notes.filter(n => (n.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || (n.body || n.content || '').toLowerCase().includes(searchQuery.toLowerCase())).length > 0 && (
                        <div>
                          <p className="px-2 pb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Notes</p>
                          <div className="space-y-1">
                            {notes.filter(n => (n.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || (n.body || n.content || '').toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 3).map(n => (
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
                                  <p className="text-sm font-bold text-gray-900 group-hover:text-accent-blue transition-colors line-clamp-1">{n.title || 'Untitled Note'}</p>
                                  <p className="text-[10px] text-gray-500 line-clamp-1">{n.body || n.content || ''}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No Results */}
                      {meetings.filter(m => (m.title || '').toLowerCase().includes(searchQuery.toLowerCase())).length === 0 &&
                       contacts.filter(c => (c.displayName || c.name || '').toLowerCase().includes(searchQuery.toLowerCase())).length === 0 &&
                       notes.filter(n => (n.title || '').toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
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
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-all"
              >
                <Bell size={20} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-accent-red rounded-full border-2 border-white" />
                )}
              </button>
              
              <AnimatePresence>
                {isNotificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-[70]" onClick={() => setIsNotificationsOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-3xl shadow-2xl border border-gray-100 py-4 z-[80] overflow-hidden"
                    >
                      <div className="px-6 pb-3 border-b border-gray-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 text-sm">Notifications</p>
                          {notifications.filter(n => !n.read).length > 0 && (
                            <span className="text-[11px] font-semibold text-accent-blue">
                              · {notifications.filter(n => !n.read).length} new
                            </span>
                          )}
                        </div>
                        {notifications.some(n => !n.read) && (
                          <button
                            type="button"
                            onClick={markAllNotificationsRead}
                            className="text-[11px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap"
                          >
                            Mark all read
                          </button>
                        )}
                      </div>

                      {/* Push Notification Enable Bar */}
                      <div className="px-6 py-2.5 bg-stone-50/80 border-b border-gray-100 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-600 truncate">
                          {notifPermission === 'granted' && pushPrefs.enabled
                            ? 'Push alerts active'
                            : notifPermission === 'denied'
                              ? 'Push blocked in browser'
                              : 'Get browser push alerts'}
                        </span>
                        {notifPermission !== 'granted' ? (
                          <button
                            type="button"
                            disabled={notifPermission === 'denied' || notifPermission === 'unsupported'}
                            onClick={async () => {
                              const res = await requestForumNotificationPermission();
                              setNotifPermission(res);
                              if (res === 'granted') {
                                const next = { ...pushPrefs, enabled: true };
                                setPushPrefs(next);
                                savePushPreferences(next);
                                void triggerForumPushNotification({
                                  title: 'Forum Push Notifications Enabled',
                                  body: 'You will receive calendar & meeting reminders.',
                                  url: '/dashboard'
                                });
                              }
                            }}
                            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                          >
                            Enable
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void triggerForumPushNotification({
                                title: 'Forum Alert Test',
                                body: 'Push notifications are working for Forum meetings.',
                                url: '/dashboard'
                              });
                            }}
                            className="text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap"
                          >
                            Test
                          </button>
                        )}
                      </div>

                      <div className="max-h-[380px] overflow-y-auto custom-scroll">
                        {notifications.length === 0 ? (
                          <div className="p-10 text-center space-y-3">
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-300">
                              <Bell size={20} />
                            </div>
                            <p className="text-xs text-gray-500 font-medium">You're all caught up!</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-50">
                            {notifications.map(n => (
                              <button 
                                key={n.id} 
                                onClick={() => {
                                  markNotificationRead(n.id);
                                  setIsNotificationsOpen(false);
                                  if (n.roomId) navigate(`/invite/${n.roomId}`);
                                }}
                                className={cn(
                                  "w-full px-6 py-4 text-left transition-all hover:bg-gray-50 flex gap-3 cursor-pointer",
                                  !n.read && "bg-blue-50/30"
                                )}
                              >
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                  n.type === 'meeting' ? "bg-blue-50 text-accent-blue" : "bg-gray-100 text-gray-500"
                                )}>
                                  {n.type === 'meeting' ? <Video size={16} /> : <Bell size={16} />}
                                </div>
                                <div className="space-y-1 min-w-0">
                                  <p className="text-sm font-bold text-gray-900 line-clamp-1">{n.title}</p>
                                  <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{n.message}</p>
                                  <p className="text-[10px] text-gray-400">{n.createdAt?.toDate ? format(n.createdAt.toDate(), 'h:mm a') : 'Now'}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-3 pl-2 sm:pl-4">
              {user ? (
                <>
                  {/* Interactive User Presence Status Selector */}
                  <div className="relative">
                    {(() => {
                      const meta = getPresenceMeta(userStatus, userStatus !== 'offline');
                      return (
                        <button
                          type="button"
                          onClick={() => setIsStatusMenuOpen(v => !v)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-neutral-200/80 hover:border-slate-300 rounded-xl text-xs font-medium text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                          title="Set your availability status"
                        >
                          <span className={cn("w-2 h-2 rounded-full shrink-0", meta.dotClass)} />
                          <span className="hidden sm:inline">{meta.label}</span>
                          <ChevronDown size={13} className="text-slate-400" />
                        </button>
                      );
                    })()}

                    <AnimatePresence>
                      {isStatusMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsStatusMenuOpen(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.97 }}
                            className="absolute right-0 mt-2 w-44 bg-white rounded-2xl border border-neutral-200/80 shadow-xl py-1.5 z-50"
                          >
                            {(
                              [
                                { id: 'available', label: 'Available', dot: 'bg-emerald-500' },
                                { id: 'busy', label: 'Busy', dot: 'bg-rose-500' },
                                { id: 'away', label: 'Away', dot: 'bg-amber-400' },
                                { id: 'offline', label: 'Appear Offline', dot: 'bg-slate-300' },
                              ] as const
                            ).map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => handleStatusChange(option.id)}
                                className={cn(
                                  "w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors cursor-pointer whitespace-nowrap",
                                  userStatus === option.id
                                    ? "bg-stone-100 text-slate-900 font-semibold"
                                    : "text-slate-700 hover:bg-stone-50"
                                )}
                              >
                                <span className="flex items-center gap-2.5">
                                  <span className={cn("w-2 h-2 rounded-full shrink-0", option.dot)} />
                                  <span>{option.label}</span>
                                </span>
                                {userStatus === option.id && <Check size={13} className="text-emerald-700" />}
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt="Avatar" 
                      className="w-9 h-9 rounded-full object-cover shadow-sm ring-1 ring-gray-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shadow-sm">
                      {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </>
              ) : (
                <button 
                  onClick={login}
                  disabled={isLoggingIn}
                  className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-60"
                >
                  {isLoggingIn ? (
                    <div className="w-3.5 h-3.5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-3.5 h-3.5 shrink-0" alt="Google" />
                  )}
                  <span>Sign in with Google</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <div onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scroll bg-gray-50/30">
          <div className="max-w-6xl mx-auto space-y-6 lg:space-y-8">
            {/* Guest Banner */}
            {!user && (
              <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3.5 text-center sm:text-left">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Sign in to save your workspace</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Sync meetings, contacts, notes, and Google Calendar seamlessly across all your devices.</p>
                  </div>
                </div>
                <button 
                  onClick={login}
                  disabled={isLoggingIn}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-all shadow-xs flex items-center justify-center gap-2 shrink-0 active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  {isLoggingIn ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-3.5 h-3.5 shrink-0 brightness-0 invert" alt="Google" />
                  )}
                  <span>Sign in with Google</span>
                </button>
              </div>
            )}

            {activeSidebarTab === 'dashboard' && (
              <>
                {/* Header Action Bar */}
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-bold text-gray-900 tracking-tight">Dashboard</h2>
                  
                  {/* Simple Grey Dropdown Button */}
                  <div className="relative">
                    <button 
                      onClick={() => setIsNewMeetingMenuOpen(!isNewMeetingMenuOpen)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-xs sm:text-sm rounded-xl transition-all"
                    >
                      <Video size={16} className="text-gray-500" />
                      <span>Meeting</span>
                      <ChevronDown size={14} className={cn("text-gray-400 transition-transform", isNewMeetingMenuOpen && "rotate-180")} />
                    </button>
                    
                    <AnimatePresence>
                      {isNewMeetingMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsNewMeetingMenuOpen(false)} />
                          <motion.div 
                            initial={{ opacity: 0, y: 4, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.98 }}
                            className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl py-1.5 z-50 overflow-hidden"
                          >
                            <button 
                              onClick={() => {
                                const id = Math.random().toString(36).substring(2, 12);
                                joinMeeting(id, true);
                                setIsNewMeetingMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                            >
                              <Video size={15} className="text-gray-400 shrink-0" />
                              <span>Create instant meeting</span>
                            </button>
                            <button 
                              onClick={() => {
                                setIsScheduling(true);
                                setIsNewMeetingMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                            >
                              <Calendar size={15} className="text-gray-400 shrink-0" />
                              <span>Schedule meeting</span>
                            </button>
                            <button 
                              onClick={() => {
                                setIsJoinMeetingModalOpen(true);
                                setIsNewMeetingMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                            >
                              <Users size={15} className="text-gray-400 shrink-0" />
                              <span>Join meeting</span>
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Personal Meeting ID (PMI) Card */}
                <div className="bg-white p-5 sm:p-6 rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <span className="text-xs font-medium text-slate-600">
                        Personal Meeting ID
                      </span>
                      <span className="text-sm font-mono font-semibold text-slate-900">
                        pmi-{user?.uid?.substring(0, 8) || 'my-room'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Your permanent conference room link with dedicated 6-digit Host Key.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        const pmiRoom = `pmi-${user?.uid || 'guest'}`;
                        joinMeeting(pmiRoom, true);
                      }}
                      className="flex-1 md:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium transition-colors shadow-xs cursor-pointer whitespace-nowrap"
                    >
                      Start PMI Call
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const link = `${window.location.origin}/meeting/pmi-${user?.uid || 'guest'}`;
                        navigator.clipboard.writeText(`Join my Personal Meeting Room: ${link}`);
                        setDashboardToast({ message: "Personal Meeting link copied to clipboard", type: 'success' });
                      }}
                      className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Copy size={13} />
                      <span>Copy Link</span>
                    </button>
                  </div>
                </div>

                {/* Meetings List & Recent Recordings Sidebars */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Clock size={18} className="text-gray-400" />
                        Upcoming Meetings
                      </h3>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <div 
                            onClick={() => setShowPastInUpcoming(!showPastInUpcoming)}
                            className={cn(
                              "w-8 h-4 rounded-full relative transition-all",
                              showPastInUpcoming ? "bg-gray-800" : "bg-gray-200"
                            )}
                          >
                            <div className={cn(
                              "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm",
                              showPastInUpcoming ? "left-4.5" : "left-0.5"
                            )} />
                          </div>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider group-hover:text-gray-600 transition-colors">Past</span>
                        </label>
                        <button onClick={() => setActiveSidebarTab('meetings')} className="text-sm font-medium text-gray-500 hover:text-gray-900">View all</button>
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
                              <div className="p-12 bg-white rounded-3xl shadow-sm text-center space-y-4">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                                  <Calendar className="text-gray-300" size={32} />
                                </div>
                                <p className="text-gray-500 font-medium">No meetings found.</p>
                                <button onClick={() => setIsScheduling(true)} className="text-gray-900 font-semibold text-sm hover:underline">Schedule one now</button>
                              </div>
                            );
                          }

                          return items.slice(0, 3).map(meeting => (
                            <MeetingCard 
                              key={meeting.id} 
                              meeting={meeting} 
                              onJoin={() => joinMeeting(meeting.roomId)}
                              onInvite={() => {
                                setInviteModalMeeting(meeting);
                                setInviteEmailInput('');
                                setInviteLinkCopied(false);
                              }}
                              onEdit={() => handleEditMeeting(meeting)}
                              onDelete={() => handleDeleteMeeting(meeting.id)}
                            />
                          ));
                        })()
                      )}
                    </div>
                  </div>

                  {/* Side Panel: Dynamic Recent Recordings Only */}
                  <div className="space-y-0">
                    <div className="bg-white p-6 rounded-3xl shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Recordings</h3>
                      <div className="space-y-4">
                        {recordings.length === 0 ? (
                          <div className="p-8 bg-gray-50 rounded-2xl text-center">
                            <Video className="text-gray-300 mx-auto mb-2" size={24} />
                            <p className="text-xs text-gray-500">No recordings yet.</p>
                          </div>
                        ) : (
                          recordings.slice(0, 3).map(rec => (
                            <div key={rec.id} className="p-4 bg-gray-50 rounded-2xl flex items-center gap-3 group cursor-pointer hover:bg-gray-100 transition-all">
                              <div className="w-10 h-10 bg-gray-100 text-gray-500 rounded-xl flex items-center justify-center">
                                <Video size={18} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{rec.title || 'Meeting Recording'}</p>
                                <p className="text-[10px] text-gray-400">
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
                        className="w-full mt-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
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
                    <div className="flex items-center gap-1 bg-white rounded-xl px-1.5 py-1 shadow-sm">
                      <button onClick={() => {
                        const d = new Date(selectedDate);
                        if (calendarView === 'month') d.setMonth(d.getMonth() - 1);
                        else d.setDate(d.getDate() - 7);
                        setSelectedDate(d);
                      }} className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-500"><ChevronLeft size={16} /></button>
                      <span className="text-xs sm:text-sm font-semibold px-1 sm:px-2 whitespace-nowrap min-w-[100px] text-center text-gray-800">{format(selectedDate, calendarView === 'month' ? 'MMMM yyyy' : 'MMM d')}</span>
                      <button onClick={() => {
                        const d = new Date(selectedDate);
                        if (calendarView === 'month') d.setMonth(d.getMonth() + 1);
                        else d.setDate(d.getDate() + 7);
                        setSelectedDate(d);
                      }} className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-500"><ChevronRight size={16} /></button>
                    </div>
                    <button 
                      onClick={() => setIsScheduling(true)}
                      className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium text-xs sm:text-sm shadow-sm transition-all active:scale-95"
                    >
                      New Event
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 bg-white rounded-3xl shadow-sm overflow-hidden flex flex-col">
                  {calendarView === 'month' ? (
                    <CalendarMonthView 
                      selectedDate={selectedDate} 
                      meetings={meetings.filter(m => showAllEvents || m.isMeeting)} 
                      onEditMeeting={handleEditMeeting} 
                      onAddMeeting={(d) => {
                        setNewMeeting({ ...newMeeting, date: format(d, 'yyyy-MM-dd') });
                        setIsScheduling(true);
                      }}
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
                        "px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all shrink-0",
                        meetingSubTab === 'upcoming' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Upcoming
                    </button>
                    <button 
                      onClick={() => { setMeetingSubTab('previous'); setMeetingsPage(1); }}
                      className={cn(
                        "px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all shrink-0",
                        meetingSubTab === 'previous' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Previous
                    </button>
                    <button 
                      onClick={() => { setMeetingSubTab('recordings'); setMeetingsPage(1); }}
                      className={cn(
                        "px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all shrink-0",
                        meetingSubTab === 'recordings' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
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
                        <div className="p-12 text-center text-gray-500 bg-white rounded-3xl shadow-sm">
                          {isSearching ? `No results for "${searchQuery}"` : "No upcoming meetings."}
                          {isSearching && <button onClick={() => setSearchQuery('')} className="block mx-auto mt-2 text-gray-700 font-semibold text-xs uppercase tracking-wider hover:underline">Clear Search</button>}
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
                                onInvite={() => {
                                  setInviteModalMeeting(meeting);
                                  setInviteEmailInput('');
                                  setInviteLinkCopied(false);
                                }}
                                onEdit={() => handleEditMeeting(meeting)}
                                onDelete={() => handleDeleteMeeting(meeting.id)}
                              />
                            ))}
                          </div>
                          
                          {!isSearching && totalPages > 1 && (
                            <div className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm mt-6">
                              <button 
                                disabled={meetingsPage === 1}
                                onClick={() => setMeetingsPage(p => p - 1)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 disabled:opacity-30 hover:bg-gray-50 rounded-xl transition-all"
                              >
                                <ChevronLeft size={18} />
                                Previous
                              </button>
                              <span className="text-xs font-medium text-gray-400">Page {meetingsPage} of {totalPages}</span>
                              <button 
                                disabled={meetingsPage === totalPages}
                                onClick={() => setMeetingsPage(p => p + 1)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-30 hover:bg-gray-50 rounded-xl transition-all"
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
                        <div className="p-12 text-center text-gray-500 bg-white rounded-3xl shadow-sm">
                           {isSearching ? `No results for "${searchQuery}"` : "No previous meetings found in your history."}
                           {isSearching && <button onClick={() => setSearchQuery('')} className="block mx-auto mt-2 text-gray-700 font-semibold text-xs uppercase tracking-wider hover:underline">Clear Search</button>}
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
                                onInvite={() => {
                                  setInviteModalMeeting(meeting);
                                  setInviteEmailInput('');
                                  setInviteLinkCopied(false);
                                }}
                                onEdit={() => handleEditMeeting(meeting)}
                                onDelete={() => handleDeleteMeeting(meeting.id)}
                              />
                            ))}
                          </div>
                          
                          {!isSearching && totalPages > 1 && (
                            <div className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm mt-6">
                              <button 
                                disabled={meetingsPage === 1}
                                onClick={() => setMeetingsPage(p => p - 1)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 disabled:opacity-30 hover:bg-gray-50 rounded-xl transition-all"
                              >
                                <ChevronLeft size={18} />
                                Previous
                              </button>
                              <span className="text-xs font-medium text-gray-400">Page {meetingsPage} of {totalPages}</span>
                              <button 
                                disabled={meetingsPage === totalPages}
                                onClick={() => setMeetingsPage(p => p + 1)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-30 hover:bg-gray-50 rounded-xl transition-all"
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
                      <div className="p-12 bg-white rounded-3xl shadow-sm text-center text-gray-500">
                        Cloud recordings will appear here once available.
                      </div>
                    ) : (
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {recordings.map(rec => (
                          <div key={rec.id} className="bg-white p-6 rounded-3xl shadow-sm space-y-4 hover:shadow-md transition-all cursor-pointer group">
                             <div className="aspect-video bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-600 transition-all overflow-hidden relative">
                                <Video size={32} />
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
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-light text-slate-900 tracking-tight">Contacts</h2>
                    <p className="text-xs text-slate-500 mt-1">Manage and sync your conference directory</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative group min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-700 transition-colors" size={15} />
                      <input 
                        type="text" 
                        placeholder="Search contacts..." 
                        value={contactSearchQuery}
                        onChange={(e) => setContactSearchQuery(e.target.value)}
                        className="pl-9 pr-3.5 py-2 bg-white rounded-xl border border-neutral-200/80 text-xs text-slate-900 placeholder-slate-400 outline-none focus:ring-1 focus:ring-emerald-700/50 w-full transition-all shadow-xs"
                      />
                    </div>
                    <button 
                      onClick={() => setIsImportContactsModalOpen(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-stone-50 text-slate-800 rounded-xl text-xs font-medium transition-colors border border-neutral-200/80 cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      <FolderUp size={14} className="text-slate-600" />
                      <span>Import Contacts</span>
                    </button>
                    <button 
                      onClick={() => setIsAddContactModalOpen(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      <Plus size={14} />
                      <span>Add Contact</span>
                    </button>
                  </div>
                </div>

                {contacts.length === 0 ? (
                  <div className="p-12 bg-white rounded-2xl border border-neutral-200/70 text-center space-y-3">
                    <div className="w-12 h-12 bg-stone-100 rounded-2xl border border-neutral-200 flex items-center justify-center mx-auto text-slate-500">
                      <Users size={20} />
                    </div>
                    <p className="text-sm font-medium text-slate-900">No contacts in directory</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      Add contacts manually or import a contact list to quickly invite attendees to your meetings.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {contacts
                      .filter(c => 
                        (c.displayName || '').toLowerCase().includes(contactSearchQuery.toLowerCase()) || 
                        (c.email || '').toLowerCase().includes(contactSearchQuery.toLowerCase())
                      )
                      .map(contact => {
                        const emailKey = (contact.email || '').trim().toLowerCase();
                        const presence = contactStatuses[emailKey];
                        const presenceMeta = getPresenceMeta(presence?.status, presence?.isOnline, presence?.lastSeen, presence?.inMeetingHeartbeat);
                        return (
                      <div key={contact.id} className="bg-white p-4 rounded-2xl border border-neutral-200/70 hover:border-slate-300 transition-all flex items-center gap-3.5 shadow-xs">
                        <div className="w-10 h-10 rounded-xl relative bg-stone-100 border border-neutral-200/60 shrink-0 flex items-center justify-center font-medium text-slate-700 text-xs">
                          <div className="w-full h-full rounded-xl overflow-hidden flex items-center justify-center">
                            {contact.photoURL ? (
                              <img 
                                src={contact.photoURL} 
                                className="w-full h-full object-cover" 
                                alt={contact.displayName} 
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span>{(contact.displayName || contact.email || 'U').charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <span
                            title={presenceMeta.label}
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                              presenceMeta.dotClass
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-xs truncate">{contact.displayName || contact.email}</p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{contact.email}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", presenceMeta.dotClass)} />
                            <span>{presenceMeta.label}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button 
                            className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-slate-700 text-[11px] font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap" 
                            title="Copy auto-calendar meeting invite link for this contact"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const pmiRoom = `pmi-${user?.uid || 'guest'}`;
                              const inviteLink = `${window.location.origin}/invite/${pmiRoom}`;
                              navigator.clipboard.writeText(inviteLink);
                              if (contact.email) {
                                await sendMeetingInviteToEmails(
                                  { id: pmiRoom, roomId: pmiRoom, title: `${user?.displayName || 'Personal'} Meeting`, hostName: user?.displayName || 'Host' },
                                  [contact.email]
                                );
                              }
                              setDashboardToast({ message: `Calendar invite copied & sent for ${contact.displayName || contact.email}`, type: 'success' });
                              setTimeout(() => setDashboardToast(null), 3000);
                            }}
                          >
                            Invite
                          </button>
                          <button 
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" 
                            title="Remove contact"
                            onClick={(e) => {
                              e.stopPropagation();
                              setContactToDelete(contact);
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {activeSidebarTab === 'notes' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-light text-slate-900 tracking-tight">Notes & Transcripts</h2>
                    <p className="text-xs text-slate-500 mt-1">Review meeting transcripts, notes, and AI summaries</p>
                  </div>
                  {/* Filter Subtabs */}
                  <div className="inline-flex p-1 bg-stone-100 rounded-xl border border-neutral-200/70 shrink-0">
                    <button
                      onClick={() => setNotesFilter('all')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap",
                        notesFilter === 'all' ? "bg-white text-slate-900 shadow-xs font-medium border border-neutral-200/60" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      All ({notes.length})
                    </button>
                    <button
                      onClick={() => setNotesFilter('transcripts')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap",
                        notesFilter === 'transcripts' ? "bg-white text-slate-900 shadow-xs font-medium border border-neutral-200/60" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Transcripts ({notes.filter(n => n.title?.includes('Transcript') || n.type === 'transcript').length})
                    </button>
                    <button
                      onClick={() => setNotesFilter('notes')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap",
                        notesFilter === 'notes' ? "bg-white text-slate-900 shadow-xs font-medium border border-neutral-200/60" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Notes ({notes.filter(n => !n.title?.includes('Transcript') && n.type !== 'transcript').length})
                    </button>
                  </div>
                </div>

                {notes.length === 0 ? (
                  <div className="p-12 bg-white rounded-2xl border border-neutral-200/70 text-center space-y-3">
                    <div className="w-12 h-12 bg-stone-100 rounded-2xl border border-neutral-200 flex items-center justify-center mx-auto text-slate-500">
                      <FileText size={20} />
                    </div>
                    <p className="text-sm font-medium text-slate-900">No notes or transcripts yet</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      Enable live captions or automatic transcript saving in meetings to generate real-time records here.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {notes
                      .filter(note => {
                        const isTranscript = note.title?.includes('Transcript') || note.type === 'transcript';
                        if (notesFilter === 'transcripts') return isTranscript;
                        if (notesFilter === 'notes') return !isTranscript;
                        return true;
                      })
                      .map(note => {
                        const isTranscript = note.title?.includes('Transcript') || note.type === 'transcript';
                        return (
                          <div 
                            key={note.id} 
                            onClick={() => setEditingNote(note)}
                            className="bg-white p-5 rounded-2xl border border-neutral-200/70 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between space-y-3.5 shadow-xs group"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className={cn(
                                  "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-medium border",
                                  isTranscript ? "bg-emerald-50 text-emerald-800 border-emerald-200/60" : "bg-stone-100 text-slate-700 border-neutral-200/60"
                                )}>
                                  {isTranscript ? <MessageSquare size={14} /> : <FileText size={14} />}
                                </div>
                                {isTranscript && (
                                  <span className="text-[11px] font-medium text-emerald-700">
                                    Transcript
                                  </span>
                                )}
                              </div>
                              <h4 className="font-semibold text-slate-900 text-sm line-clamp-1 group-hover:text-emerald-800 transition-colors">
                                {note.title || 'Untitled'}
                              </h4>
                              <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed whitespace-pre-line">
                                {note.body || 'No content recorded'}
                              </p>
                            </div>
                            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] text-slate-400">
                              <span>
                                {note.updatedAt?.toDate ? format(note.updatedAt.toDate(), 'MMM d, yyyy') : 'Recently'}
                              </span>
                              <span className="text-slate-500 font-medium group-hover:underline">View Details →</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {activeSidebarTab === 'settings' && (
              <div className="max-w-2xl space-y-8 h-full pb-20">
                <div className="flex items-center justify-between sticky top-0 bg-gray-50/80 backdrop-blur-md z-10 py-2 -mx-2 px-2">
                  <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                  <button 
                    onClick={() => {
                      saveSettings(settings);
                      setDashboardToast({ message: 'Settings saved successfully', type: 'success' });
                      setTimeout(() => setDashboardToast(null), 3000);
                    }}
                    className="px-5 sm:px-8 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium text-sm shadow-sm transition-all active:scale-95"
                  >
                    Save Changes
                  </button>
                </div>
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl shadow-sm space-y-4">
                    <h3 className="font-bold text-gray-900">Profile Settings</h3>
                    <div className="flex items-center gap-4">
                      <img src={user?.photoURL || ''} className="w-16 h-16 rounded-full object-cover shadow-sm ring-1 ring-gray-200" alt="Profile" referrerPolicy="no-referrer" />
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
                  <div className="bg-white p-6 rounded-3xl shadow-sm space-y-4">
                    <h3 className="font-bold text-gray-900">Meeting Experience</h3>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-gray-900">Always mute microphone</span>
                        <p className="text-[10px] text-gray-500">Mute yourself automatically when joining a call</p>
                      </div>
                      <button 
                        onClick={() => saveSettings({ ...settings, muteOnJoin: !settings.muteOnJoin })}
                        className={cn("w-10 h-5 rounded-full relative transition-all", settings.muteOnJoin ? "bg-gray-900" : "bg-gray-200")}
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
                        className={cn("w-10 h-5 rounded-full relative transition-all", settings.videoOffOnJoin ? "bg-gray-900" : "bg-gray-200")}
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
                        className={cn("w-10 h-5 rounded-full relative transition-all", settings.mirrorVideo ? "bg-gray-900" : "bg-gray-200")}
                      >
                        <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all", settings.mirrorVideo ? "right-1" : "left-1")} />
                      </button>
                    </div>
                  </div>

                  {/* Push Notifications Section */}
                  <div className="bg-white p-6 rounded-3xl shadow-sm space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-gray-900">Push Notifications</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {notifPermission === 'granted'
                            ? 'Browser push alerts are enabled on this device'
                            : notifPermission === 'denied'
                              ? 'Blocked in browser permissions'
                              : notifPermission === 'unsupported'
                                ? 'Not supported in this browser'
                                : 'Enable real-time meeting and calendar alerts'}
                        </p>
                      </div>
                      {notifPermission !== 'granted' ? (
                        <button
                          type="button"
                          disabled={notifPermission === 'denied' || notifPermission === 'unsupported'}
                          onClick={async () => {
                            const res = await requestForumNotificationPermission();
                            setNotifPermission(res);
                            if (res === 'granted') {
                              const next = { ...pushPrefs, enabled: true };
                              setPushPrefs(next);
                              savePushPreferences(next);
                              setDashboardToast({ message: 'Push notifications enabled!', type: 'success' });
                              setTimeout(() => setDashboardToast(null), 2500);
                            }
                          }}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
                        >
                          Enable Push
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            await triggerForumPushNotification({
                              title: 'Forum Push Notifications',
                              body: 'Notifications are active for meeting invites & reminders.',
                              url: '/dashboard'
                            });
                            setDashboardToast({ message: 'Test notification sent', type: 'success' });
                            setTimeout(() => setDashboardToast(null), 2500);
                          }}
                          className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-slate-800 text-xs font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Send Test Alert
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-gray-900">Upcoming meeting reminders</span>
                        <p className="text-[10px] text-gray-500">Notify 10 minutes before scheduled calls start</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...pushPrefs, meetingReminders: !pushPrefs.meetingReminders };
                          setPushPrefs(next);
                          savePushPreferences(next);
                        }}
                        className={cn("w-10 h-5 rounded-full relative transition-all cursor-pointer", pushPrefs.meetingReminders ? "bg-gray-900" : "bg-gray-200")}
                      >
                        <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all", pushPrefs.meetingReminders ? "right-1" : "left-1")} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-gray-900">Calendar & invite notifications</span>
                        <p className="text-[10px] text-gray-500">Alert when someone invites you to a Forum meeting</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...pushPrefs, inviteAlerts: !pushPrefs.inviteAlerts };
                          setPushPrefs(next);
                          savePushPreferences(next);
                        }}
                        className={cn("w-10 h-5 rounded-full relative transition-all cursor-pointer", pushPrefs.inviteAlerts ? "bg-gray-900" : "bg-gray-200")}
                      >
                        <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all", pushPrefs.inviteAlerts ? "right-1" : "left-1")} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSidebarTab === 'canvas' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-light text-slate-900 tracking-tight">Canvas Workspace</h2>
                  <p className="text-xs text-slate-500 mt-1">Organize ideas, projects, and actionable conference takeaways</p>
                </div>
                <div className="min-h-[560px]">
                  <MeetingCanvas userId={user?.uid || 'user'} userName={user?.displayName || 'Host'} />
                </div>
              </div>
            )}

            {activeSidebarTab === 'clips' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-light text-slate-900 tracking-tight">Clips Basic</h2>
                  <p className="text-xs text-slate-500 mt-1">Record and export quick screen recordings or webcam video messages</p>
                </div>
                <ClipsBasic userId={user?.uid || 'user'} userName={user?.displayName || 'Host'} />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {isAddContactModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white w-full max-w-md rounded-2xl border border-neutral-200/80 shadow-md p-6 sm:p-7 space-y-5 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-light text-slate-900 tracking-tight">Add Contact</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Add an individual to your conference directory</p>
                </div>
                <button 
                  onClick={() => setIsAddContactModalOpen(false)} 
                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddContact} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Full Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Sarah Connor"
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                    value={newContact.displayName}
                    onChange={e => setNewContact(prev => ({ ...prev, displayName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Email Address</label>
                  <input 
                    type="email" 
                    required
                    placeholder="name@company.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                    value={newContact.email}
                    onChange={e => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button 
                    type="button"
                    onClick={() => setIsAddContactModalOpen(false)}
                    className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs whitespace-nowrap cursor-pointer"
                  >
                    Save Contact
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Contacts Modal */}
      <AnimatePresence>
        {isImportContactsModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white w-full max-w-lg rounded-2xl border border-neutral-200/80 shadow-md p-6 sm:p-7 space-y-5 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-light text-slate-900 tracking-tight">Import Contacts</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Paste list of contacts or upload a CSV file</p>
                </div>
                <button 
                  onClick={() => setIsImportContactsModalOpen(false)} 
                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleImportContacts} className="space-y-4">
                <div className="flex items-center justify-between gap-3 p-3 bg-stone-50 rounded-xl border border-neutral-200/70">
                  <div className="text-xs text-slate-600">
                    <p className="font-medium text-slate-900">Supported format</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">One contact per line: <code className="bg-stone-200/70 px-1 rounded">Name, email@domain.com</code></p>
                  </div>
                  <label className="px-3 py-1.5 bg-white hover:bg-stone-100 border border-neutral-300 text-slate-800 rounded-lg text-xs font-medium cursor-pointer shadow-xs whitespace-nowrap">
                    Upload CSV
                    <input 
                      type="file" 
                      accept=".csv,.txt" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setImportContactsText(event.target?.result as string || '');
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Contacts Data</label>
                  <textarea 
                    rows={6}
                    placeholder={"Alice Smith, alice@example.com\nBob Jones, bob@company.org\ncarol@domain.io"}
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors resize-none leading-relaxed"
                    value={importContactsText}
                    onChange={e => setImportContactsText(e.target.value)}
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button 
                    type="button"
                    onClick={() => setIsImportContactsModalOpen(false)}
                    className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={!importContactsText.trim()}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    Import Contacts
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Contact Confirmation Modal */}
      <AnimatePresence>
        {contactToDelete && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white w-full max-w-sm rounded-2xl border border-neutral-200/80 shadow-md p-6 space-y-4 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-light text-slate-900 tracking-tight">Remove Contact</h3>
                <button onClick={() => setContactToDelete(null)} className="p-1 text-slate-400 hover:text-slate-800 rounded-lg">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-slate-900">{contactToDelete.displayName || contactToDelete.email}</span> from your contacts?
              </p>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button 
                  onClick={() => setContactToDelete(null)}
                  className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteContact(contactToDelete.id)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-medium transition-colors shadow-xs whitespace-nowrap cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Meeting Confirmation Modal */}
      <AnimatePresence>
        {meetingToDelete && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="bg-white w-full max-w-sm rounded-2xl border border-neutral-200/80 shadow-md p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-light text-slate-900 tracking-tight">Delete Meeting</h3>
                <button onClick={() => setMeetingToDelete(null)} className="p-1 text-slate-400 hover:text-slate-800 rounded-lg">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-slate-900">{meetingToDelete.title || "this meeting"}</span>? This action cannot be undone.
              </p>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button 
                  onClick={() => setMeetingToDelete(null)}
                  className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteMeeting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-medium transition-colors shadow-xs whitespace-nowrap cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Real-time Push & Notification Banner */}
      <AnimatePresence>
        {liveNotificationAlert && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            className="fixed top-5 right-5 z-[320] w-80 max-w-[calc(100vw-2.5rem)] bg-white border border-neutral-200/80 rounded-2xl shadow-xl p-4 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{liveNotificationAlert.title}</p>
                  {liveNotificationAlert.body && (
                    <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2 mt-0.5">{liveNotificationAlert.body}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLiveNotificationAlert(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            {liveNotificationAlert.url && liveNotificationAlert.url !== '/dashboard' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const target = liveNotificationAlert.url!;
                    setLiveNotificationAlert(null);
                    navigate(target);
                  }}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Open
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dashboard Minimalist Floating Toast */}
      <AnimatePresence>
        {dashboardToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[300] flex items-center gap-2.5 px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-xl shadow-lg border border-slate-800"
          >
            <span>{dashboardToast.message}</span>
            {dashboardToast.type === 'error' && (
              <SendErrorFeedbackButton
                variant="dark"
                errorMessage={dashboardToast.message}
                source="Dashboard"
              />
            )}
            <button 
              onClick={() => setDashboardToast(null)}
              className="p-0.5 text-slate-400 hover:text-white rounded"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Note & Meeting Transcript Viewer / Editor Modal */}
      <AnimatePresence>
        {editingNote && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white w-full max-w-3xl h-[85vh] rounded-2xl border border-neutral-200/80 shadow-md overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-5 sm:p-6 border-b border-neutral-200/80 flex items-center justify-between gap-4 shrink-0 bg-white">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "text-xs font-medium",
                      editingNote.title?.includes('Transcript') || editingNote.type === 'transcript'
                        ? "text-emerald-700"
                        : "text-slate-600"
                    )}>
                      {editingNote.title?.includes('Transcript') || editingNote.type === 'transcript' ? 'Meeting Transcript' : 'Document Note'}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] text-slate-400">
                      {editingNote.updatedAt?.toDate ? format(editingNote.updatedAt.toDate(), 'MMMM d, yyyy • h:mm a') : 'Saved locally'}
                    </span>
                  </div>
                  <input 
                    type="text"
                    value={editingNote.title}
                    onChange={e => setEditingNote({ ...editingNote, title: e.target.value })}
                    placeholder="Note Title"
                    className="text-lg sm:text-xl font-light text-slate-900 border-none outline-none w-full bg-transparent tracking-tight"
                  />
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${editingNote.title}\n\n${editingNote.body}`);
                      setNoteCopied(true);
                      setTimeout(() => setNoteCopied(false), 2000);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-stone-100 hover:bg-stone-200/70 border border-neutral-200 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                    title="Copy to clipboard"
                  >
                    {noteCopied ? <Check size={13} className="text-emerald-700" /> : <Copy size={13} />}
                    <span className="hidden sm:inline">{noteCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button 
                    onClick={() => {
                      const blob = new Blob([`${editingNote.title}\n\n${editingNote.body}`], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `${editingNote.title || 'Meeting_Transcript'}.txt`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="p-2 bg-stone-100 hover:bg-stone-200/70 border border-neutral-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                    title="Download transcript"
                  >
                    <Download size={14} />
                  </button>
                  <button 
                    onClick={() => handleDeleteNote(editingNote.id)}
                    className="p-2 bg-stone-100 hover:bg-rose-50 border border-neutral-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                    title="Delete note"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button 
                    onClick={() => setEditingNote(null)} 
                    className="p-2 hover:bg-stone-100 text-slate-400 hover:text-slate-800 rounded-xl transition-colors cursor-pointer ml-1"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 p-5 sm:p-6 overflow-y-auto space-y-4 bg-stone-50/40 custom-scroll">
                <textarea 
                  value={editingNote.body}
                  onChange={e => setEditingNote({ ...editingNote, body: e.target.value })}
                  placeholder="Record transcripts or take meeting notes..."
                  className="w-full h-full min-h-[350px] border-none outline-none resize-none text-slate-800 text-xs sm:text-sm leading-relaxed font-sans bg-transparent placeholder-slate-400"
                />
              </div>

              {/* Footer */}
              <div className="p-4 sm:p-5 bg-white border-t border-neutral-200/80 flex items-center justify-between gap-3 shrink-0">
                <p className="text-[11px] text-slate-400">
                  {editingNote.body ? `${editingNote.body.split(/\s+/).filter(Boolean).length} words` : 'Empty note'}
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setEditingNote(null)}
                    className="px-4 py-2 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => handleUpdateNote(editingNote)}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs whitespace-nowrap cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Meeting Modal */}
      <AnimatePresence>
        {editingMeeting && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl border border-neutral-200/80 shadow-md flex flex-col overflow-hidden"
            >
              <div className="px-6 sm:px-7 pt-6 pb-4 border-b border-neutral-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xl font-light text-slate-900 tracking-tight">Edit Meeting</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Update schedule or cover image</p>
                </div>
                <button onClick={() => setEditingMeeting(null)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUpdateMeeting} className="p-6 sm:p-7 space-y-5 overflow-y-auto custom-scroll">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Title</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Meeting Title"
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                    value={editMeetingForm.title}
                    onChange={e => setEditMeetingForm(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                {/* Quick Date & Time Selection */}
                <div className="space-y-3 p-3.5 bg-stone-50/70 border border-neutral-200/70 rounded-xl">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-slate-700">Date</label>
                      <div className="flex items-center gap-1.5">
                        {[
                          { label: 'Today', date: format(new Date(), 'yyyy-MM-dd') },
                          { label: 'Tomorrow', date: format(new Date(Date.now() + 86400000), 'yyyy-MM-dd') },
                          { label: 'Next Week', date: format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd') },
                        ].map(item => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => setEditMeetingForm(prev => ({ ...prev, date: item.date }))}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                              editMeetingForm.date === item.date
                                ? "bg-slate-900 text-white"
                                : "bg-white border border-neutral-200 text-slate-600 hover:border-slate-400"
                            )}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input 
                      type="date" 
                      required
                      className="w-full px-3.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                      value={editMeetingForm.date}
                      onChange={e => setEditMeetingForm(prev => ({ ...prev, date: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-slate-700">Time & Duration</label>
                      <span className="text-[11px] text-emerald-700 font-medium">
                        {formatTimePreview(editMeetingForm.date, editMeetingForm.time, editMeetingForm.durationMins)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'In 15m', value: getRoundedScheduleTime(15) },
                        { label: 'Next Hour', value: getNextHourTime() },
                        { label: '9:00 AM', value: '09:00' },
                        { label: '10:00 AM', value: '10:00' },
                        { label: '12:00 PM', value: '12:00' },
                        { label: '2:00 PM', value: '14:00' },
                        { label: '4:00 PM', value: '16:00' },
                      ].map(slot => (
                        <button
                          key={slot.label}
                          type="button"
                          onClick={() => setEditMeetingForm(prev => ({ ...prev, time: slot.value }))}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                            editMeetingForm.time === slot.value
                              ? "bg-slate-900 text-white"
                              : "bg-white border border-neutral-200 text-slate-600 hover:border-slate-400"
                          )}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <input 
                        type="time" 
                        required
                        className="w-full px-3.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                        value={editMeetingForm.time}
                        onChange={e => setEditMeetingForm(prev => ({ ...prev, time: e.target.value }))}
                      />
                      <div className="grid grid-cols-4 gap-1">
                        {[15, 30, 45, 60].map(mins => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setEditMeetingForm(prev => ({ ...prev, durationMins: mins }))}
                            className={cn(
                              "rounded-xl text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap",
                              editMeetingForm.durationMins === mins
                                ? "bg-emerald-50/80 text-emerald-800 border-emerald-200/80"
                                : "bg-white border-neutral-200 text-slate-600 hover:border-slate-400"
                            )}
                          >
                            {mins === 60 ? '1h' : `${mins}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Custom Cover Image Upload (No Placeholders) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700">Cover Image (Optional)</label>
                    {editMeetingForm.coverImage && (
                      <button
                        type="button"
                        onClick={() => setEditMeetingForm(prev => ({ ...prev, coverImage: '' }))}
                        className="text-xs text-slate-500 hover:text-rose-600 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Remove cover
                      </button>
                    )}
                  </div>
                  {editMeetingForm.coverImage ? (
                    <div className="relative h-32 rounded-xl overflow-hidden border border-neutral-200 bg-stone-100">
                      <img src={editMeetingForm.coverImage} alt="Meeting cover" className="w-full h-full object-cover" />
                      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 bg-white/95 px-2 py-1 rounded-lg border border-black/5 shadow-xs">
                        <img src="/forum-logo.png" alt="Forum" className="w-4 h-4 object-contain" />
                        <span className="text-[11px] font-semibold text-slate-900">Forum</span>
                      </div>
                      <label className="absolute top-2.5 right-2.5 px-2.5 py-1.5 bg-white/95 hover:bg-white text-slate-800 rounded-lg text-[11px] font-medium border border-black/5 shadow-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
                        <Upload size={12} />
                        <span>Replace</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            try {
                              const compressed = await compressCoverImageFile(f);
                              setEditMeetingForm(prev => ({ ...prev, coverImage: compressed }));
                            } catch {}
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="flex items-center justify-between gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100/80 border border-dashed border-neutral-300 rounded-xl cursor-pointer transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Upload size={15} className="text-slate-500 shrink-0" />
                        <span className="text-xs text-slate-600 truncate">Upload a photo for WhatsApp & invite previews</span>
                      </div>
                      <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">Choose image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            const compressed = await compressCoverImageFile(f);
                            setEditMeetingForm(prev => ({ ...prev, coverImage: compressed }));
                          } catch {}
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Agenda (Optional)</label>
                  <textarea 
                    placeholder="Add meeting agenda or notes..."
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors resize-none"
                    value={editMeetingForm.description}
                    onChange={e => setEditMeetingForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-neutral-100">
                  <button 
                    type="button"
                    onClick={() => setEditingMeeting(null)}
                    className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs whitespace-nowrap cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Join Meeting Modal */}
      <AnimatePresence>
        {isJoinMeetingModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white w-full max-w-md rounded-2xl border border-neutral-200/80 shadow-md p-6 sm:p-7 space-y-5 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-light text-slate-900 tracking-tight">Join Meeting</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Enter meeting room code or conference URL</p>
                </div>
                <button onClick={() => setIsJoinMeetingModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Meeting ID or URL</label>
                  <input 
                    type="text" 
                    placeholder="e.g. room-123 or https://..."
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value)}
                  />
                </div>
                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button 
                    type="button"
                    onClick={() => setIsJoinMeetingModalOpen(false)}
                    className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (joinCode) {
                        joinMeeting(joinCode.includes('/') ? joinCode.split('/').pop() || '' : joinCode);
                        setIsJoinMeetingModalOpen(false);
                      }
                    }}
                    disabled={!joinCode.trim()}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    Join Call
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
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white w-full max-w-md rounded-2xl border border-neutral-200/80 shadow-md p-6 sm:p-7 space-y-5 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-light text-slate-900 tracking-tight">Share Screen</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Start presenting your screen to a conference</p>
                </div>
                <button onClick={() => setIsSharing(false)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Target Meeting ID (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="Leave blank to create a new session"
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                    value={shareCode}
                    onChange={e => setShareCode(e.target.value)}
                  />
                </div>
                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button 
                    type="button"
                    onClick={() => setIsSharing(false)}
                    className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      const target = shareCode || Math.random().toString(36).substring(2, 12);
                      navigate(`/meeting/${target}?share=true`);
                      setIsSharing(false);
                    }}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs whitespace-nowrap cursor-pointer"
                  >
                    Start Presenting
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Scheduling Modal */}
      <AnimatePresence>
        {isScheduling && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl border border-neutral-200/80 shadow-md flex flex-col overflow-hidden"
            >
              <div className="px-6 sm:px-7 pt-6 pb-4 border-b border-neutral-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xl font-light text-slate-900 tracking-tight">Schedule Meeting</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Pick a time and share the link — calendar syncs automatically</p>
                </div>
                <button onClick={() => setIsScheduling(false)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSchedule} className="p-6 sm:p-7 space-y-5 overflow-y-auto custom-scroll">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Meeting Title</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Design Architecture Review"
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                    value={newMeeting.title}
                    onChange={e => setNewMeeting(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                {/* Quick Date & Time Selection */}
                <div className="space-y-3 p-3.5 bg-stone-50/70 border border-neutral-200/70 rounded-xl">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-slate-700">Date</label>
                      <div className="flex items-center gap-1.5">
                        {[
                          { label: 'Today', date: format(new Date(), 'yyyy-MM-dd') },
                          { label: 'Tomorrow', date: format(new Date(Date.now() + 86400000), 'yyyy-MM-dd') },
                          { label: 'Next Week', date: format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd') },
                        ].map(item => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => setNewMeeting(prev => ({ ...prev, date: item.date }))}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                              newMeeting.date === item.date
                                ? "bg-slate-900 text-white"
                                : "bg-white border border-neutral-200 text-slate-600 hover:border-slate-400"
                            )}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input 
                      type="date" 
                      required
                      className="w-full px-3.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                      value={newMeeting.date}
                      onChange={e => setNewMeeting(prev => ({ ...prev, date: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-slate-700">Time & Duration</label>
                      <span className="text-[11px] text-emerald-700 font-medium">
                        {formatTimePreview(newMeeting.date, newMeeting.time, newMeeting.durationMins)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'In 15m', value: getRoundedScheduleTime(15) },
                        { label: 'Next Hour', value: getNextHourTime() },
                        { label: '9:00 AM', value: '09:00' },
                        { label: '10:00 AM', value: '10:00' },
                        { label: '12:00 PM', value: '12:00' },
                        { label: '2:00 PM', value: '14:00' },
                        { label: '4:00 PM', value: '16:00' },
                      ].map(slot => (
                        <button
                          key={slot.label}
                          type="button"
                          onClick={() => setNewMeeting(prev => ({ ...prev, time: slot.value }))}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                            newMeeting.time === slot.value
                              ? "bg-slate-900 text-white"
                              : "bg-white border border-neutral-200 text-slate-600 hover:border-slate-400"
                          )}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <input 
                        type="time" 
                        required
                        className="w-full px-3.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors"
                        value={newMeeting.time}
                        onChange={e => setNewMeeting(prev => ({ ...prev, time: e.target.value }))}
                      />
                      <div className="grid grid-cols-4 gap-1">
                        {[15, 30, 45, 60].map(mins => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setNewMeeting(prev => ({ ...prev, durationMins: mins }))}
                            className={cn(
                              "rounded-xl text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap",
                              newMeeting.durationMins === mins
                                ? "bg-emerald-50/80 text-emerald-800 border-emerald-200/80"
                                : "bg-white border-neutral-200 text-slate-600 hover:border-slate-400"
                            )}
                          >
                            {mins === 60 ? '1h' : `${mins}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Invite Attendees */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Invite Attendees (Optional)</label>
                  <input
                    type="text"
                    placeholder="teammate@company.com, partner@studio.io"
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 transition-colors"
                    value={newMeeting.invitedEmails}
                    onChange={e => setNewMeeting(prev => ({ ...prev, invitedEmails: e.target.value }))}
                  />
                  {contacts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {contacts.slice(0, 6).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            if (!c.email) return;
                            setNewMeeting(prev => {
                              const current = prev.invitedEmails.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
                              if (current.includes(c.email.toLowerCase())) return prev;
                              return {
                                ...prev,
                                invitedEmails: prev.invitedEmails ? `${prev.invitedEmails}, ${c.email}` : c.email
                              };
                            });
                          }}
                          className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg text-[11px] font-medium transition-colors cursor-pointer truncate max-w-[160px]"
                        >
                          + {c.displayName || c.email}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cover Image Upload Only (No Placeholders) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700">Cover Image (Optional)</label>
                    {newMeeting.coverImage && (
                      <button
                        type="button"
                        onClick={() => setNewMeeting(prev => ({ ...prev, coverImage: '' }))}
                        className="text-xs text-slate-500 hover:text-rose-600 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Remove cover
                      </button>
                    )}
                  </div>
                  {newMeeting.coverImage ? (
                    <div className="relative h-32 rounded-xl overflow-hidden border border-neutral-200 bg-stone-100">
                      <img src={newMeeting.coverImage} alt="Meeting cover" className="w-full h-full object-cover" />
                      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 bg-white/95 px-2 py-1 rounded-lg border border-black/5 shadow-xs">
                        <img src="/forum-logo.png" alt="Forum" className="w-4 h-4 object-contain" />
                        <span className="text-[11px] font-semibold text-slate-900">Forum</span>
                      </div>
                      <label className="absolute top-2.5 right-2.5 px-2.5 py-1.5 bg-white/95 hover:bg-white text-slate-800 rounded-lg text-[11px] font-medium border border-black/5 shadow-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
                        <Upload size={12} />
                        <span>Replace</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const compressed = await compressCoverImageFile(file);
                              setNewMeeting(prev => ({ ...prev, coverImage: compressed }));
                            } catch {}
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="flex items-center justify-between gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100/80 border border-dashed border-neutral-300 rounded-xl cursor-pointer transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Upload size={15} className="text-slate-500 shrink-0" />
                        <span className="text-xs text-slate-600 truncate">Upload a photo for WhatsApp & invite previews</span>
                      </div>
                      <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">Choose image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const compressed = await compressCoverImageFile(file);
                            setNewMeeting(prev => ({ ...prev, coverImage: compressed }));
                          } catch {}
                        }}
                      />
                    </label>
                  )}
                  <input
                    type="url"
                    value={newMeeting.coverImage?.startsWith('data:') ? '' : (newMeeting.coverImage || '')}
                    onChange={(e) => setNewMeeting(prev => ({ ...prev, coverImage: e.target.value }))}
                    placeholder="Or paste an image URL..."
                    className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-xl text-[11px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                  />
                </div>

                {/* Collapsible Agenda & Repeat Schedule */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowScheduleExtras(prev => !prev)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <ChevronDown size={14} className={cn("transition-transform", showScheduleExtras && "rotate-180")} />
                    <span>{showScheduleExtras ? 'Hide agenda & repeat schedule' : 'Add agenda & repeat schedule'}</span>
                  </button>

                  {showScheduleExtras && (
                    <div className="mt-3 space-y-3 pt-3 border-t border-neutral-100">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700 block">Recurrence</label>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { id: 'none', label: 'Once' },
                            { id: 'daily', label: 'Daily' },
                            { id: 'weekly', label: 'Weekly' },
                            { id: 'monthly', label: 'Monthly' },
                          ].map(option => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setNewMeeting(prev => ({ ...prev, recurrence: option.id as any }))}
                              className={cn(
                                "py-2 px-2.5 rounded-xl text-xs font-medium transition-colors border text-center cursor-pointer whitespace-nowrap",
                                newMeeting.recurrence === option.id 
                                  ? "bg-slate-900 text-white border-slate-900 shadow-xs" 
                                  : "bg-white border-neutral-200 text-slate-700 hover:bg-stone-50"
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700 block">Agenda (Optional)</label>
                        <textarea 
                          placeholder="Add meeting agenda or notes..."
                          rows={2}
                          className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 focus:border-emerald-700/50 transition-colors resize-none"
                          value={newMeeting.description}
                          onChange={e => setNewMeeting(prev => ({ ...prev, description: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-neutral-100">
                  <button 
                    type="button"
                    onClick={() => setIsScheduling(false)}
                    className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs whitespace-nowrap cursor-pointer"
                  >
                    Schedule & Copy Link
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Send Calendar Invite Modal */}
      <AnimatePresence>
        {inviteModalMeeting && (() => {
          const liveInviteMeeting = meetings.find(m => m.id === inviteModalMeeting.id) || inviteModalMeeting;
          const confirmedIds = new Set<string>([
            ...(Array.isArray(liveInviteMeeting.acceptedUids) ? liveInviteMeeting.acceptedUids : []),
            ...(Array.isArray(liveInviteMeeting.participants) ? liveInviteMeeting.participants : []),
          ]);
          const confirmedNames = Array.isArray(liveInviteMeeting.acceptedNames) ? liveInviteMeeting.acceptedNames : [];

          return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white w-full max-w-md rounded-2xl border border-neutral-200/80 shadow-md p-6 sm:p-7 space-y-5 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 pr-3">
                  <h3 className="text-xl font-light text-slate-900 tracking-tight truncate">Invite to Meeting</h3>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {liveInviteMeeting.title}
                    {confirmedIds.size > 0 && ` · ${confirmedIds.size} ${confirmedIds.size === 1 ? 'participant' : 'participants'} confirmed`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInviteModalMeeting(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {confirmedNames.length > 0 && (
                <div className="text-[11px] text-emerald-800 bg-emerald-50/70 border border-emerald-200/60 rounded-xl px-3.5 py-2.5">
                  <span className="font-medium">Confirmed:</span> {confirmedNames.join(', ')}
                </div>
              )}

              {/* Direct Auto-Calendar Invite Link */}
              <div className="space-y-2 p-3.5 bg-stone-50 rounded-xl border border-neutral-200/70">
                <p className="text-xs font-medium text-slate-800">Auto-Calendar Invite Link</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Opening this link shows your meeting preview card on WhatsApp and syncs it to Forum Calendar.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/invite/${liveInviteMeeting.roomId}`}
                    className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-[11px] font-mono text-slate-700 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/invite/${liveInviteMeeting.roomId}`;
                      navigator.clipboard.writeText(url);
                      setInviteLinkCopied(true);
                      setTimeout(() => setInviteLinkCopied(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  >
                    {inviteLinkCopied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{inviteLinkCopied ? 'Copied' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>

              {/* Send Direct Invite by Email */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!inviteEmailInput.trim() || sendingInvite) return;
                  setSendingInvite(true);
                  const list = inviteEmailInput.split(/[\s,;]+/).filter(Boolean);
                  const sentCount = await sendMeetingInviteToEmails(
                    {
                      id: liveInviteMeeting.id,
                      roomId: liveInviteMeeting.roomId,
                      title: liveInviteMeeting.title,
                      hostName: liveInviteMeeting.hostName
                    },
                    list
                  );
                  setSendingInvite(false);
                  if (sentCount > 0) {
                    setInviteEmailInput('');
                    setDashboardToast({ message: `Calendar invite sent to ${sentCount} attendee(s)`, type: 'success' });
                    setTimeout(() => setDashboardToast(null), 3000);
                  }
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 block">Send directly by email</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="colleague@company.com"
                      value={inviteEmailInput}
                      onChange={(e) => setInviteEmailInput(e.target.value)}
                      className="flex-1 min-w-0 px-3.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50"
                    />
                    <button
                      type="submit"
                      disabled={!inviteEmailInput.trim() || sendingInvite}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {sendingInvite ? 'Sending...' : 'Send Invite'}
                    </button>
                  </div>
                </div>

                {contacts.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-medium text-slate-500 block">Quick add from contacts</span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scroll">
                      {contacts.slice(0, 8).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            if (!c.email) return;
                            setInviteEmailInput(prev => prev ? `${prev}, ${c.email}` : c.email);
                          }}
                          className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-lg text-[11px] font-medium transition-colors cursor-pointer truncate max-w-[160px]"
                        >
                          + {c.displayName || c.email}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between border-t border-neutral-100">
                  <a
                    href={`mailto:?subject=${encodeURIComponent(`Forum Invite: ${liveInviteMeeting.title}`)}&body=${encodeURIComponent(`You're invited to ${liveInviteMeeting.title} on Forum.\n\nAdd to Forum Calendar & Join:\n${window.location.origin}/invite/${liveInviteMeeting.roomId}`)}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    <Mail size={14} />
                    <span>Open Email App</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setInviteModalMeeting(null)}
                    className="px-4 py-2 bg-stone-100 hover:bg-stone-200/70 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Done
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ icon, label, active = false, onClick, collapsed = false }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, collapsed?: boolean }) {
  const resizedIcon = React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<any>, { size: collapsed ? 24 : 20 })
    : icon;

  return (
    <button 
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "w-full flex items-center transition-all rounded-xl",
        collapsed ? "justify-center p-3.5 hover:scale-105" : "px-4 py-3 gap-3",
        active ? "bg-accent-blue/10 text-accent-blue font-bold" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 font-medium"
      )}
    >
      <div className="flex items-center justify-center transition-transform duration-200">
        {resizedIcon}
      </div>
      {!collapsed && <span className="truncate text-sm">{label}</span>}
    </button>
  );
}

function QuickActionCard({ 
  icon, 
  label, 
  sub, 
  color, 
  badge,
  onClick 
}: { 
  icon: React.ReactNode, 
  label: string, 
  sub: string, 
  color: string, 
  badge?: string,
  onClick?: () => void 
}) {
  return (
    <button 
      onClick={onClick}
      className="w-full bg-white p-5 sm:p-6 rounded-[28px] sm:rounded-[32px] border border-gray-100/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all text-left group active:scale-[0.98] flex flex-col justify-between min-h-[160px] sm:min-h-[175px] relative overflow-hidden"
    >
      <div className="flex items-start justify-between w-full mb-4">
        <div className={cn("w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform", color)}>
          {icon}
        </div>
        {badge && (
          <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
            {badge}
          </span>
        )}
      </div>
      <div>
        <h4 className="text-base sm:text-lg font-black text-gray-900 group-hover:text-accent-blue transition-colors leading-tight">{label}</h4>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">{sub}</p>
      </div>
    </button>
  );
}

function MeetingCard({ meeting, onJoin, onInvite, onEdit, onDelete }: { meeting: Meeting, onJoin: () => void, onInvite: () => void, onEdit: () => void, onDelete: () => void, key?: string }) {
  const isNow = Math.abs(meeting.startTime.getTime() - Date.now()) < 15 * 60 * 1000;
  const isMeetingToday = isToday(meeting.startTime);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const meetingUrl = `${window.location.origin}/meeting/${meeting.roomId}`;
  const confirmedCount = new Set([
    ...(Array.isArray(meeting.acceptedUids) ? meeting.acceptedUids : []),
    ...(Array.isArray(meeting.participants) ? meeting.participants : []),
  ]).size;
  const confirmedTooltip = Array.isArray(meeting.acceptedNames) && meeting.acceptedNames.length > 0
    ? `Confirmed: ${meeting.acceptedNames.join(', ')}`
    : undefined;

  const handleExportICS = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadICSFile({
      title: meeting.title,
      description: meeting.description,
      location: meetingUrl,
      startTime: meeting.startTime,
      endTime: meeting.endTime || new Date(meeting.startTime.getTime() + 60 * 60 * 1000),
      roomId: meeting.roomId,
      organizerName: meeting.hostName
    }, `${meeting.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.ics`);
  };

  const handleGoogleCalendar = (e: React.MouseEvent) => {
    e.stopPropagation();
    const gUrl = getGoogleCalendarUrl({
      title: meeting.title,
      description: meeting.description,
      location: meetingUrl,
      startTime: meeting.startTime,
      endTime: meeting.endTime || new Date(meeting.startTime.getTime() + 60 * 60 * 1000),
      roomId: meeting.roomId
    });
    window.open(gUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div id={`meeting-${meeting.id}`} className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs hover:shadow-md transition-all group overflow-hidden flex flex-col sm:flex-row min-h-0">
      {/* Cover Image Banner */}
      {meeting.coverImage ? (
        <div className="w-full sm:w-44 md:w-52 h-32 sm:h-auto shrink-0 relative overflow-hidden bg-stone-100">
          <img 
            src={meeting.coverImage} 
            alt={meeting.title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent sm:hidden" />
          <span className="absolute bottom-2.5 left-3 text-[11px] font-semibold text-white drop-shadow sm:hidden">
            {format(meeting.startTime, 'MMM dd')}
          </span>
        </div>
      ) : (
        <div className="w-full sm:w-20 shrink-0 bg-stone-100 flex sm:flex-col items-center justify-center p-3 border-b sm:border-b-0 sm:border-r border-neutral-200/70">
          <span className="text-[10px] font-bold text-slate-500 uppercase">{format(meeting.startTime, 'MMM')}</span>
          <span className="text-xl font-light text-slate-900">{format(meeting.startTime, 'dd')}</span>
        </div>
      )}

      {/* Meeting Details Content */}
      <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-0">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-slate-900 text-sm sm:text-base truncate">{meeting.title}</h4>
            {isMeetingToday && (
              <span className="text-[11px] font-semibold text-emerald-700">
                · Today
              </span>
            )}
            {confirmedCount > 0 && (
              <span title={confirmedTooltip} className="text-[11px] font-medium text-slate-500 flex items-center gap-1 tabular-nums">
                · <Users size={11} className="text-slate-400" /> {confirmedCount} {confirmedCount === 1 ? 'attending' : 'attending'}
              </span>
            )}
            {meeting.isKomu && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">· KOMU</span>
            )}
          </div>

          <p className="text-xs text-slate-600 flex items-center gap-2">
            <Clock size={13} className="shrink-0 text-slate-400" />
            <span className="font-medium text-slate-800">{format(meeting.startTime, 'EEEE, MMM d, yyyy • h:mm a')}</span>
            <span className="text-slate-400 hidden sm:inline">• Host: {meeting.hostName}</span>
          </p>

          {meeting.description && (
            <p className="text-xs text-slate-500 line-clamp-1 leading-relaxed">
              {meeting.description}
            </p>
          )}
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportICS}
              className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-slate-700 text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Download standardized .ics calendar file"
            >
              <Download size={13} />
              <span>Export (.ics)</span>
            </button>
            <button
              type="button"
              onClick={handleGoogleCalendar}
              className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-slate-700 text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Add to Google Calendar"
            >
              <CalendarIcon size={13} />
              <span>Google Cal</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInvite();
              }}
              className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-slate-700 text-xs font-medium rounded-xl transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
              title="Send calendar invite link or email"
            >
              <Share2 size={13} />
              <span>Invite</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={onJoin}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-medium transition-colors shadow-xs cursor-pointer whitespace-nowrap",
                isNow 
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                  : "bg-slate-800 hover:bg-slate-700 text-white"
              )}
            >
              {isNow ? 'Join Call Now' : 'Join'}
            </button>

            <div className="relative">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              >
                <MoreVertical size={16} />
              </button>
              <AnimatePresence>
                {isMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute right-0 bottom-full mb-2 w-40 bg-white rounded-xl shadow-xl border border-neutral-200/80 py-1.5 z-50 overflow-hidden"
                    >
                      {!meeting.isKomu && (
                        <button 
                          onClick={() => { onEdit(); setIsMenuOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-stone-50 transition-colors"
                        >
                          <Edit2 size={13} className="text-slate-400" />
                          Edit
                        </button>
                      )}
                      <button 
                        onClick={() => { onDelete(); setIsMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 size={13} className="text-rose-400" />
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
        <div className="p-2 bg-gray-100 rounded-lg text-gray-400 group-hover:bg-gray-200 group-hover:text-gray-600 transition-all">
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

function CalendarMonthView({ selectedDate, meetings, onEditMeeting, onAddMeeting }: { selectedDate: Date, meetings: Meeting[], onEditMeeting: (m: Meeting) => void, onAddMeeting: (d: Date) => void }) {
  const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const totalCells = 42;

  const daysHeader = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
        {daysHeader.map(day => (
          <div key={day} className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{day}</div>
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
            <div 
              key={i} 
              onClick={() => onAddMeeting(d)}
              className={cn(
                "border-r border-b border-gray-100 min-h-[145px] p-3 hover:bg-blue-50/10 transition-all group relative cursor-pointer flex flex-col justify-between",
                isDiffMonth && "bg-gray-50/20 text-gray-300"
              )}
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-2.5">
                  <span className={cn(
                    "text-xs font-semibold w-7 h-7 flex items-center justify-center rounded-xl transition-all",
                    isTodayCell ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/30 scale-110" : 
                    isDiffMonth ? "text-gray-200 font-normal" : "text-gray-700 group-hover:text-accent-blue"
                  )}>{d.getDate()}</span>
                  {dayMeetings.length > 0 && !isDiffMonth && (
                    <span className="w-1.5 h-1.5 bg-accent-blue rounded-full" />
                  )}
                </div>
                <div className="space-y-1.5 font-sans">
                  {dayMeetings.slice(0, 3).map(m => (
                    <div 
                      key={m.id} 
                      onClick={(e) => { e.stopPropagation(); onEditMeeting(m); }}
                      className={cn(
                        "text-[10px] p-1.5 text-white rounded-lg shadow-sm truncate font-medium cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5",
                        getEventColorClass(m)
                      )}
                    >
                      {m.type === 'task' && <Check size={10} />}
                      <span className="truncate font-medium">{m.title}</span>
                    </div>
                  ))}
                  {dayMeetings.length > 3 && (
                    <div className="mt-1">
                      <span className="text-[9px] text-gray-400 font-bold inline-block">
                        +{dayMeetings.length - 3} more
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="p-1 bg-accent-blue/10 text-accent-blue rounded-lg">
                  <Plus size={12} />
                </div>
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
                          <p className="text-[10px] font-semibold truncate tracking-tight uppercase flex items-center gap-1.5">
                            {m.type === 'task' && <Check size={10} />}
                            {m.type === 'focus' && <Clock size={10} />}
                            {m.title}
                          </p>
                          {m.isMeeting && <Video size={10} className="shrink-0" />}
                        </div>
                        <p className="text-[8px] opacity-90 font-semibold whitespace-nowrap">
                          {format(m.startTime, 'h:mm a')} - {m.endTime ? format(m.endTime, 'h:mm a') : '...'}
                        </p>
                        {height > 5 && m.description && (
                          <p className="text-[8px] opacity-85 line-clamp-2 mt-1 italic leading-tight">{m.description}</p>
                        )}
                        {m.isKomu && (
                          <div className="mt-auto text-[6px] font-bold uppercase tracking-wider self-end bg-black/15 px-1.5 py-0.5 rounded backdrop-blur-sm">KOMU</div>
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
