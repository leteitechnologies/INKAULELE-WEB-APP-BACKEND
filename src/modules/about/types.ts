// src/modules/about/types.ts
export type ValueItem = { id?: string; title: string; desc?: string; icon?: string | null; order?: number };
export type TeamMember = { id?: string; name: string; role?: string; bio?: string; photo?: string | null; social?: any; order?: number };
export type StatItem = { id?: string; label: string; value?: number; order?: number };
export type TimelineItem = { id?: string; year: string; text?: string; order?: number };
export type FaqItem = { id?: string; q: string; a: string; order?: number };

export interface AboutPayload {
  slug?: string;
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroDesc?: string | null;
  heroImage?: string | null;
  missionTitle?: string | null;
  missionParagraphs?: string[];
  values?: ValueItem[];
  team?: TeamMember[];
  stats?: StatItem[];
  timeline?: TimelineItem[];
  faqs?: FaqItem[];
}
