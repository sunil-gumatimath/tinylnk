import type { ShortenFormValues, ShortenedURL } from './types';

/** Only the selected expiry mode contributes to the request. */
export function resolveExpiry(values: ShortenFormValues): number | null {
  return values.expires_in_hours === 'CUSTOM'
    ? values.custom_expires_in_hours ?? null
    : values.expires_in_hours ?? null;
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('Use an http:// or https:// URL.');
  }
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(normalized);
  if (!parsed.hostname.includes('.') || parsed.username || parsed.password) {
    throw new Error('Enter a public destination URL without sign-in credentials.');
  }
  return parsed.href;
}

export async function validateDestination(_rule: unknown, value: string) {
  if (!value?.trim()) return;
  try {
    normalizeUrl(value);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Enter a valid destination URL.');
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    const text = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((item: { loc?: string[]; msg?: string }) => `${item.loc?.at(-1) ?? 'Input'}: ${item.msg ?? 'Invalid value'}`).join(' · ')
      : null;
    throw new Error(text || `Request failed (${response.status}). Please try again.`);
  }
  if (data === null) throw new Error('The server returned an invalid response. Please try again.');
  return data as T;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function linkStatus(record: Pick<ShortenedURL, 'expires_at' | 'max_clicks' | 'click_count'>, now = Date.now()) {
  if (record.expires_at && new Date(record.expires_at).getTime() <= now) return 'Expired';
  if (record.max_clicks != null && record.click_count >= record.max_clicks) return 'Click limit reached';
  return 'Active';
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Let the browser consume the download before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function luminance(hex: string): number {
  const rgb = hex.match(/\w{2}/g)!.map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

const NAMED_COLORS: Record<string, string> = {
  black: '000000',
  white: 'ffffff',
};

/** Conservative palette guard; actual scanning still depends on size and printing. */
export function isReadableQr(fg: string, bg: string): boolean {
  const toHex = (value: string) => NAMED_COLORS[value.toLowerCase()] ?? value;
  const foreground = luminance(toHex(fg));
  const background = luminance(toHex(bg));
  return background > foreground && (background + 0.05) / (foreground + 0.05) >= 4.5;
}
