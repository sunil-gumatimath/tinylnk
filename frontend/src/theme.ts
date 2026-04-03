import { theme, type ThemeConfig } from 'antd';

export const chartColors = ['#1d4ed8', '#f97316', '#0891b2', '#10b981', '#7c3aed', '#ef4444', '#f59e0b'];

export const getAppTheme = (isDark: boolean): ThemeConfig => ({
  algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1d4ed8',
    colorInfo: '#1d4ed8',
    colorSuccess: '#059669',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorTextBase: isDark ? '#e2e8f0' : '#14213d',
    colorBgBase: isDark ? '#0f172a' : '#f5efe4',
    colorBgLayout: isDark ? '#0f172a' : '#f5efe4',
    colorBgContainer: isDark ? '#1e293b' : '#fffaf2',
    colorBgElevated: isDark ? '#1e293b' : '#fffdf8',
    colorBorder: isDark ? '#334155' : '#d8cfc0',
    borderRadius: 18,
    fontFamily: "'Manrope', 'Segoe UI', sans-serif",
    fontSize: 15,
  },
  components: {
    Layout: {
      bodyBg: isDark ? '#0f172a' : '#f5efe4',
      headerBg: 'transparent',
      footerBg: 'transparent',
      siderBg: 'transparent',
    },
    Button: {
      controlHeight: 46,
      borderRadius: 14,
      fontWeight: 700,
    },
    Input: {
      controlHeight: 48,
      activeBorderColor: '#1d4ed8',
      hoverBorderColor: '#3b82f6',
      colorBgContainer: isDark ? '#1e293b' : '#fffdf8',
      colorBorder: isDark ? '#334155' : '#d8cfc0',
    },
    InputNumber: {
      controlHeight: 48,
      colorBgContainer: isDark ? '#1e293b' : '#fffdf8',
      colorBorder: isDark ? '#334155' : '#d8cfc0',
    },
    Modal: {
      borderRadiusLG: 24,
      contentBg: isDark ? '#1e293b' : '#fffdf8',
      headerBg: 'transparent',
    },
    Popconfirm: {
      borderRadiusLG: 18,
    },
    Form: {
      labelColor: isDark ? '#94a3b8' : '#5b6475',
    },
  },
});

// TODO: Add dark mode theme variant

// TODO: Verify WCAG AA color contrast compliance

// TODO: Add high contrast mode for accessibility

// TODO: Add high contrast mode for accessibility

// TODO: Add WCAG AA color contrast verification
