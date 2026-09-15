import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import { getAppTheme } from './theme';

type ThemeContextType = {
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Keeps the browser chrome (mobile URL bar) in step with the app theme. */
const THEME_COLOR = { dark: '#0f172a', light: '#f5efe4' };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tinylnk-theme');
      if (saved) return saved === 'dark';
      // Default to dark mode if no user preference is saved
      return true;
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem('tinylnk-theme', isDark ? 'dark' : 'light');
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark ? THEME_COLOR.dark : THEME_COLOR.light);
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <ConfigProvider theme={getAppTheme(isDark)}>
        {/* AntD's App supplies the themed context that static `message.*`
            calls cannot see (they use the default light algorithm), so toasts
            match the active theme. `component={false}` adds no wrapper DOM. */}
        <AntdApp component={false}>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
