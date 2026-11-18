export type SeoCategory = 'use-cases' | 'compare' | 'integrations';

export interface SeoComparisonRow {
  criterion: string;
  komuValue: string;
  alternativeValue: string;
}

export interface SeoFaqItem {
  q: string;
  a: string;
}

export interface SeoPageEntry {
  category: SeoCategory;
  slug: string;
  categoryLabel: string;
  headline: string;
  seoTitle: string;
  metaDescription: string;
  summary: string;
  audience: string;
  keywords: string[];
  keyHighlights: { title: string; detail: string }[];
  workflowSteps?: { step: string; title: string; detail: string }[];
  comparisonHeader?: { left: string; right: string };
  comparisonRows: SeoComparisonRow[];
  faqs: SeoFaqItem[];
  relatedSlugs: { category: SeoCategory; slug: string; label: string }[];
}

export const SEO_PAGES: SeoPageEntry[] = [
  // ==========================================
  // USE CASES (/use-cases/:slug)
  // ==========================================
  {
    category: 'use-cases',
    slug: 'remote-team-standups',
    categoryLabel: 'Use Case',
    headline: 'Remote Team Standups Without Meeting Fatigue',
    seoTitle: 'Remote Team Standups & Syncs | Komu Forum',
    metaDescription:
      'Run focused remote team standups in your browser with automatic speaker transcripts, action summaries, and zero client downloads.',
    summary:
      'Keep daily standups crisp and documented. Everyone joins in seconds from a link while Komu captures a single clean transcript and structured task notes.',
    audience: 'Distributed engineering, product, and operations teams',
    keywords: [
      'remote team standup video call',
      'daily standup software with transcript',
      'browser video conferencing for teams',
      'komu forum meetings',
    ],
    keyHighlights: [
      {
        title: 'Single-File Speaker Transcript',
        detail:
          'Spoken updates are grouped cleanly by speaker into one living document so nobody scrambles to take manual notes.',
      },
      {
        title: 'One-Click Meeting Summary',
        detail:
          'Generate clear action items and blockers right when the standup finishes, ready to download or revisit on your dashboard.',
      },
      {
        title: 'Personal Meeting ID (PMI)',
        detail:
          'Bookmark one permanent room link for recurring morning syncs without regenerating calendar URLs every week.',
      },
    ],
    workflowSteps: [
      {
        step: '01',
        title: 'Open Your Fixed Standup Link',
        detail:
          'Launch your Personal Meeting Room directly from the dashboard or Google Calendar invite with no desktop installer.',
      },
      {
        step: '02',
        title: 'Share Screen & Task Context',
        detail:
          'Pin blockers on the shared whiteboard or switch to Speaker Column layout while keeping team members visible.',
      },
      {
        step: '03',
        title: 'Export Styled Recap',
        detail:
          'When the call ends, automatically save the speaker-grouped transcript as print-ready HTML or review the generated recap.',
      },
    ],
    comparisonHeader: { left: 'Komu Forum Standup', right: 'Traditional Video App' },
    comparisonRows: [
      {
        criterion: 'Participant Join Flow',
        komuValue: 'Direct browser link, no install',
        alternativeValue: 'Desktop updater or sign-in prompt',
      },
      {
        criterion: 'Transcript Storage',
        komuValue: 'One unified file per room, zero duplicates',
        alternativeValue: 'Paid add-on tier or scattered chat logs',
      },
      {
        criterion: 'Workspace Switching',
        komuValue: 'Video, notes & whiteboard in one tab',
        alternativeValue: 'Separate browser tabs required',
      },
      {
        criterion: 'Recurring Room Link',
        komuValue: 'Built-in Personal Meeting ID',
        alternativeValue: 'Requires recurring license plan',
      },
    ],
    faqs: [
      {
        q: 'How are speaker updates formatted in standup transcripts?',
        a: 'Consecutive remarks from the same speaker are merged into clean, readable blocks with timestamps rather than cluttering the log with fragmented single lines.',
      },
      {
        q: 'Do teammates need an account to join a standup?',
        a: 'No. Guests can enter their display name and join straight from any desktop or mobile browser.',
      },
      {
        q: 'Can we generate action items after the standup ends?',
        a: 'Yes. Both the in-call Summary tab and the post-meeting screen turn your transcript into concrete action items on demand.',
      },
    ],
    relatedSlugs: [
      { category: 'use-cases', slug: 'design-reviews-and-critiques', label: 'Design Reviews & Critiques' },
      { category: 'use-cases', slug: 'client-consultations', label: 'Client Consultations' },
      { category: 'integrations', slug: 'google-calendar-scheduling', label: 'Google Calendar Sync' },
    ],
  },
  {
    category: 'use-cases',
    slug: 'music-and-vocal-lessons',
    categoryLabel: 'Use Case',
    headline: 'Full-Bandwidth Audio for Music & Vocal Lessons',
    seoTitle: 'Online Music & Vocal Lessons Audio | Komu Forum',
    metaDescription:
      'Teach piano, guitar, or vocals online with 48kHz stereo capture, bypassed noise gating, and warm studio EQ inside Komu Forum.',
    summary:
      'Standard conference apps clip sustained notes and acoustic instruments. Komu Live Performance mode disables aggressive speech gates so music sounds natural.',
    audience: 'Music educators, vocal coaches, accompanists, and ensemble directors',
    keywords: [
      'online music lessons video platform',
      'low latency music teaching audio',
      'disable echo cancellation web video call',
      '48khz live performance audio call',
    ],
    keyHighlights: [
      {
        title: 'Live Performance Audio Profile',
        detail:
          'Bypass automatic noise suppression and voice gating so piano sustain, guitar overtones, and vocal vibrato come through cleanly.',
      },
      {
        title: 'Vocal, Band & Pure Direct Modes',
        detail:
          'Fine-tune input trim, parallel squeeze, warmth EQ, and high-frequency air directly inside your microphone panel.',
      },
      {
        title: 'Clean Mobile Portrait Video',
        detail:
          'Students joining from phones get properly framed portrait camera tiles rather than cropped landscape boxes.',
      },
    ],
    workflowSteps: [
      {
        step: '01',
        title: 'Switch Sound Mode to Live Performance',
        detail:
          'Open the microphone menu or Audio Settings and pick Live Performance before warming up.',
      },
      {
        step: '02',
        title: 'Choose Instrument or Pure Direct Preset',
        detail:
          'Select Vocal & Acoustic for gentle polish or Pure Direct for completely unprocessed stereo capture.',
      },
      {
        step: '03',
        title: 'Record Session Notes Without Audio Beeps',
        detail:
          'Capture practice feedback quietly without mobile OS dictation chimes interrupting performances.',
      },
    ],
    comparisonHeader: { left: 'Komu Live Performance', right: 'Standard Speech-Only Call' },
    comparisonRows: [
      {
        criterion: 'Audio Bandwidth',
        komuValue: 'Full 48kHz stereo capture',
        alternativeValue: 'Voice-narrowed mono compression',
      },
      {
        criterion: 'Sustained Notes',
        komuValue: 'Speech gating disabled cleanly',
        alternativeValue: 'Cut off by noise suppression',
      },
      {
        criterion: 'Real-Time Studio Controls',
        komuValue: 'Trim, Warmth EQ & Air EQ sliders',
        alternativeValue: 'Fixed automatic gain control',
      },
      {
        criterion: 'Mobile Call Stability',
        komuValue: 'No OS speech chime interruptions',
        alternativeValue: 'System chimes mute audio focus',
      },
    ],
    faqs: [
      {
        q: 'Why do normal video calls cut out sustained piano or singing?',
        a: 'Default conference noise filters classify steady musical tones as background hum and suppress them. Switching Komu to Live Performance bypasses those speech gates.',
      },
      {
        q: 'Do students need headphones for Live Performance mode?',
        a: 'Headphones are recommended when disabling echo cancellation so your microphone does not pick up speakers.',
      },
      {
        q: 'Can I adjust audio tone without external hardware?',
        a: 'Yes. Built-in WebAudio sliders let you tune input trim, warmth EQ, and subtle room air directly in the browser.',
      },
    ],
    relatedSlugs: [
      { category: 'use-cases', slug: 'live-streaming-and-podcasts', label: 'Live Streaming & Podcasts' },
      { category: 'integrations', slug: 'obs-studio-clean-feeds', label: 'OBS Studio Clean Feeds' },
      { category: 'compare', slug: 'komu-vs-zoom', label: 'Komu vs Zoom' },
    ],
  },
  {
    category: 'use-cases',
    slug: 'design-reviews-and-critiques',
    categoryLabel: 'Use Case',
    headline: 'Interactive Design Reviews & Visual Critiques',
    seoTitle: 'Interactive Design Reviews & Whiteboard | Komu Forum',
    metaDescription:
      'Review mockups at full 1080p60 resolution, sketch fixes on an embedded vector whiteboard, and export visual decisions.',
    summary:
      'Stop screensharing tiny blurry slides across separate tabs. Share a crisp window, sketch directly on the embedded canvas, and keep critique notes attached.',
    audience: 'Product designers, creative directors, architects, and agency teams',
    keywords: [
      'design review video call whiteboard',
      '1080p60 browser screen share',
      'collaborative whiteboard video meeting',
      'visual critique meeting workspace',
    ],
    keyHighlights: [
      {
        title: '1080p60 High-Detail Screen Share',
        detail:
          'Type and fine UI hairlines stay sharp with detail-hinted simulcast video streams.',
      },
      {
        title: 'Joint Vector Whiteboard',
        detail:
          'Open the workspace beside active camera tiles to annotate wireframes, flows, and sticky notes together.',
      },
      {
        title: 'Floating Stage Overlay Cards',
        detail:
          'Present PDFs, reference slides, and stage media directly onto the main call stage with page navigation.',
      },
    ],
    workflowSteps: [
      {
        step: '01',
        title: 'Present Screens or Stage Documents',
        detail:
          'Share an application window or upload slides directly into the stage presentation card.',
      },
      {
        step: '02',
        title: 'Sketch Revisions Live',
        detail:
          'Open Joint Workspace so reviewers can circle layout tweaks or drop sticky notes in real time.',
      },
      {
        step: '03',
        title: 'Capture Critique Action Items',
        detail:
          'Generate an organized summary of approved changes and follow-up owners as the review wraps.',
      },
    ],
    comparisonHeader: { left: 'Komu Design Workspace', right: 'Generic Video + Separate Canvas' },
    comparisonRows: [
      {
        criterion: 'Whiteboard Location',
        komuValue: 'Side-by-side inside the same call tab',
        alternativeValue: 'Separate app link & window switching',
      },
      {
        criterion: 'Slide Presentation Control',
        komuValue: 'Built-in multi-page stage overlay cards',
        alternativeValue: 'Manual full-screen sharing only',
      },
      {
        criterion: 'Exportable Decisions',
        komuValue: 'Styled HTML transcript + summary',
        alternativeValue: 'Manual copy-paste from chat',
      },
    ],
    faqs: [
      {
        q: 'Can participants draw on the whiteboard at the same time?',
        a: 'Yes. All strokes, shapes, and sticky notes synchronize live across every connected participant.',
      },
      {
        q: 'Does opening the whiteboard hide participant video?',
        a: 'No. Desktop view keeps the focal stage feed and compact participant strip visible alongside the workspace.',
      },
    ],
    relatedSlugs: [
      { category: 'use-cases', slug: 'remote-team-standups', label: 'Remote Team Standups' },
      { category: 'compare', slug: 'komu-vs-google-meet', label: 'Komu vs Google Meet' },
      { category: 'integrations', slug: 'styled-transcript-exports', label: 'Styled Transcript Exports' },
    ],
  },
  {
    category: 'use-cases',
    slug: 'client-consultations',
    categoryLabel: 'Use Case',
    headline: 'Frictionless Client Consultations & Transcripts',
    seoTitle: 'Client Consultations & Auto-Transcripts | Komu Forum',
    metaDescription:
      'Host polished client calls with branded invite links, waiting room admission, and automatic print-ready transcript records.',
    summary:
      'Clients never appreciate downloading desktop installers before a 30-minute discovery call. Send a clean invite link, admit guests with one click, and leave with complete notes.',
    audience: 'Consultants, founders, legal advisors, recruiters, and account managers',
    keywords: [
      'no download client video call',
      'client consultation meeting transcript',
      'waiting room video call browser',
      'styled meeting transcript export',
    ],
    keyHighlights: [
      {
        title: 'Zero-Friction Guest Links',
        detail:
          'Clients click your `/invite` link, see the meeting title and time, type their name, and enter immediately.',
      },
      {
        title: 'Waiting Room & Host Key Control',
        detail:
          'Hold external guests in a calm lobby until you admit them one by one, or lock the room during private reviews.',
      },
      {
        title: 'Print-Ready HTML Transcripts',
        detail:
          'Download clean, styled client records formatted with speaker headers and timestamps instead of raw `.txt` dumps.',
      },
    ],
    workflowSteps: [
      {
        step: '01',
        title: 'Schedule & Share Custom Invite Card',
        detail:
          'Create a scheduled room in Dashboard with waiting room enabled and share the OpenGraph-ready invite URL.',
      },
      {
        step: '02',
        title: 'Run Call While Capturing Context',
        detail:
          'Focus completely on the client conversation while background transcription builds a clean record.',
      },
      {
        step: '03',
        title: 'Download or Summarize on Exit',
        detail:
          'Auto-download your formatted transcript on exit and generate a client follow-up summary in one click.',
      },
    ],
    comparisonHeader: { left: 'Komu Client Call', right: 'Desktop Client Tools' },
    comparisonRows: [
      {
        criterion: 'Client Onboarding Time',
        komuValue: 'Under 5 seconds in browser',
        alternativeValue: 'Installer download + account prompt',
      },
      {
        criterion: 'Transcript File Format',
        komuValue: 'Clean styled HTML document',
        alternativeValue: 'Unformatted plain text or paid tier',
      },
      {
        criterion: 'Host Access Control',
        komuValue: 'Waiting room + 6-digit Host Key',
        alternativeValue: 'PIN gates or enterprise tiers',
      },
    ],
    faqs: [
      {
        q: 'Can I turn off automatic transcript downloads if I only want cloud notes?',
        a: 'Yes. Toggle Automatic Transcript Download anytime inside Dashboard Settings or in-call Captions Settings.',
      },
      {
        q: 'Do clients see internal host tools or ratings?',
        a: 'No. Host controls stay isolated to recognized hosts, and participants can leave optional post-call feedback cleanly.',
      },
    ],
    relatedSlugs: [
      { category: 'integrations', slug: 'styled-transcript-exports', label: 'Styled Transcript Exports' },
      { category: 'integrations', slug: 'google-calendar-scheduling', label: 'Google Calendar Sync' },
      { category: 'compare', slug: 'komu-vs-zoom', label: 'Komu vs Zoom' },
    ],
  },
  {
    category: 'use-cases',
    slug: 'live-streaming-and-podcasts',
    categoryLabel: 'Use Case',
    headline: 'Studio Video Podcasts & Isolated Broadcast Feeds',
    seoTitle: 'Remote Video Podcasts & OBS Clean Feeds | Komu Forum',
    metaDescription:
      'Produce remote interviews and livestreams with clean per-guest browser source URLs for OBS Studio and instant RTMP output.',
    summary:
      'Every co-host gets a dedicated clean video URL with zero UI chrome, letting producers compose custom scenes in OBS or broadcast live without screen-cropping hacks.',
    audience: 'Podcasters, video producers, community hosts, and event moderators',
    keywords: [
      'remote podcast clean video feed',
      'obs browser source video call',
      'rtmp live stream meeting platform',
      'isolated participant feed webrtc',
    ],
    keyHighlights: [
      {
        title: 'Clean Isolated Browser Sources',
        detail:
          'Generate token-scoped `/isolated-feed` links per participant for distraction-free OBS scene compositing.',
      },
      {
        title: 'Local Composite Recording',
        detail:
          'Record calls locally with automatic download prompts if you leave before saving, preventing lost episodes.',
      },
      {
        title: 'Stage Media & Document Cards',
        detail:
          'Drop welcome slates, sponsor cards, or episode outlines onto the stage for live audiences.',
      },
    ],
    workflowSteps: [
      {
        step: '01',
        title: 'Copy Each Guest’s Isolated Feed Link',
        detail:
          'Right-click any tile or open Stream Settings to copy clean participant feed URLs for OBS.',
      },
      {
        step: '02',
        title: 'Enable Studio Audio & 1080p60 Video',
        detail:
          'Switch audio to Smooth Studio or Live Performance and lock camera resolution at 1080p.',
      },
      {
        step: '03',
        title: 'Broadcast or Export Show Notes',
        detail:
          'Stream live via RTMP and convert the session transcript into structured episode show notes immediately after sign-off.',
      },
    ],
    comparisonHeader: { left: 'Komu Broadcast Workflow', right: 'Screen-Cropped Calls' },
    comparisonRows: [
      {
        criterion: 'OBS Scene Integration',
        komuValue: 'Native token-scoped clean feed URLs',
        alternativeValue: 'Manual window cropping & overlays',
      },
      {
        criterion: 'Frame Rate & Bitrate',
        komuValue: 'Up to 1080p60 high-profile streams',
        alternativeValue: 'Throttled grid thumbnails',
      },
      {
        criterion: 'Show Notes Generation',
        komuValue: 'Single-click transcript & AI recap',
        alternativeValue: 'External transcription uploads',
      },
    ],
    faqs: [
      {
        q: 'Can I revoke an isolated OBS feed link after an episode ends?',
        a: 'Yes. Every feed export token can be reviewed and revoked from Stream & Export Settings.',
      },
      {
        q: 'What happens if a producer closes the tab while recording?',
        a: 'Komu intercepts exits during active recording and finalizes your file cleanly so footage is not corrupted.',
      },
    ],
    relatedSlugs: [
      { category: 'integrations', slug: 'obs-studio-clean-feeds', label: 'OBS Studio Clean Feeds' },
      { category: 'integrations', slug: 'rtmp-live-broadcasting', label: 'RTMP Live Broadcasting' },
      { category: 'use-cases', slug: 'music-and-vocal-lessons', label: 'Music & Vocal Audio' },
    ],
  },

  // ==========================================
  // COMPARISONS (/compare/:slug)
  // ==========================================
  {
    category: 'compare',
    slug: 'komu-vs-zoom',
    categoryLabel: 'Comparison',
    headline: 'Komu Forum vs Zoom: Fast Browser Calls Without Client Bloat',
    seoTitle: 'Komu Forum vs Zoom — Browser Video Meetings',
    metaDescription:
      'Compare Komu Forum and Zoom across instant browser joining, single-file auto transcripts, isolated OBS feeds, and calm minimalist UI.',
    summary:
      'Zoom relies on heavy desktop client updates and tiered add-ons for collaborative workflows. Komu Forum runs fast inside any modern browser with built-in whiteboarding and structured transcripts.',
    audience: 'Teams and hosts seeking a lighter, browser-native Zoom alternative',
    keywords: [
      'komu vs zoom',
      'lightweight zoom alternative browser',
      'video conferencing without download',
      'zoom alternative with whiteboard and transcript',
    ],
    keyHighlights: [
      {
        title: 'Zero Installer Prompts',
        detail:
          'Guests join straight from the URL on laptop or phone—no forced client updates minutes before a presentation.',
      },
      {
        title: 'Unified Notes & Whiteboard',
        detail:
          'Transcripts, AI post-meeting recaps, shared whiteboards, and file transfers stay inside one calm sidebar.',
      },
      {
        title: 'OBS Clean Feeds Included',
        detail:
          'Export per-participant clean browser feeds without configuring NDI desktop plugins.',
      },
    ],
    comparisonHeader: { left: 'Komu Forum', right: 'Zoom Desktop' },
    comparisonRows: [
      {
        criterion: 'Required Download',
        komuValue: 'None — 100% WebRTC in browser',
        alternativeValue: 'Prompts native app install/updates',
      },
      {
        criterion: 'Transcript Exports',
        komuValue: 'Styled HTML + unified background file',
        alternativeValue: 'Plain VTT/text or paid plan tiers',
      },
      {
        criterion: 'Studio Music Audio',
        komuValue: '48kHz Live Performance + custom EQ',
        alternativeValue: 'Buried original-sound checkbox',
      },
      {
        criterion: 'OBS Clean Participant Feeds',
        komuValue: 'Native `/isolated-feed` token URLs',
        alternativeValue: 'Requires separate desktop ISO setup',
      },
      {
        criterion: 'Interface Aesthetic',
        komuValue: 'Calm minimalist layout, zero clutter',
        alternativeValue: 'Dense nested toolbars & popups',
      },
    ],
    faqs: [
      {
        q: 'Can I still schedule recurring meetings with a fixed link like Zoom PMI?',
        a: 'Yes. Every signed-in user receives a Personal Meeting ID link in the Dashboard with waiting room and calendar controls.',
      },
      {
        q: 'Does Komu support breakout rooms and waiting rooms?',
        a: 'Yes. Hosts can admit/decline lobby guests, broadcast banners, lock rooms, and manage breakout rooms directly.',
      },
    ],
    relatedSlugs: [
      { category: 'compare', slug: 'komu-vs-google-meet', label: 'Komu vs Google Meet' },
      { category: 'compare', slug: 'komu-vs-microsoft-teams', label: 'Komu vs Microsoft Teams' },
      { category: 'use-cases', slug: 'client-consultations', label: 'Client Consultations' },
    ],
  },
  {
    category: 'compare',
    slug: 'komu-vs-google-meet',
    categoryLabel: 'Comparison',
    headline: 'Komu Forum vs Google Meet: Built for Real Collaboration',
    seoTitle: 'Komu Forum vs Google Meet — Workspace Comparison',
    metaDescription:
      'See how Komu Forum compares to Google Meet with built-in whiteboards, clean OBS feeds, styled transcript exports, and music audio modes.',
    summary:
      'Google Meet handles quick check-ins well, but drops built-in whiteboarding and advanced studio workflows. Komu integrates Google Calendar sync with native canvases and clean transcripts.',
    audience: 'Google Workspace users wanting native whiteboards, studio audio, and clean exports',
    keywords: [
      'komu vs google meet',
      'google meet alternative with whiteboard',
      'google calendar video meeting workspace',
      'browser meeting with transcript download',
    ],
    keyHighlights: [
      {
        title: 'Keeps Google Calendar Sync',
        detail:
          'Sign in with Google to view upcoming Calendar events and schedule rooms right alongside your meetings.',
      },
      {
        title: 'Built-In Vector Whiteboard',
        detail:
          'Sketch diagrams and stickies natively inside the meeting instead of linking out to third-party canvases.',
      },
      {
        title: 'Studio EQ & Isolated Feeds',
        detail:
          'Fine-tune audio profiles or copy clean OBS camera sources—capabilities standard Google Meet leaves out.',
      },
    ],
    comparisonHeader: { left: 'Komu Forum', right: 'Google Meet' },
    comparisonRows: [
      {
        criterion: 'Embedded Whiteboard',
        komuValue: 'Native multi-user vector canvas',
        alternativeValue: 'Removed / requires external link',
      },
      {
        criterion: 'Transcript Ownership',
        komuValue: 'Auto-synced note + styled HTML export',
        alternativeValue: 'Restricted to paid Workspace tiers',
      },
      {
        criterion: 'Live Audio Customization',
        komuValue: 'Standard, Smooth & Live Performance EQ',
        alternativeValue: 'Basic noise cancellation toggle only',
      },
      {
        criterion: 'Broadcast Clean Feeds',
        komuValue: 'Per-participant `/isolated-feed` links',
        alternativeValue: 'Not supported natively',
      },
    ],
    faqs: [
      {
        q: 'Can I connect my existing Google Calendar to Komu Forum?',
        a: 'Yes. Sign in with Google from the home page or Dashboard to pull calendar events and attach Forum room links.',
      },
      {
        q: 'Do external guests need a Google account to join?',
        a: 'No. External participants can join purely by display name without logging into Google.',
      },
    ],
    relatedSlugs: [
      { category: 'compare', slug: 'komu-vs-zoom', label: 'Komu vs Zoom' },
      { category: 'integrations', slug: 'google-calendar-scheduling', label: 'Google Calendar Sync' },
      { category: 'use-cases', slug: 'design-reviews-and-critiques', label: 'Design Reviews' },
    ],
  },
  {
    category: 'compare',
    slug: 'komu-vs-microsoft-teams',
    categoryLabel: 'Comparison',
    headline: 'Komu Forum vs Microsoft Teams: Zero-Clutter Focus',
    seoTitle: 'Komu Forum vs Microsoft Teams — Lightweight Meetings',
    metaDescription:
      'Skip bloated channels and slow account switching. Compare Komu Forum against Microsoft Teams for fast external meetings and notes.',
    summary:
      'Microsoft Teams often traps external guests in tenant-switching loops. Komu keeps meetings single-click, fast to load, and distraction-free.',
    audience: 'External teams, agencies, and educators tired of heavy enterprise suites',
    keywords: [
      'komu vs microsoft teams',
      'lightweight microsoft teams alternative',
      'simple external client video meeting',
      'minimalist video conferencing',
    ],
    keyHighlights: [
      {
        title: 'No Tenant Switching Errors',
        detail:
          'External partners enter via name or Google sign-in without cross-organization permission dead ends.',
      },
      {
        title: 'Clean Minimalist Interface',
        detail:
          'Flat Swiss typography and focused controls keep attention on participants and shared work.',
      },
      {
        title: 'Instant File Transfers',
        detail:
          'Send assets directly over encrypted room channels without configuring SharePoint permissions.',
      },
    ],
    comparisonHeader: { left: 'Komu Forum', right: 'Microsoft Teams' },
    comparisonRows: [
      {
        criterion: 'External Guest Join',
        komuValue: 'Instant name entry in any browser',
        alternativeValue: 'Frequent org/tenant login friction',
      },
      {
        criterion: 'Page Weight & Speed',
        komuValue: 'Lightweight SPA, rapid launch',
        alternativeValue: 'Heavy desktop/web shell startup',
      },
      {
        criterion: 'Meeting Notes & Transcripts',
        komuValue: 'Single searchable cloud workspace + HTML export',
        alternativeValue: 'Split across SharePoint & OneDrive tabs',
      },
      {
        criterion: 'Mobile Portrait Layout',
        komuValue: 'Portrait-ratio cards & auto-sidebar',
        alternativeValue: 'Cramped horizontal strip tiles',
      },
    ],
    faqs: [
      {
        q: 'Can participants share files directly during a Komu call?',
        a: 'Yes. Open the Chat & Files drawer to send files to everyone or a specific participant cleanly.',
      },
      {
        q: 'Is mobile usability optimized on phones?',
        a: 'Yes. Komu adapts grid aspect ratios to portrait screens and automatically switches large rooms into a clean focal + square thumbnail sidebar.',
      },
    ],
    relatedSlugs: [
      { category: 'compare', slug: 'komu-vs-zoom', label: 'Komu vs Zoom' },
      { category: 'use-cases', slug: 'client-consultations', label: 'Client Consultations' },
      { category: 'use-cases', slug: 'remote-team-standups', label: 'Remote Standups' },
    ],
  },
  {
    category: 'compare',
    slug: 'komu-vs-discord',
    categoryLabel: 'Comparison',
    headline: 'Komu Forum vs Discord: Built for Clients, Education & Studio Calls',
    seoTitle: 'Komu Forum vs Discord — Professional Browser Calls',
    metaDescription:
      'Compare Komu Forum and Discord for client readiness, 1080p60 screen sharing without paywalls, transcripts, and whiteboards.',
    summary:
      'Discord is great for gaming communities, yet awkward to send to clients or use for structured lessons. Komu pairs clean invite links with studio audio and full documentation.',
    audience: 'Creators, tutors, freelancers, and startups hosting external guests',
    keywords: [
      'komu vs discord',
      'professional alternative to discord calls',
      'free 1080p60 screen share browser',
      'meeting links without discord account',
    ],
    keyHighlights: [
      {
        title: 'No Server Invites or Account Walls',
        detail:
          'Send a single room URL—clients never have to register a gamer tag or join a server just for one conversation.',
      },
      {
        title: 'Automatic Transcripts & Recaps',
        detail:
          'Turn spoken sessions into readable notes automatically rather than scrolling past memes and channels.',
      },
      {
        title: 'Waiting Room & Host Controls',
        detail:
          'Control exactly when guests enter, lock rooms, or promote co-hosts.',
      },
    ],
    comparisonHeader: { left: 'Komu Forum', right: 'Discord Voice & Video' },
    comparisonRows: [
      {
        criterion: 'Guest Account Requirement',
        komuValue: 'No account needed for guests',
        alternativeValue: 'Requires Discord account + server invite',
      },
      {
        criterion: '1080p60 Screen Sharing',
        komuValue: 'Included cleanly in browser',
        alternativeValue: 'Gated behind Nitro subscription',
      },
      {
        criterion: 'Transcripts & Summaries',
        komuValue: 'Live background capture + HTML export',
        alternativeValue: 'Not built in natively',
      },
      {
        criterion: 'OBS Clean Feed Links',
        komuValue: 'Dedicated `/isolated-feed` per guest',
        alternativeValue: 'Requires third-party Discord overlays',
      },
    ],
    faqs: [
      {
        q: 'Can I still stream high-frame-rate screen shares without paying for a Nitro boost?',
        a: 'Yes. Komu publishes 1080p and 60fps streams directly over WebRTC depending on your network conditions.',
      },
      {
        q: 'Does Komu work for private music lessons and design crits too?',
        a: 'Yes. Live Performance audio mode and the embedded whiteboard make it suited for both lessons and creative critiques.',
      },
    ],
    relatedSlugs: [
      { category: 'use-cases', slug: 'music-and-vocal-lessons', label: 'Music & Vocal Lessons' },
      { category: 'use-cases', slug: 'live-streaming-and-podcasts', label: 'Live Streaming & Podcasts' },
      { category: 'integrations', slug: 'obs-studio-clean-feeds', label: 'OBS Studio Clean Feeds' },
    ],
  },

  // ==========================================
  // INTEGRATIONS (/integrations/:slug)
  // ==========================================
  {
    category: 'integrations',
    slug: 'obs-studio-clean-feeds',
    categoryLabel: 'Integration',
    headline: 'OBS Studio Clean Participant Feeds Over Browser Source',
    seoTitle: 'OBS Studio Clean Video Feeds | Komu Forum',
    metaDescription:
      'Pull distraction-free `/isolated-feed` browser sources for every guest straight into OBS Studio, vMix, or Ecamm Live.',
    summary:
      'Eliminate manual window cropping. Komu assigns each meeting participant an optional token-secured clean feed route designed specifically for broadcast switchers.',
    audience: 'Live streamers, church/event AV teams, esports broadcasters, and video editors',
    keywords: [
      'obs studio browser source webrtc',
      'isolated participant video feed',
      'clean video feed without ui obs',
      'komu forum isolated feed',
    ],
    keyHighlights: [
      {
        title: 'Zero Toolbars or Name Chrome',
        detail:
          'Isolated feeds render pure full-bleed video frames so OBS layouts stay pixel-accurate.',
      },
      {
        title: 'Revocable Security Tokens',
        detail:
          'Every exported link uses a short-lived token you can copy or revoke from Stream Settings anytime.',
      },
      {
        title: 'Works Across Desktop Switchers',
        detail:
          'Compatible with OBS Studio, Streamlabs, vMix, and any Chromium-based Browser Source.',
      },
    ],
    workflowSteps: [
      {
        step: '01',
        title: 'Generate Feed Link in Meeting',
        detail:
          'Right-click any participant tile or open Settings -> Stream & Export and copy their Isolated Feed link.',
      },
      {
        step: '02',
        title: 'Paste into OBS Browser Source',
        detail:
          'Set width to 1920 and height to 1080 in OBS Browser Source properties and allow audio control via OBS.',
      },
      {
        step: '03',
        title: 'Revoke Tokens When Broadcast Ends',
        detail:
          'Use the active exports panel to invalidate feed links immediately after wrapping production.',
      },
    ],
    comparisonHeader: { left: 'Komu Isolated Feed', right: 'Window Capture Cropping' },
    comparisonRows: [
      {
        criterion: 'Aspect Ratio Stability',
        komuValue: 'Locked full-frame 16:9 canvas',
        alternativeValue: 'Breaks whenever someone joins/leaves',
      },
      {
        criterion: 'UI Overlays',
        komuValue: '100% clean transparent/dark frame',
        alternativeValue: 'Buttons & cursor popups leak on air',
      },
      {
        criterion: 'Access Revocation',
        komuValue: 'One-click token revocation',
        alternativeValue: 'Static room access',
      },
    ],
    faqs: [
      {
        q: 'Do isolated feed links show tooltips, buttons, or notifications?',
        a: 'No. The `/isolated-feed` view renders strictly the target participant’s video track.',
      },
      {
        q: 'Can I export feeds for multiple speakers simultaneously?',
        a: 'Yes. Each participant has an independent feed link so you can build multi-box scenes inside OBS.',
      },
    ],
    relatedSlugs: [
      { category: 'use-cases', slug: 'live-streaming-and-podcasts', label: 'Live Streaming & Podcasts' },
      { category: 'integrations', slug: 'rtmp-live-broadcasting', label: 'RTMP Live Broadcasting' },
      { category: 'compare', slug: 'komu-vs-discord', label: 'Komu vs Discord' },
    ],
  },
  {
    category: 'integrations',
    slug: 'google-calendar-scheduling',
    categoryLabel: 'Integration',
    headline: 'Two-Way Google Calendar Sync for Instant Room Links',
    seoTitle: 'Google Calendar Video Meeting Sync | Komu Forum',
    metaDescription:
      'Schedule Komu Forum video rooms directly inside your dashboard with automatic Google Calendar event syncing and invite cards.',
    summary:
      'Keep your meeting calendar and workspace connected. View upcoming Google Calendar appointments beside your Personal Meeting Room and launch calls in one tap.',
    audience: 'Founders, executives, coaches, and distributed teams on Google Workspace',
    keywords: [
      'google calendar video meeting integration',
      'schedule browser meetings dashboard',
      'google calendar invite link generator',
      'komu forum calendar',
    ],
    keyHighlights: [
      {
        title: 'Live Dashboard Schedule Feed',
        detail:
          'See today’s scheduled calls, waiting room status, and instant join buttons right on `/dashboard`.',
      },
      {
        title: 'One-Click Google Calendar Create',
        detail:
          'Create calendar events with attached Komu meeting URLs without jumping between separate apps.',
      },
      {
        title: 'Rich Invite Preview Page',
        detail:
          'Recipients opening `/invite/:id` see meeting topic, host, date/time, and instant browser join.',
      },
    ],
    workflowSteps: [
      {
        step: '01',
        title: 'Sign In With Google',
        detail:
          'Authenticate securely using Google OAuth so Komu can sync your calendar availability.',
      },
      {
        step: '02',
        title: 'Schedule & Set Privacy Options',
        detail:
          'Pick a title, date/time, waiting room preference, and automatically generate a room code.',
      },
      {
        step: '03',
        title: 'Launch Straight From Your Dashboard',
        detail:
          'Click Join when it is time—your single transcript file attaches automatically to the session.',
      },
    ],
    comparisonHeader: { left: 'Komu Calendar Workflow', right: 'Manual Link Copy-Pasting' },
    comparisonRows: [
      {
        criterion: 'Room Creation',
        komuValue: 'Automatic link + host ownership saved',
        alternativeValue: 'Copy random codes manually per event',
      },
      {
        criterion: 'Host Recognition',
        komuValue: 'Creator auto-verified across devices',
        alternativeValue: 'Must manually type host PINs',
      },
      {
        criterion: 'Post-Call Follow-up',
        komuValue: 'Transcript & summary linked to room',
        alternativeValue: 'Disconnected from calendar event',
      },
    ],
    faqs: [
      {
        q: 'What if an invitee does not use Google Calendar?',
        a: 'You can copy the clean `/invite/:id` link anytime and send it via email, WhatsApp, or Slack.',
      },
      {
        q: 'Can I still use a permanent Personal Meeting ID for ad-hoc calls?',
        a: 'Yes. Your Personal Meeting Room stays pinned on your Dashboard alongside scheduled sessions.',
      },
    ],
    relatedSlugs: [
      { category: 'use-cases', slug: 'client-consultations', label: 'Client Consultations' },
      { category: 'use-cases', slug: 'remote-team-standups', label: 'Remote Team Standups' },
      { category: 'integrations', slug: 'styled-transcript-exports', label: 'Styled Transcript Exports' },
    ],
  },
  {
    category: 'integrations',
    slug: 'rtmp-live-broadcasting',
    categoryLabel: 'Integration',
    headline: 'Go Live From Any Meeting With Integrated RTMP Broadcasting',
    seoTitle: 'RTMP Live Broadcasting from Meetings | Komu Forum',
    metaDescription:
      'Stream panel discussions, webinars, and town halls directly from Komu Forum to YouTube Live, Twitch, or custom RTMP destinations.',
    summary:
      'Turn any interactive call or webinar room into a live public broadcast using standard RTMP ingest URLs and stream keys—no extra encoding machine required.',
    audience: 'Webinar hosts, community managers, creators, and town-hall organizers',
    keywords: [
      'webrtc meeting to rtmp live stream',
      'stream meeting to youtube twitch',
      'webinar live broadcast browser',
      'komu forum rtmp streaming',
    ],
    keyHighlights: [
      {
        title: 'Server-Side Egress Ready',
        detail:
          'Push room audio and video straight to YouTube, Twitch, or custom RTMP servers without maxing out your laptop CPU.',
      },
      {
        title: 'Webinar & Panelist Roles',
        detail:
          'Promote key speakers to stage panelists while keeping broader audience Q&A moderated.',
      },
      {
        title: 'Synchronized Stage Cards',
        detail:
          'Display branded title slates and PDF decks directly in the broadcast layout.',
      },
    ],
    workflowSteps: [
      {
        step: '01',
        title: 'Enter Stream Key in Host Settings',
        detail:
          'Open Stream Settings inside Host Controls and select YouTube, Twitch, or Custom RTMP.',
      },
      {
        step: '02',
        title: 'Pin Active Speakers or Stage Deck',
        detail:
          'Arrange your stage layout and stage cards cleanly before starting broadcast.',
      },
      {
        step: '03',
        title: 'Monitor Live Q&A & Transcript',
        detail:
          'Capture audience questions in Q&A while your transcript logs every spoken answer automatically.',
      },
    ],
    comparisonHeader: { left: 'Komu Integrated RTMP', right: 'Local Screen Capture Stream' },
    comparisonRows: [
      {
        criterion: 'Host Laptop Load',
        komuValue: 'Light browser tab footprint',
        alternativeValue: 'Heavy local video encoding fan noise',
      },
      {
        criterion: 'Moderator Controls',
        komuValue: 'Native Q&A, polls & broadcast banners',
        alternativeValue: 'Requires separate chat bots',
      },
      {
        criterion: 'Recording Protection',
        komuValue: 'Exit guard prevents lost local saves',
        alternativeValue: 'Risk of abrupt tab-close loss',
      },
    ],
    faqs: [
      {
        q: 'Which streaming platforms are supported?',
        a: 'Any destination accepting standard RTMP ingest URLs and stream keys, including YouTube Live, Twitch, and custom media servers.',
      },
      {
        q: 'Can attendees interact without appearing on camera?',
        a: 'Yes. Host Controls support Q&A queues, live polls, and chat tabs without cluttering the video stage.',
      },
    ],
    relatedSlugs: [
      { category: 'integrations', slug: 'obs-studio-clean-feeds', label: 'OBS Studio Clean Feeds' },
      { category: 'use-cases', slug: 'live-streaming-and-podcasts', label: 'Live Streaming & Podcasts' },
      { category: 'compare', slug: 'komu-vs-zoom', label: 'Komu vs Zoom' },
    ],
  },
  {
    category: 'integrations',
    slug: 'styled-transcript-exports',
    categoryLabel: 'Integration',
    headline: 'Single-File Auto-Transcripts & Print-Ready Exports',
    seoTitle: 'Auto-Saved Styled Meeting Transcripts | Komu Forum',
    metaDescription:
      'Capture live speech silently in the background into one non-duplicated note and download clean, styled print-ready HTML transcripts.',
    summary:
      'Raw `.txt` dumps with broken words make review painful. Komu continuously merges speaker blocks in the background into one canonical record and exports crisp styled documents.',
    audience: 'Teams, students, researchers, and consultants who archive every session',
    keywords: [
      'styled html meeting transcript export',
      'auto download meeting transcript',
      'non duplicate background meeting transcript',
      'mobile friendly meeting transcription no beep',
    ],
    keyHighlights: [
      {
        title: 'Editorial Print-Ready HTML Format',
        detail:
          'Exports render with structured speaker typography, timestamps, clean margins, and a Print / Save PDF header.',
      },
      {
        title: 'Silent Mobile Capture',
        detail:
          'On mobile phones, speech capture avoids Android and iOS dictation chimes so calls stay uninterrupted.',
      },
      {
        title: 'One File Per Session + Auto-Download Toggle',
        detail:
          'Never creates duplicate transcript notes in your dashboard, with a toggle to control auto-download on exit.',
      },
    ],
    workflowSteps: [
      {
        step: '01',
        title: 'Speak Naturally During Any Call',
        detail:
          'Background transcription merges continuous remarks by speaker cleanly and flushes safely even on sudden tab close.',
      },
      {
        step: '02',
        title: 'Configure Auto-Download Preference',
        detail:
          'Toggle automatic transcript download on exit anytime inside Dashboard Settings or in-call Settings.',
      },
      {
        step: '03',
        title: 'Generate Optional End-of-Call Recap',
        detail:
          'Keep raw transcripts strictly factual with zero AI interference, then request an AI recap only when you want a summary.',
      },
    ],
    comparisonHeader: { left: 'Komu Styled Transcripts', right: 'Raw .txt Chat Logs' },
    comparisonRows: [
      {
        criterion: 'Visual Presentation',
        komuValue: 'Print-ready styled HTML document',
        alternativeValue: 'Unformatted monospace `.txt` file',
      },
      {
        criterion: 'Speaker Turn Grouping',
        komuValue: 'Smart character-capped speaker blocks',
        alternativeValue: 'One messy line per 2-second pause',
      },
      {
        criterion: 'Duplicate File Prevention',
        komuValue: 'Deterministic room note ID (1 file)',
        alternativeValue: 'Multiple partial files on reconnect',
      },
      {
        criterion: 'Mobile Compatibility',
        komuValue: 'Silent background capture, zero beeps',
        alternativeValue: 'Repeated OS microphone chimes',
      },
    ],
    faqs: [
      {
        q: 'Does Komu mix AI guesses into the live transcript?',
        a: 'No. Live transcripts capture what was spoken cleanly without rewriting sentences; AI summaries remain strictly separate on demand.',
      },
      {
        q: 'What happens if I close the browser window abruptly?',
        a: 'Keepalive sync flushes pending speech blocks to your account before unload and triggers local download if enabled.',
      },
    ],
    relatedSlugs: [
      { category: 'use-cases', slug: 'client-consultations', label: 'Client Consultations' },
      { category: 'use-cases', slug: 'remote-team-standups', label: 'Remote Team Standups' },
      { category: 'compare', slug: 'komu-vs-google-meet', label: 'Komu vs Google Meet' },
    ],
  },
];

export function findSeoPage(category: string | undefined, slug: string | undefined): SeoPageEntry | undefined {
  if (!category || !slug) return undefined;
  return SEO_PAGES.find((p) => p.category === category && p.slug === slug);
}

export function getSeoPagesByCategory(category: SeoCategory): SeoPageEntry[] {
  return SEO_PAGES.filter((p) => p.category === category);
}
