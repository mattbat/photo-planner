/**
 * Light and dark appearance (REQUIREMENTS.md §14). By default the app follows
 * the phone's light/dark setting ("system"); Settings can force Light or Dark.
 *
 * The choice only matters on this device, so it lives in localStorage. A copy
 * of `applyTheme` runs inline in index.html before the app loads, so the app
 * opens in the right appearance without a flash of the other one.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_KEY = 'photo-planner.theme';

/** Status bar and browser chrome colors, matching --bg in styles.css. */
const CHROME = { dark: '#14120e', light: '#f7f5f0' } as const;

export function themePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersLight(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;
}

/** The appearance actually shown for a preference. */
export function resolveTheme(preference: ThemePreference): 'dark' | 'light' {
  if (preference === 'system') return systemPrefersLight() ? 'light' : 'dark';
  return preference;
}

/** Shows the preferred appearance: sets data-theme on <html> and the status bar color. */
export function applyTheme(preference = themePreference()): void {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[theme]);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Storage can be unavailable (e.g. private browsing); the choice lasts until the app closes.
  }
  applyTheme(preference);
}

/** Keeps "Match phone" (system) in step when the phone switches between light and dark. */
export function followSystemTheme(): void {
  if (typeof window.matchMedia !== 'function') return;
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (themePreference() === 'system') applyTheme('system');
  });
}
