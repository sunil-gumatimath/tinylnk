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
  /** Custom alias when one exists; absent/null otherwise. */
  custom_alias?: string | null;
}

export interface ClickEvent {
  clicked_at: string;
  referrer: string | null;
  user_agent: string | null;
  /** Parsed from `user_agent` server-side; "Unknown" when there is no UA. */
  browser?: string | null;
  os?: string | null;
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
  /** Custom alias on its own, or null when the link uses a generated code. */
  custom_alias?: string | null;
  total_clicks: number;
  clicks_by_date: StatsItem[];
  browser_stats: StatsItem[];
  os_stats: StatsItem[];
  referrer_stats: StatsItem[];
  recent_clicks: ClickEvent[];
}

export interface ShortenFormValues {
  url: string;
  custom_alias?: string;
  expires_in_hours?: number | 'CUSTOM';
  /** Hours typed into the "Custom..." expiry box (kept separate so the
  preset Select and the custom input never share one AntD field name). */
  custom_expires_in_hours?: number;
  max_clicks?: number;
  tag?: string;
}

