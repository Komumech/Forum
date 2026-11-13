import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, Video, Check, ArrowRight, Users } from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_MEETING_COVER } from '../assets/covers';

export default function InvitePage() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { user, login, isLoggingIn } = useAuth();

  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [calendarAdded, setCalendarAdded] = useState(false);
  const [addingCalendar, setAddingCalendar] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let active = true;

    const loadMeeting = async () => {
      try {
        const snap = await getDoc(doc(db, 'meetings', roomId));
        if (active && snap.exists()) {
          setMeeting({ id: snap.id, ...snap.data() });
        } else if (active) {
          const roomSnap = await getDoc(doc(db, 'rooms', roomId));
          if (roomSnap.exists()) {
            const rd = roomSnap.data();
            setMeeting({
              id: roomId,
              roomId,
              title: rd.title || `Forum Meeting (${roomId})`,
              hostName: rd.hostName || 'Forum Host',
              coverImage: DEFAULT_MEETING_COVER,
            });
          } else {
            setMeeting({
              id: roomId,
              roomId,
              title: `Forum Meeting (${roomId})`,
              hostName: 'Forum Host',
              coverImage: DEFAULT_MEETING_COVER,
            });
          }
        }
      } catch (err) {
        console.warn('[InvitePage] Could not load meeting details:', err);
        if (active) {
          setMeeting({
            id: roomId,
            roomId,
            title: `Forum Meeting (${roomId})`,
            hostName: 'Forum Host',
            coverImage: DEFAULT_MEETING_COVER,
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadMeeting();
    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    if (!user) {
      try {
        localStorage.setItem('pending_forum_invite', roomId);
      } catch {}
      return;
    }

    let cancelled = false;
    const syncToCalendar = async () => {
      setAddingCalendar(true);
      try {
        const meetingRef = doc(db, 'meetings', roomId);
        const snap = await getDoc(meetingRef);
        const emailLower = user.email?.toLowerCase();

        if (snap.exists()) {
          const data = snap.data();
          const alreadyIn = Array.isArray(data.participants) && data.participants.includes(user.uid);
          if (!alreadyIn) {
            await updateDoc(meetingRef, {
              participants: arrayUnion(user.uid),
              ...(emailLower ? { invitedEmails: arrayUnion(emailLower) } : {}),
            });
            await addDoc(collection(db, 'notifications'), {
              userId: user.uid,
              type: 'meeting',
              title: `Added to Calendar: ${data.title || roomId}`,
              message: `${data.hostName || 'Host'} invited you. Added automatically to your Forum Calendar.`,
              roomId,
              read: false,
              createdAt: serverTimestamp(),
            }).catch(() => {});
          }
        } else {
          await setDoc(
            meetingRef,
            {
              title: meeting?.title || `Forum Meeting ${roomId}`,
              roomId,
              hostId: user.uid,
              hostName: meeting?.hostName || 'Forum Host',
              participants: [user.uid],
              ...(emailLower ? { invitedEmails: [emailLower] } : {}),
              startTime: serverTimestamp(),
              isMeeting: true,
              coverImage: meeting?.coverImage || DEFAULT_MEETING_COVER,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        try {
          if (localStorage.getItem('pending_forum_invite') === roomId) {
            localStorage.removeItem('pending_forum_invite');
          }
        } catch {}

        if (!cancelled) setCalendarAdded(true);
      } catch (err: any) {
        console.warn('[InvitePage] Auto-calendar sync failed:', err);
        if (!cancelled) setErrorMsg('Could not sync automatically to your calendar right now.');
      } finally {
        if (!cancelled) setAddingCalendar(false);
      }
    };

    syncToCalendar();
    return () => {
      cancelled = true;
    };
  }, [user, roomId]);

  const startDate = meeting?.startTime?.toDate
    ? meeting.startTime.toDate()
    : meeting?.startTime instanceof Date
      ? meeting.startTime
      : null;

  const coverUrl = meeting?.coverImage || DEFAULT_MEETING_COVER;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBFBFA] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBFBFA] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {/* Meeting Cover Image Banner */}
        <div className="relative h-52 sm:h-60 bg-slate-900 overflow-hidden">
          <img
            src={coverUrl}
            alt={meeting?.title || 'Meeting Cover'}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-xl border border-white/20">
            <img src="/forum-logo.png" alt="Forum" className="w-4 h-4 object-contain" />
            <span className="text-xs font-semibold text-slate-900">Forum Invite</span>
          </div>
          <div className="absolute bottom-5 left-6 right-6 text-white">
            <p className="text-[11px] font-mono uppercase tracking-wider text-white/75">
              Room {roomId}
            </p>
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight mt-1 line-clamp-2">
              {meeting?.title || `Forum Meeting`}
            </h1>
          </div>
        </div>

        {/* Invite Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="space-y-2.5 text-xs text-slate-600">
            {meeting?.hostName && (
              <div className="flex items-center gap-2.5">
                <Users size={15} className="text-slate-400 shrink-0" />
                <span>
                  Hosted by <span className="font-medium text-slate-900">{meeting.hostName}</span>
                </span>
              </div>
            )}
            {startDate && (
              <div className="flex items-center gap-2.5">
                <Clock size={15} className="text-slate-400 shrink-0" />
                <span className="font-medium text-slate-900">
                  {format(startDate, 'EEEE, MMM d, yyyy · h:mm a')}
                </span>
              </div>
            )}
            {meeting?.description && (
              <p className="text-xs text-slate-600 leading-relaxed pt-1 border-t border-neutral-100">
                {meeting.description}
              </p>
            )}
          </div>

          {/* Calendar Sync Status */}
          {user ? (
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                {addingCalendar ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check size={16} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-emerald-950">
                  {addingCalendar
                    ? 'Syncing to your Forum Calendar...'
                    : calendarAdded
                      ? 'Added to your Forum Calendar'
                      : 'Invite ready'}
                </p>
                <p className="text-[11px] text-emerald-800/80 truncate">
                  Signed in as {user.displayName || user.email}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-stone-50 border border-neutral-200/80 space-y-3">
              <div className="flex items-start gap-2.5">
                <Calendar size={16} className="text-slate-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-slate-900">
                    Sign in to add automatically to your Forum Calendar
                  </p>
                  <p className="text-[11px] text-slate-500">
                    We saved this invitation so it appears on your schedule right after you sign in.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={login}
                disabled={isLoggingIn}
                className="w-full py-2.5 px-4 bg-white hover:bg-stone-100 text-slate-900 border border-neutral-300 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  className="w-3.5 h-3.5"
                  alt="Google"
                />
                <span>{isLoggingIn ? 'Signing in...' : 'Sign in with Google & Add to Calendar'}</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <p className="text-xs text-rose-600">{errorMsg}</p>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            {user && (
              <button
                type="button"
                onClick={() => {
                  const dateQuery = startDate ? `&date=${format(startDate, 'yyyy-MM-dd')}` : '';
                  navigate(`/dashboard?tab=calendar${dateQuery}`);
                }}
                className="flex-1 py-3 px-4 bg-stone-100 hover:bg-stone-200 text-slate-800 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Calendar size={15} />
                <span>View in Forum Calendar</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(`/meeting/${roomId}?invite=1`)}
              className="flex-1 py-3 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shadow-xs"
            >
              <Video size={15} />
              <span>Join Meeting Now</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
