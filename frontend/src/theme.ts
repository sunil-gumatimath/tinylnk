import type { ThemeConfig } from 'antd';

export const chartColors = ['#1d4ed8', '#f97316', '#0891b2', '#10b981', '#7c3aed', '#ef4444', '#f59e0b'];

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1d4ed8',
    colorInfo: '#1d4ed8',
    colorSuccess: '#059669',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorTextBase: '#14213d',
    colorBgBase: '#f5efe4',
    colorBgLayout: '#f5efe4',
    colorBgContainer: '#fffaf2',
    colorBgElevated: '#fffdf8',
    colorBorder: '#d8cfc0',
    borderRadius: 18,
    fontFamily: "'Manrope', 'Segoe UI', sans-serif",
    fontSize: 15,
  },
  components: {
    Layout: {
      bodyBg: '#f5efe4',
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
      colorBgContainer: '#fffdf8',
      colorBorder: '#d8cfc0',
    },
    InputNumber: {
      controlHeight: 48,
      colorBgContainer: '#fffdf8',
      colorBorder: '#d8cfc0',
    },
    Modal: {
      borderRadiusLG: 24,
      contentBg: '#fffdf8',
      headerBg: 'transparent',
    },
    Popconfirm: {
      borderRadiusLG: 18,
    },
    Form: {
      labelColor: '#5b6475',
    },
  },
};
