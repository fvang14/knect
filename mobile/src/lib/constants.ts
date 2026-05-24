export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'knect_access_token',
  REFRESH_TOKEN: 'knect_refresh_token',
} as const;

export const STATIC_TRADE_CATEGORIES = [
  { id: '1', name: 'Plumbing', icon_slug: 'pipe' },
  { id: '2', name: 'Electrical', icon_slug: 'bolt' },
  { id: '3', name: 'Carpentry', icon_slug: 'hammer' },
  { id: '4', name: 'Painting', icon_slug: 'brush' },
  { id: '5', name: 'HVAC', icon_slug: 'wind' },
  { id: '6', name: 'Landscaping', icon_slug: 'leaf' },
  { id: '7', name: 'Cleaning', icon_slug: 'sparkle' },
  { id: '8', name: 'Moving', icon_slug: 'box' },
] as const;
