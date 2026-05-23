/**
 * SettingsNavPanel —— 抽屉内"设置"导航
 * 参考 scholay.pen [Sidebar] 设置 · 账户（o20rac）
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  User,
  Bell,
  Lock,
  Globe,
  Target,
  Bot,
  FolderInput,
  HelpCircle,
} from 'lucide-react';

const ITEMS_ACCOUNT = [
  { key: 'profile',  icon: User,  label: '账户与资料', path: '/settings' },
  { key: 'notify',   icon: Bell,  label: '通知设置',   path: '/settings?tab=notify' },
  { key: 'privacy',  icon: Lock,  label: '隐私与安全', path: '/settings?tab=privacy' },
  { key: 'language', icon: Globe, label: '语言与地区', path: '/settings?tab=language' },
];

const ITEMS_RESEARCH = [
  { key: 'domain', icon: Target,      label: '研究领域',    path: '/settings?tab=domain' },
  { key: 'ai',     icon: Bot,         label: 'AI 助手偏好', path: '/settings?tab=ai' },
  { key: 'io',     icon: FolderInput, label: '导入与导出',  path: '/settings?tab=io' },
];

const ITEMS_OTHER = [
  { key: 'help', icon: HelpCircle, label: '帮助与反馈', path: '/feedback' },
];

const SettingsNavPanel = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const currentTab = params.get('tab') || 'profile';

  const renderItem = (item) => {
    const itemTab = (item.path.split('tab=')[1]) || 'profile';
    const active = location.pathname === '/settings' && currentTab === itemTab;
    const Icon = item.icon;
    return (
      <button
        type="button"
        key={item.key}
        className={`dp-row ${active ? 'is-active' : ''}`}
        onClick={() => navigate(item.path)}
      >
        <span className="dp-row-icon"><Icon size={14} strokeWidth={2} /></span>
        <span className="dp-row-label" style={{ fontWeight: active ? 700 : 400 }}>{item.label}</span>
      </button>
    );
  };

  return (
    <div className="dp-panel dp-panel--settings">
      <div className="dp-section-head">
        <span>设置</span>
        <span className="dp-section-count" style={{ color: '#111', fontWeight: 700 }}>账户</span>
      </div>
      {ITEMS_ACCOUNT.map(renderItem)}

      <div className="dp-section-head"><span>研究偏好</span></div>
      {ITEMS_RESEARCH.map(renderItem)}

      <div className="dp-section-head"><span>其他</span></div>
      {ITEMS_OTHER.map(renderItem)}
    </div>
  );
};

export default SettingsNavPanel;
