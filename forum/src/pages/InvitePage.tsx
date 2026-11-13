import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, Video, Check, ArrowRight, Users, X } from 'lucide-react';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  collection,
  query,
  where,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export default function InvitePage() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { user, login, isLoggingIn } = useAuth();

  const [meeting, setMeeting] = useState<any>(null);
  const [meetingDocId, setMeetingDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarAdded, setCalendarAdded] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [addingCalendar, setAddingCalendar] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let unsub: (() => void) | undefined;
    let active = true;

    const bindMeetingListener = async () => {
      try {
        const directRef = doc(db, 'meetings', roomId);
        const directSnap = await getDoc(directRef);

        if (!active) return;

        if (directSnap.exists()) {
          setMeetingDocId(directSnap.id);
          setMeeting({ id: directSnap.id, ...directSnap.data() });
          setLoading(false);
          unsub = onSnapshot(directRef, (snap) => {
            if (snap.exists()) {
              setMeeting({ id: snap.id, ...snap.data() });
            }
          });
          return;
        }

        const qSnap = await getDocs(query(collection(db, 'meetings'), where('roomId', '==', roomId)));
        if (!active) return;

        if (!qSnap.empty) {
          const matchedDoc = qSnap.docs[0];
          setMeetingDocId(matchedDoc.id);
          setMeeting({ id: matchedDoc.id, ...matchedDoc.data() });
          setLoading(false);
          unsub = onSnapshot(doc(db, 'meetings', matchedDoc.id), (snap) => {
            if (snap.exists()) {
              setMeeting({ id: snap.id, ...snap.data() });
            }
          });
          return;
        }

        const roomSnap = await getDoc(doc(db, 'rooms', roomId));
        if (!active) return;
        if (roomSnap.exists()) {
          const rd = roomSnap.data();
          setMeetingDocId(roomId);
          setMeeting({
            id: roomId,
            roomId,
            title: rd.title || `Forum Meeting`,
            hostId: rd.hostId || '',
            hostName: rd.hostName || 'Forum Host',
            coverImage: '',
          });
        } else {
          setMeetingDocId(roomId);
          setMeeting({
            id: roomId,
            roomId,
            title: `Forum Meeting`,
            hostName: 'Forum Host',
            coverImage: '',
          });
        }
      } catch (err) {
        console.warn('[InvitePage] Could not load meeting details:', err);
        if (active) {
          setMeetingDocId(roomId);
          setMeeting({
            id: roomId,
            roomId,
            title: `Forum Meeting`,
            hostName: 'Forum Host',
            coverImage: '',
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void bindMeetingListener();
    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [roomId]);

  const acceptInviteAndSync = async (isExplicitAction = false) => {
    if (!roomId || !user) return;
    const targetDocId = meetingDocId || roomId;
    setAddingCalendar(true);
    setDeclined(false);
    setErrorMsg(null);

    try {
      const meetingRef = doc(db, 'meetings', targetDocId);
      const snap = await getDoc(meetingRef);
      const emailLower = user.email?.toLowerCase();
      const inviteeName = user.displayName || user.email?.split('@')[0] || 'Participant';

      if (snap.exists()) {
        const data = snap.data();
        const currentParticipants: string[] = Array.isArray(data.participants) ? data.participants : [];
        const currentAccepted: string[] = Array.isArray(data.acceptedUids) ? data.acceptedUids : [];
        const wasAcceptedBefore = currentAccepted.includes(user.uid);
        const isHostUser = data.hostId === user.uid;

        await updateDoc(meetingRef, {
          participants: arrayUnion(user.uid),
          acceptedUids: arrayUnion(user.uid),
          acceptedNames: arrayUnion(inviteeName),
          ...(emailLower ? { invitedEmails: arrayUnion(emailLower) } : {}),
        });

        const updatedAcceptedCount = wasAcceptedBefore
          ? Math.max(currentAccepted.length, currentParticipants.length)
          : new Set([...currentAccepted, user.uid]).size;

        // Notify the creator with updated participant count
        if (!wasAcceptedBefore && !isHostUser && data.hostId) {
          await addDoc(collection(db, 'notifications'), {
            userId: data.hostId,
            type: 'meeting',
            title: `Invite Accepted: ${data.title || roomId}`,
            message: `${inviteeName} accepted your invite · ${updatedAcceptedCount} ${updatedAcceptedCount === 1 ? 'participant' : 'participants'} confirmed`,
            roomId,
            read: false,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }

        // Notify invitee on first sync
        if (!currentParticipants.includes(user.uid) && !isHostUser) {
          await addDoc(collection(db, 'notifications'), {
            userId: user.uid,
            type: 'meeting',
            title: `Added to Calendar: ${data.title || roomId}`,
            message: `${data.hostName || 'Host'} invited you. Added to your Forum Calendar.`,
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
            acceptedUids: [user.uid],
            acceptedNames: [inviteeName],
            ...(emailLower ? { invitedEmails: [emailLower] } : {}),
            startTime: serverTimestamp(),
            isMeeting: true,
            coverImage: meeting?.coverImage || '',
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

      setCalendarAdded(true);
      if (isExplicitAction) {
        setErrorMsg(null);
      }
    } catch (err: any) {
      console.warn('[InvitePage] Auto-calendar sync failed:', err);
      setErrorMsg('Could not sync automatically to your calendar right now.');
    } finally {
      setAddingCalendar(false);
    }
  };

  const handleDeclineInvite = async () => {
    if (!roomId || !user) return;
    const targetDocId = meetingDocId || roomId;
    const inviteeName = user.displayName || user.email?.split('@')[0] || 'Participant';
    try {
      await updateDoc(doc(db, 'meetings', targetDocId), {
        acceptedUids: arrayRemove(user.uid),
        acceptedNames: arrayRemove(inviteeName),
      });
      setCalendarAdded(false);
      setDeclined(true);
    } catch {}
  };

  useEffect(() => {
    if (!roomId || loading) return;
    if (!user) {
      try {
        localStorage.setItem('pending_forum_invite', roomId);
      } catch {}
      return;
    }
    if (declined || calendarAdded) return;
    void acceptInviteAndSync(false);
  }, [user, roomId, loading, meetingDocId]);

  const startDate = meeting?.startTime?.toDate
    ? meeting.startTime.toDate()
    : meeting?.startTime instanceof Date
      ? meeting.startTime
      : null;

  const hasCover = Boolean(meeting?.coverImage && String(meeting.coverImage).trim().length > 0);
  const confirmedCount = (() => {
    const uids = new Set<string>([
      ...(Array.isArray(meeting?.acceptedUids) ? meeting.acceptedUids : []),
      ...(Array.isArray(meeting?.participants) ? meeting.participants : []),
    ]);
    return uids.size;
  })();

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
        {/* Meeting Cover Banner + Bottom-Right Forum Icon */}
        <div className="relative h-52 sm:h-60 bg-slate-900 overflow-hidden">
          {hasCover && (
            <img
              src={meeting.coverImage}
              alt={meeting?.title || 'Meeting Cover'}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          <div className="absolute bottom-4 left-6 right-32 text-white">
            <p className="text-[11px] font-mono uppercase tracking-wider text-white/75">
              Room {roomId}
            </p>
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight mt-1 line-clamp-2">
              {meeting?.title || `Forum Meeting`}
            </h1>
          </div>

          {/* Forum Logo in Bottom-Right */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-xl border border-black/5 shadow-sm">
            <img src="/forum-logo.png" alt="Forum" className="w-5 h-5 object-contain" />
            <span className="text-xs font-semibold text-slate-900">Forum</span>
          </div>
        </div>

        {/* Invite Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="space-y-2.5 text-xs text-slate-600">
            {meeting?.hostName && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Users size={15} className="text-slate-400 shrink-0" />
                  <span>
                    Hosted by <span className="font-medium text-slate-900">{meeting.hostName}</span>
                  </span>
                </div>
                {confirmedCount > 0 && (
                  <span className="text-xs font-medium text-emerald-700 tabular-nums">
                    {confirmedCount} {confirmedCount === 1 ? 'participant' : 'participants'}
                  </span>
                )}
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
              <p className="text-xs text-slate-600 leading-relaxed pt-2 border-t border-neutral-100">
                {meeting.description}
              </p>
            )}
          </div>

          {/* Calendar Sync & Acceptance Status */}
          {user ? (
            declined ? (
              <div className="p-4 rounded-2xl bg-stone-50 border border-neutral-200/80 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-900">Invite declined</p>
                  <p className="text-[11px] text-slate-500">Changed your mind? You can still accept and add to calendar.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void acceptInviteAndSync(true)}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium cursor-pointer whitespace-nowrap"
                >
                  Accept Invite
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
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
                        ? 'Confirming invite & syncing calendar...'
                        : calendarAdded
                          ? 'Accepted & Added to Forum Calendar'
                          : 'Invite ready'}
                    </p>
                    <p className="text-[11px] text-emerald-800/80 truncate">
                      Signed in as {user.displayName || user.email}
                    </p>
                  </div>
                </div>
                {calendarAdded && meeting?.hostId !== user.uid && (
                  <button
                    type="button"
                    onClick={handleDeclineInvite}
                    title="Decline invite"
                    className="p-1.5 text-emerald-700/70 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="p-4 rounded-2xl bg-stone-50 border border-neutral-200/80 space-y-3">
              <div className="flex items-start gap-2.5">
                <Calendar size={16} className="text-slate-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-slate-900">
                    Sign in to accept & add to your Forum Calendar
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Your response notifies the host and adds this meeting to your schedule.
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
                <span>{isLoggingIn ? 'Signing in...' : 'Sign in with Google & Accept Invite'}</span>
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
