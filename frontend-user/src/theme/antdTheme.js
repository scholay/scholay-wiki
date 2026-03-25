import { theme } from 'antd';

const commonToken = {
  colorPrimary: '#10a37f',
  colorSuccess: '#10b981',
  colorWarning: '#f59e0b',
  colorError: '#ef4444',
  colorInfo: '#3182ce',
  borderRadius: 12,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  wireframe: false,
};

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...commonToken,
    colorBgContainer: '#2d2d2d',
    colorBgElevated: '#3a3a3a',
    colorBgLayout: '#212121',
    colorBgSpotlight: '#444654',
    colorTextBase: 'rgba(255, 255, 255, 0.95)',
    colorBorder: 'rgba(255, 255, 255, 0.1)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.06)',
    colorLink: '#10a37f',
    colorLinkHover: '#19c37d',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    boxShadowSecondary: '0 4px 16px rgba(0, 0, 0, 0.3)',
  },
  components: {
    Layout: {
      siderBg: '#1a1a1a',
      headerBg: '#212121',
      bodyBg: '#212121',
      triggerBg: '#2d2d2d',
    },
    Menu: {
      darkItemBg: '#1a1a1a',
      darkSubMenuItemBg: '#141414',
      darkItemSelectedBg: 'rgba(16, 163, 127, 0.15)',
    },
    Table: {
      headerBg: '#2d2d2d',
      rowHoverBg: 'rgba(255, 255, 255, 0.04)',
    },
    Card: {
      colorBgContainer: '#2d2d2d',
    },
    Modal: {
      contentBg: '#2d2d2d',
      headerBg: '#2d2d2d',
    },
    Drawer: {
      colorBgElevated: '#2d2d2d',
    },
    Input: {
      colorBgContainer: '#3a3a3a',
      activeBorderColor: '#10a37f',
    },
  },
};

export const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...commonToken,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f9fafb',
    colorBgSpotlight: '#f5f7fa',
    colorTextBase: '#1a202c',
    colorBorder: '#e2e8f0',
    colorBorderSecondary: '#edf2f7',
    colorLink: '#10a37f',
    colorLinkHover: '#0d8968',
    colorSuccess: '#059669',
    colorError: '#e53e3e',
    colorWarning: '#dd6b20',
    colorInfo: '#3182ce',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
    boxShadowSecondary: '0 2px 8px rgba(0, 0, 0, 0.06)',
  },
  components: {
    Layout: {
      siderBg: '#ffffff',
      headerBg: '#ffffff',
      bodyBg: '#f9fafb',
    },
    Table: {
      headerBg: '#fafafa',
      rowHoverBg: '#f5f7fa',
    },
    Card: {
      colorBgContainer: '#ffffff',
    },
    Modal: {
      contentBg: '#ffffff',
      headerBg: '#ffffff',
    },
  },
};

export const adminTheme = {
  token: {
    colorPrimary: '#1677ff',
    colorLink: '#1677ff',
    colorLinkHover: '#4096ff',
  },
};
