import { theme, type ThemeConfig } from 'antd';

export const chartColors = {
  dark: ['#a3ff12', '#fb923c', '#60a5fa', '#4ade80', '#c084fc', '#f87171', '#facc15'],
  light: ['#15803d', '#ea580c', '#2563eb', '#059669', '#7c3aed', '#dc2626', '#d97706'],
};

export const getAppTheme = (isDark: boolean): ThemeConfig => ({
  algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    colorPrimary: isDark ? '#a3ff12' : '#15803d',
    colorInfo: isDark ? '#60a5fa' : '#2563eb',
    colorSuccess: isDark ? '#4ade80' : '#15803d',
    colorWarning: isDark ? '#facc15' : '#854d0e',
    colorError: isDark ? '#f87171' : '#b91c1c',
    colorTextBase: isDark ? '#fafafa' : '#0f172a',
    colorTextLightSolid: isDark ? '#101010' : '#ffffff',
    colorBgBase: isDark ? '#101010' : '#ffffff',
    colorBgLayout: isDark ? '#101010' : '#f8f9fa',
    colorBgContainer: isDark ? '#171717' : '#ffffff',
    colorBgElevated: isDark ? '#171717' : '#ffffff',
    colorBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0',
    // One control-height scale for every form control (Input, Select, Picker,
    // InputNumber, Button) so neighbours in a toolbar line up.
    controlHeight: 44,
    controlHeightLG: 48,
    controlHeightSM: 32,
    borderRadius: 4,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 15,
  },
  components: {
    Layout: {
      bodyBg: isDark ? '#101010' : '#f8f9fa',
      headerBg: 'transparent',
      footerBg: 'transparent',
      siderBg: 'transparent',
    },
    Button: {
      fontWeight: 700,
    },
    Input: {
      activeBorderColor: isDark ? '#a3ff12' : '#15803d',
      hoverBorderColor: isDark ? '#baff52' : '#16a34a',
    },
    Modal: {
      borderRadiusLG: 4,
      contentBg: isDark ? '#171717' : '#ffffff',
      headerBg: 'transparent',
    },
    Popconfirm: {
      borderRadiusLG: 4,
    },
    Form: {
      labelColor: isDark ? '#a1a1a1' : '#64748b',
    },
  },
});

