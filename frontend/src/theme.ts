import { theme, type ThemeConfig } from 'antd';

export const chartColors = {
  dark: ['#a3ff12', '#fb923c', '#60a5fa', '#4ade80', '#c084fc', '#f87171', '#facc15'],
  light: ['#4d7c0f', '#c2410c', '#1d4ed8', '#047857', '#6d28d9', '#b91c1c', '#a16207'],
};

export const getAppTheme = (isDark: boolean): ThemeConfig => ({
  algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    colorPrimary: isDark ? '#a3ff12' : '#4d7c0f',
    colorInfo: isDark ? '#60a5fa' : '#1d4ed8',
    colorSuccess: isDark ? '#4ade80' : '#15803d',
    colorWarning: isDark ? '#facc15' : '#854d0e',
    colorError: isDark ? '#f87171' : '#b91c1c',
    colorTextBase: isDark ? '#fafafa' : '#0a0a0a',
    colorTextLightSolid: isDark ? '#101010' : '#ffffff',
    colorBgBase: isDark ? '#101010' : '#ffffff',
    colorBgLayout: isDark ? '#101010' : '#ffffff',
    colorBgContainer: isDark ? '#171717' : '#ffffff',
    colorBgElevated: isDark ? '#171717' : '#ffffff',
    colorBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e5e5e5',
    // One control-height scale for every form control (Input, Select, Picker,
    // InputNumber, Button) so neighbours in a toolbar line up. Per-component
    // controlHeight overrides (Button 46, Input 48, Select/Picker falling back
    // to AntD's 32) used to leave mismatched heights side by side.
    controlHeight: 44,
    controlHeightLG: 48,
    controlHeightSM: 32,
    borderRadius: 4,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 15,
  },
  components: {
    Layout: {
      bodyBg: isDark ? '#101010' : '#ffffff',
      headerBg: 'transparent',
      footerBg: 'transparent',
      siderBg: 'transparent',
    },
    Button: {
      fontWeight: 700,
    },
    Input: {
      activeBorderColor: isDark ? '#a3ff12' : '#4d7c0f',
      hoverBorderColor: isDark ? '#baff52' : '#3f6212',
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
      labelColor: isDark ? '#a1a1a1' : '#525252',
    },
  },
});

