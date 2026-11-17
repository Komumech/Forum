import type { StageDocumentState } from '../utils/documentShare';

export type StageOverlayTheme = 'dark' | 'light' | 'emerald' | 'stone';
export type StageOverlayPosition = 'center' | 'bottom-left' | 'bottom-center' | 'top-banner';
export type StageContentMode = 'template' | 'media' | 'document';

export interface StageOverlayState {
  active: boolean;
  mode?: StageContentMode;
  templateId: string;
  position: StageOverlayPosition;
  theme: StageOverlayTheme;
  title: string;
  subtitle: string;
  body: string;
  meta: string;
  mediaUrl: string;
  mediaStorageDocId?: string;
  mediaFit: 'contain' | 'cover';
  mediaSize: 'sm' | 'md' | 'lg';
  points: string[];
  document?: StageDocumentState | null;
  presenterName?: string;
  presenterIdentity?: string;
  broadcastToParticipants?: boolean;
  updatedAt?: number;
}

export interface StageTemplateDef {
  id: string;
  name: string;
  category: 'media' | 'stage' | 'overlay';
  position: StageOverlayPosition;
  theme: StageOverlayTheme;
  defaults: Partial<StageOverlayState>;
}

export const STAGE_TEMPLATES: StageTemplateDef[] = [
  {
    id: 'center-media',
    name: 'Full Image / Video Card',
    category: 'media',
    position: 'center',
    theme: 'dark',
    defaults: {
      mode: 'media',
      title: 'Featured Visual',
      subtitle: '',
      body: '',
      meta: '',
      mediaFit: 'contain',
      mediaSize: 'lg',
      points: [],
    },
  },
  {
    id: 'media-split',
    name: 'Image & Title Split',
    category: 'media',
    position: 'center',
    theme: 'light',
    defaults: {
      mode: 'media',
      title: 'Session Spotlight',
      subtitle: 'Visual overview and key context',
      body: 'Upload an image or paste a media link to present cleanly in its own stage card.',
      meta: '',
      mediaFit: 'cover',
      mediaSize: 'md',
      points: [],
    },
  },
  {
    id: 'welcome',
    name: 'Welcome Title Card',
    category: 'stage',
    position: 'center',
    theme: 'light',
    defaults: {
      mode: 'template',
      title: 'Welcome Everyone',
      subtitle: 'Thank you for joining today’s live session',
      body: 'Audio and stream feed are open. We will begin shortly.',
      meta: '',
      points: [],
    },
  },
  {
    id: 'starting-soon',
    name: 'Starting Soon',
    category: 'stage',
    position: 'center',
    theme: 'dark',
    defaults: {
      mode: 'template',
      title: 'Starting Soon',
      subtitle: 'Live broadcast begins in a few moments',
      body: 'Grab a seat and make sure your audio is ready.',
      meta: '',
      points: [],
    },
  },
  {
    id: 'brb',
    name: 'Be Right Back',
    category: 'stage',
    position: 'center',
    theme: 'stone',
    defaults: {
      mode: 'template',
      title: 'Be Right Back',
      subtitle: 'Short intermission',
      body: 'We are taking a brief pause and will return shortly.',
      meta: '',
      points: [],
    },
  },
  {
    id: 'closing',
    name: 'Closing & Thank You',
    category: 'stage',
    position: 'center',
    theme: 'light',
    defaults: {
      mode: 'template',
      title: 'Thank You for Watching',
      subtitle: 'End of live session',
      body: 'Follow up with shared notes or reach out after the call.',
      meta: 'komu-forum.vercel.app',
      points: [],
    },
  },
  {
    id: 'quote',
    name: 'Keynote Quote',
    category: 'stage',
    position: 'center',
    theme: 'stone',
    defaults: {
      mode: 'template',
      title: 'Clarity creates momentum when everyone shares the same focus.',
      subtitle: 'Keynote Reflection',
      body: '',
      meta: 'Speaker Name',
      points: [],
    },
  },
  {
    id: 'lyric',
    name: 'Verse & Lyric Card',
    category: 'stage',
    position: 'center',
    theme: 'dark',
    defaults: {
      mode: 'template',
      title: 'Verse / Chorus',
      subtitle: 'Song or Reading Title',
      body: 'First line of verse or reading\nSecond line flows seamlessly here\nThird line for audience reflection',
      meta: '',
      points: [],
    },
  },
  {
    id: 'agenda',
    name: 'Agenda Points',
    category: 'stage',
    position: 'center',
    theme: 'light',
    defaults: {
      mode: 'template',
      title: 'Today’s Agenda',
      subtitle: 'Session outline',
      body: '',
      meta: '',
      points: [
        'Opening remarks & introductions',
        'Main presentation & live discussion',
        'Audience Q&A and next steps',
      ],
    },
  },
  {
    id: 'qa-prompt',
    name: 'Live Q&A Prompt',
    category: 'stage',
    position: 'center',
    theme: 'emerald',
    defaults: {
      mode: 'template',
      title: 'Open Discussion Question',
      subtitle: 'Share your thoughts in chat or raise your hand',
      body: 'What is the most important takeaway you want to explore next?',
      meta: '',
      points: [],
    },
  },
  {
    id: 'contact-card',
    name: 'Contact & Link Card',
    category: 'stage',
    position: 'center',
    theme: 'light',
    defaults: {
      mode: 'template',
      title: 'Stay Connected',
      subtitle: 'Direct links and follow-up',
      body: 'hello@example.com · komu-forum.vercel.app',
      meta: 'Forum Live',
      points: [],
    },
  },
  {
    id: 'lower-third',
    name: 'Speaker Lower Third',
    category: 'overlay',
    position: 'bottom-left',
    theme: 'dark',
    defaults: {
      mode: 'template',
      title: 'Speaker Name',
      subtitle: 'Host · Topic Overview',
      body: '',
      meta: '',
      points: [],
    },
  },
  {
    id: 'guest-spotlight',
    name: 'Guest Spotlight Card',
    category: 'overlay',
    position: 'bottom-left',
    theme: 'light',
    defaults: {
      mode: 'template',
      title: 'Guest Speaker',
      subtitle: 'Featured Interview · Live',
      body: '',
      meta: '',
      mediaFit: 'cover',
      mediaSize: 'sm',
      points: [],
    },
  },
  {
    id: 'performance-title',
    name: 'Performance Piece Title',
    category: 'overlay',
    position: 'bottom-left',
    theme: 'dark',
    defaults: {
      mode: 'template',
      title: 'Acoustic Piece in G Major',
      subtitle: 'Performed Live by Ensemble',
      body: '',
      meta: 'Live Sound Profile',
      points: [],
    },
  },
  {
    id: 'announcement',
    name: 'Announcement Banner',
    category: 'overlay',
    position: 'top-banner',
    theme: 'dark',
    defaults: {
      mode: 'template',
      title: 'Live session recording is available immediately after the call.',
      subtitle: '',
      body: '',
      meta: '',
      points: [],
    },
  },
];

export const DEFAULT_STAGE_OVERLAY: StageOverlayState = {
  active: false,
  mode: 'template',
  templateId: 'welcome',
  position: 'center',
  theme: 'light',
  title: 'Welcome Everyone',
  subtitle: 'Thank you for joining today’s live session',
  body: 'Audio and stream feed are open. We will begin shortly.',
  meta: '',
  mediaUrl: '',
  mediaFit: 'contain',
  mediaSize: 'md',
  points: [],
  document: null,
  broadcastToParticipants: true,
};
