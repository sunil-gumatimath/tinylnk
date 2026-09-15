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
    // One control-height scale for every form control (Input, Select, Picker,
    // InputNumber, Button) so neighbours in a toolbar line up. Per-component
    // controlHeight overrides (Button 46, Input 48, Select/Picker falling back
    // to AntD's 32) used to leave mismatched heights side by side.
    controlHeight: 44,
    controlHeightLG: 48,
    controlHeightSM: 32,
    borderRadius: 14,
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
      fontWeight: 700,
    },
    Input: {
      activeBorderColor: '#1d4ed8',
      hoverBorderColor: '#3b82f6',
    },
    Modal: {
      borderRadiusLG: 24,
      contentBg: isDark ? '#1e293b' : '#fffdf8',
      headerBg: 'transparent',
    },
    Popconfirm: {
      borderRadiusLG: 16,
    },
    Form: {
      labelColor: isDark ? '#94a3b8' : '#5b6475',
    },
  },
});

