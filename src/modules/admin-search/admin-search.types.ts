// src/modules/admin-search/admin-search.types.ts
export type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
  type?: string; // 'destination' | 'experience' | 'user' | 'booking'
  meta?: Record<string, any>;
};

export type SearchSection = {
  id: string;
  title: string;
  items: SearchItem[];
};
