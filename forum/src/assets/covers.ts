import coverMinimalArch from './images/cover_minimal_architecture_1794526815010.jpg';
import coverSageBotanical from './images/cover_sage_botanical_1794526816816.jpg';
import coverAbstractSculptural from './images/cover_abstract_sculptural_1794526815569.jpg';
import coverStudioDesk from './images/cover_studio_desk_1794526816688.jpg';
import homeHeroCollab from './images/collaboration_hero_1782077549121.jpg';
import homeTeamCollab from './images/home_team_collaboration_1794526817223.jpg';

export interface CoverPreset {
  id: string;
  label: string;
  url: string;
}

export const MEETING_COVER_PRESETS: CoverPreset[] = [
  { id: 'studio', label: 'Studio', url: coverStudioDesk },
  { id: 'minimal', label: 'Minimal', url: coverMinimalArch },
  { id: 'sage', label: 'Botanical', url: coverSageBotanical },
  { id: 'sculptural', label: 'Sculptural', url: coverAbstractSculptural },
];

export const DEFAULT_MEETING_COVER = coverStudioDesk;
export const HOME_HERO_IMAGE = homeHeroCollab;
export const HOME_SECONDARY_IMAGE = homeTeamCollab;

export const VIRTUAL_BG_ASSETS = [
  { id: 'bg-studio', label: 'Architectural Studio', url: coverStudioDesk },
  { id: 'bg-minimal', label: 'Minimal Pavilion', url: coverMinimalArch },
  { id: 'bg-sage', label: 'Botanical Sanctuary', url: coverSageBotanical },
  { id: 'bg-sculptural', label: 'Gallery Space', url: coverAbstractSculptural },
];
