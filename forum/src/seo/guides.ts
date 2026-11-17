export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  cluster: string;
  intent: string;
  introduction: string;
  sections: GuideSection[];
  faqs: { question: string; answer: string }[];
  related: string[];
}

export const guides: Guide[] = [
  {
    slug: 'join-a-video-meeting-without-downloading-an-app',
    title: 'How to Join a Video Meeting Without Downloading an App',
    description: 'A practical guide to joining browser-based video meetings, checking your camera and microphone, and helping guests connect without installing software.',
    cluster: 'Browser video meetings',
    intent: 'Join a meeting from a browser without an app or account',
    introduction: 'When someone sends you a meeting link, joining should be straightforward. A browser-based meeting lets guests open the link, choose a display name, allow camera or microphone access, and enter the room without first installing a desktop application.',
    sections: [
      {
        heading: 'Join from the meeting link',
        paragraphs: [
          'Open the invitation in a current version of Chrome, Edge, Firefox, or Safari. If the link opens a meeting page, follow its join prompts and enter the name you want other participants to see. With Forum, guests can join a room from a browser link without creating an account.',
          'If the invitation contains a meeting code instead of a direct link, open the meeting service and enter the code there. Check with the organizer if the code has expired or the room is restricted.'
        ],
        bullets: ['Use the original invitation link when possible.', 'Enter the name the host will recognize.', 'Join a few minutes early if you need to test your setup.']
      },
      {
        heading: 'Allow camera and microphone access',
        paragraphs: [
          'Your browser asks for permission before a website can use your camera or microphone. Choose Allow for the meeting site, then confirm the correct devices are selected. If you blocked access earlier, use the browser controls beside the address bar to update the permission and reload the meeting.',
          'A headset can reduce echo. If you do not need to speak, joining with the microphone muted is a considerate default in a busy room.'
        ]
      },
      {
        heading: 'Fix common joining problems',
        paragraphs: [
          'If the camera preview is blank, close other apps or browser tabs that may already be using the camera. If you cannot hear anyone, check the selected output device and the computer’s volume before leaving and rejoining.',
          'A work or school network may block real-time media traffic. Try a trusted alternate network or ask the host whether there is another way to participate. Avoid sharing sensitive meeting links publicly.'
        ],
        bullets: ['Refresh after changing a permission.', 'Quit other video-call apps that may hold the camera.', 'Ask the organizer to resend the invite if the room cannot be found.']
      },
      {
        heading: 'Make the meeting easier to follow',
        paragraphs: [
          'Keep the meeting link private, join from a quiet place, and tell the group if you need to step away. When the call includes a shared whiteboard or notes, use those shared materials to follow decisions instead of relying on memory.'
        ]
      }
    ],
    faqs: [
      { question: 'Can I join a video meeting without creating an account?', answer: 'That depends on the meeting service and host settings. Forum supports guests joining a meeting link without an account; some other services require sign-in.' },
      { question: 'Do browser meetings need a download?', answer: 'Forum meetings run in a modern web browser, so guests do not need to install a separate meeting app. Camera and microphone permissions are still required for those devices.' },
      { question: 'Why does my browser ask for camera permission?', answer: 'Browsers require your permission before a site can access your camera or microphone. You can change that permission in the browser’s site settings.' }
    ],
    related: ['collaborative-whiteboard-for-online-meetings', 'shared-meeting-notes-and-action-items']
  },
  {
    slug: 'collaborative-whiteboard-for-online-meetings',
    title: 'How to Use a Collaborative Whiteboard in an Online Meeting',
    description: 'Turn a video call into a working session with a simple whiteboard agenda, shared visual exercises, and clear next steps.',
    cluster: 'Visual collaboration',
    intent: 'Choose and run an online meeting whiteboard activity',
    introduction: 'A shared whiteboard is most useful when the group has a specific question to answer. Start with a prompt, give participants a short period to contribute, and finish by turning the strongest ideas into decisions or follow-up work.',
    sections: [
      {
        heading: 'Prepare a board around one outcome',
        paragraphs: [
          'Before the call, write one question at the top of the board—for example, “Which onboarding step causes the most confusion?” Divide the canvas into a few areas such as observations, ideas, and decisions. A focused layout is easier to use than a blank canvas with no directions.',
          'For a planning session, a simple timeline or now/next/later layout can help a team surface dependencies. Keep the exercise small enough to finish during the meeting.'
        ],
        bullets: ['State the question and time limit.', 'Use a few labeled areas instead of an oversized template.', 'Tell participants how to add or move items before the timer starts.']
      },
      {
        heading: 'Give everyone a way to contribute',
        paragraphs: [
          'Invite people to add their ideas silently for the first few minutes. This gives quieter participants a chance to contribute before the conversation is dominated by the first suggestion. Then group similar notes and ask the team to explain any disagreements.',
          'For a remote group, narrate meaningful changes to the board. Participants who are on a small screen, using assistive technology, or temporarily unable to see the canvas should still be able to follow the discussion.'
        ]
      },
      {
        heading: 'Close with decisions, not just drawings',
        paragraphs: [
          'Before ending the exercise, identify the ideas the team selected, the owner for each next step, and any unresolved question. Copy these outcomes into shared meeting notes so they remain findable after the call.',
          'Forum includes a collaborative whiteboard within the meeting workspace, so a group can discuss and sketch without switching to a separate window. Use it for live collaboration; keep a written summary of decisions for later reference.'
        ]
      },
      {
        heading: 'A 15-minute idea-sorting exercise',
        paragraphs: ['Use this short sequence when a team needs to turn a broad problem into a few testable options.'],
        bullets: ['2 minutes: agree on the problem statement.', '4 minutes: add one idea per note, without discussion.', '5 minutes: group similar ideas and ask clarifying questions.', '3 minutes: choose one experiment and name an owner.', '1 minute: record the decision and review date in meeting notes.']
      }
    ],
    faqs: [
      { question: 'What should an online meeting whiteboard include?', answer: 'Start with one clear prompt and a small number of labeled areas. Add instructions and a time limit so participants know how to contribute.' },
      { question: 'How do you include people who cannot see the board clearly?', answer: 'Read important content aloud, describe changes, and capture decisions in shared text notes so the activity is not dependent on the visual canvas alone.' },
      { question: 'Can a whiteboard replace meeting notes?', answer: 'A board is useful for visual exploration, but a short written record is better for decisions, owners, and dates. Capture those separately before the meeting ends.' }
    ],
    related: ['join-a-video-meeting-without-downloading-an-app', 'shared-meeting-notes-and-action-items', 'remote-team-meeting-agenda-template']
  },
  {
    slug: 'shared-meeting-notes-and-action-items',
    title: 'Shared Meeting Notes: A Simple System for Decisions and Action Items',
    description: 'Use a lightweight shared-notes format to capture meeting decisions, accountable owners, deadlines, and open questions.',
    cluster: 'Meeting notes',
    intent: 'Make meeting minutes useful and turn discussion into follow-through',
    introduction: 'Useful meeting notes are not a transcript. They help someone who missed the call understand what was decided and help the people who attended remember what happens next. A shared document or meeting note gives the group one place to capture that record while the conversation is fresh.',
    sections: [
      {
        heading: 'Use a short, repeatable notes template',
        paragraphs: ['Create the note at the start of the call and fill in the context before discussion begins. Keep the template short enough that someone can maintain it while listening.'],
        bullets: ['Purpose: why the group met.', 'Participants: who joined or contributed.', 'Decisions: what the group agreed to and why.', 'Action items: a concrete task, one owner, and a due date.', 'Open questions: what still needs an answer and who will follow up.']
      },
      {
        heading: 'Write decisions so they are unambiguous',
        paragraphs: [
          'Record the decision itself rather than a vague summary of the discussion. “Use the shorter signup form for the next test” is more useful than “We discussed signup.” Add a sentence of context if it will help a future reader understand the trade-off.',
          'Separate a proposal from an agreed decision. If the team has not decided, mark the item as open and name who will bring the missing information.'
        ]
      },
      {
        heading: 'Make action items accountable',
        paragraphs: [
          'A follow-up should have one clearly named owner, an observable outcome, and a date. “Look into the issue” is hard to verify; “Jordan will share a reproduction of the sign-in issue by Thursday” gives the team a specific checkpoint.',
          'If the group cannot identify an owner or deadline, keep the item in the open-questions section instead of presenting it as completed work.'
        ]
      },
      {
        heading: 'End with a 60-second read-back',
        paragraphs: [
          'Reserve the last minute to read the decisions and action items out loud. Correct misunderstandings, confirm owners, and make sure participants can find the note after leaving. This small habit catches missing follow-ups before they become forgotten work.',
          'Forum provides shared notes alongside its meeting tools, which lets participants capture decisions during a call. Keep sensitive details in the appropriate access-controlled system and share notes only with the intended audience.'
        ]
      }
    ],
    faqs: [
      { question: 'What is the difference between meeting minutes and a transcript?', answer: 'Minutes summarize purpose, decisions, action items, and open questions. A transcript records what was said in much greater detail and is not necessary for most routine meetings.' },
      { question: 'Who should take shared meeting notes?', answer: 'Choose a note-taker before the meeting or rotate the role. For collaborative sessions, participants can add details together, but one person should confirm the final decisions and owners.' },
      { question: 'How soon should meeting notes be shared?', answer: 'Share or confirm them before participants move on, while the decisions are still fresh. A quick read-back at the end of the call is an effective checkpoint.' }
    ],
    related: ['collaborative-whiteboard-for-online-meetings', 'remote-team-meeting-agenda-template', 'join-a-video-meeting-without-downloading-an-app']
  },
  {
    slug: 'remote-team-meeting-agenda-template',
    title: 'Remote Team Meeting Agenda: A Practical 30-Minute Template',
    description: 'A focused remote meeting agenda with preparation prompts, time boxes, facilitation tips, and a clear follow-up format.',
    cluster: 'Remote team meetings',
    intent: 'Plan a short, focused remote team meeting',
    introduction: 'Remote meetings work better when participants know why they are there and what the group needs to decide. This 30-minute agenda is a starting point for a team check-in or working session; remove any section that does not support the meeting’s outcome.',
    sections: [
      {
        heading: 'Before the meeting: decide whether a call is needed',
        paragraphs: [
          'Write down the outcome in one sentence. If the goal is only to share routine status, an asynchronous update may be easier for everyone. Schedule a live call when the group needs to make a decision, resolve a complex issue, or work through something together.',
          'Send the question, relevant links, and any preparation request with the invitation. Do not ask participants to prepare a presentation if a short written update will do.'
        ]
      },
      {
        heading: 'The 30-minute agenda',
        paragraphs: ['Share this outline with participants and name a facilitator and note-taker before the call.'],
        bullets: ['0–3 minutes — State the goal and confirm the decision needed.', '3–8 minutes — Share only context that changes the decision.', '8–20 minutes — Discuss the question; use a whiteboard to group ideas if useful.', '20–26 minutes — Choose an option or document what information is missing.', '26–30 minutes — Confirm decisions, owners, due dates, and the next check-in.']
      },
      {
        heading: 'Facilitate for a distributed group',
        paragraphs: [
          'Leave a pause after asking a question so people on slower connections or processing the discussion can contribute. Invite written input as well as spoken responses, and summarize the thread before moving on.',
          'If the conversation drifts, return to the stated outcome and decide whether the new topic deserves its own meeting. Avoid turning every update into a round-robin if the group can read it beforehand.'
        ]
      },
      {
        heading: 'Finish with a useful written record',
        paragraphs: [
          'Close by reading the decisions and action items from the shared notes. Each action needs one owner and a date; unresolved items need an explicit next step. Send the note to attendees and anyone responsible for follow-up.',
          'A browser-based meeting workspace can keep the live conversation, visual collaboration, and written notes together. Forum combines those tools so a team can move from discussion to documented next steps without adding another meeting app.'
        ]
      }
    ],
    faqs: [
      { question: 'How long should a remote team meeting be?', answer: 'Use the shortest time that supports the outcome. This 30-minute agenda is a starting point, not a rule; reduce or extend the time based on the decision and number of participants.' },
      { question: 'What should be sent before a remote meeting?', answer: 'Share the purpose, the decision or question, any essential links, and what participants need to prepare. Keep pre-work proportionate to the meeting.' },
      { question: 'How can remote meetings include quieter participants?', answer: 'Share context in advance, allow silent writing or chat responses, pause after questions, and make sure people have a chance to contribute before the group settles on a decision.' }
    ],
    related: ['shared-meeting-notes-and-action-items', 'collaborative-whiteboard-for-online-meetings']
  }
];
