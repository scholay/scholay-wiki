import React from 'react';
import { Drawer, Switch } from 'antd';
import { useTheme } from '../contexts/ThemeContext';

const MobileHelpModal = ({ isOpen, onClose }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Drawer
      title="设置"
      open={isOpen}
      onClose={onClose}
      placement="bottom"
      height="auto"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
        <span>{theme === 'dark' ? '深色模式' : '浅色模式'}</span>
        <Switch
          checked={theme === 'light'}
          onChange={toggleTheme}
          checkedChildren="浅色"
          unCheckedChildren="深色"
        />
      </div>
    </Drawer>
  );
};

export default MobileHelpModal;
