export interface Region {
  value: string;
  label: string;
}

export const STREAMING_PROVIDERS: Record<string, number> = {
  'Apple TV+': 350,
  'Netflix': 8,
  'Amazon Prime Video': 119,
  'Disney+': 337,
  'Max': 1899,
  'Paramount+': 531,
  'NOW': 389,
  'MGM+': 34,
  'Crunchyroll': 283,
  'Discovery+': 520,
  'TimVision': 485,
};

export const REGIONS: Region[] = [
  { value: 'IT', label: 'Italia' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Germany' },
  { value: 'ES', label: 'Spain' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'BR', label: 'Brazil' },
  { value: 'JP', label: 'Japan' },
];
