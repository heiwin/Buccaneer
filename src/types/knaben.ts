// ─── Knaben API Type Definitions ─────────────────────────────────────────────

export type AllowedTracker = '1337x' | 'The Pirate Bay' | 'YTS' | 'Nyaa.si';

export const ALLOWED_TRACKERS: AllowedTracker[] = [
  '1337x',
  'The Pirate Bay',
  'YTS',
  'Nyaa.si',
];

export interface TorrentResult {
  id: string;
  title: string;
  tracker: string;
  trackerId: string;
  magnetUrl: string | null;
  link?: string | null;
  hash: string | null;
  bytes: number;
  seeders: number;
  peers: number;
  category: string;
  date: string;
  lastSeen: string;
  virusDetection: number;
  details: string;
  onlyFiles?: number[];
}

export interface KnabenResponse {
  total: {
    value: number;
    relation: string;
  };
  max_score: number | null;
  hits: TorrentResult[];
}

export interface KnabenSearchRequest {
  search_type: string;
  search_field: string;
  query: string;
  order_by: string;
  order_direction: string;
  from: number;
  size: number;
  hide_unsafe: boolean;
  hide_xxx: boolean;
}
