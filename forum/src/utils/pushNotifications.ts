export interface PushPrefs {
  enabled: boolean;
  meetingReminders: boolean;
  inviteAlerts: boolean;
}

const PREFS_KEY = 'forum_push_preferences_v1';

export function getPushPreferences(): PushPrefs {
  if (typeof window === 'undefined') {
    return { enabled: true, meetingReminders: true, inviteAlerts: true };
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled !== false,
        meetingReminders: parsed.meetingReminders !== false,
        inviteAlerts: parsed.inviteAlerts !== false,
      };
    }
  } catch {}
  return { enabled: true, meetingReminders: true, inviteAlerts: true };
}

export function savePushPreferences(prefs: PushPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

export function getNotificationSupportStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function registerForumServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    try {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch {}
    return reg;
  } catch (err) {
    console.warn('[PushNotifications] Service worker registration skipped:', err);
    return null;
  }
}

export async function requestForumNotificationPermission(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  await registerForumServiceWorker();
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export interface ForumNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function triggerForumPushNotification(payload: ForumNotificationPayload): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.dispatchEvent(new CustomEvent('forum:notification', { detail: payload }));
  } catch {}

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  const prefs = getPushPreferences();
  if (!prefs.enabled) {
    return false;
  }

  try {
    const reg =
      (await navigator.serviceWorker?.getRegistration?.('/')) ||
      (await registerForumServiceWorker());
    if (reg && reg.active && typeof reg.showNotification === 'function') {
      await reg.showNotification(payload.title, {
        body: payload.body,
        icon: '/forum-logo.png',
        badge: '/forum-logo.png',
        tag: payload.tag || `forum-${Date.now()}`,
        data: { url: payload.url || '/dashboard' },
      });
      return true;
    }
  } catch {
    // Fallback to standard browser Notification constructor
  }

  try {
    const notif = new Notification(payload.title, {
      body: payload.body,
      icon: '/forum-logo.png',
      tag: payload.tag || `forum-${Date.now()}`,
    });
    notif.onclick = () => {
      try {
        window.focus();
        if (payload.url && window.location.pathname !== payload.url) {
          window.location.href = payload.url;
        }
      } catch {}
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}
