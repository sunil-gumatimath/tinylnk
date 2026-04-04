export interface ShortenedURL {
  id: number;
  original_url: string;
  short_code: string;
  short_url: string;
  created_at: string;
  expires_at: string | null;
  max_clicks: number | null;
  tag: string | null;
  click_count: number;
}

export interface ClickEvent {
  clicked_at: string;
  referrer: string | null;
  user_agent: string | null;
}

export interface StatsItem {
  name: string;
  value: number;
}

export interface UrlStats {
  original_url: string;
  short_code: string;
  created_at: string;
  expires_at: string | null;
  max_clicks: number | null;
  tag: string | null;
  total_clicks: number;
  clicks_by_date: StatsItem[];
  browser_stats: StatsItem[];
  os_stats: StatsItem[];
  recent_clicks: ClickEvent[];
}

export interface ShortenFormValues {
  url: string;
  custom_alias?: string;
  expires_in_hours?: number;
  max_clicks?: number;
  tag?: string;
}

// TODO: Add Zustand or Redux for global state

// TODO: Add Zustand store types for global state
