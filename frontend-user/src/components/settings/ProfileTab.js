/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * ProfileTab - 设置页面的个人资料标签页
 */

import React, { useState, memo } from 'react';
import PropTypes from 'prop-types';
import { Edit2, Check, X } from 'lucide-react';

const ProfileTab = memo(({
  user,
  profile,
  isEditing,
  loading,
  onProfileChange,
  onSave,
  onEditToggle,
}) => {
  const [localProfile, setLocalProfile] = useState(profile);

  const handleChange = (field, value) => {
    setLocalProfile(prev => ({ ...prev, [field]: value }));
    onProfileChange?.(field, value);
  };

  const handleSave = () => {
    onSave(localProfile);
  };

  const handleCancel = () => {
    setLocalProfile(profile);
    onEditToggle(false);
  };

  return (
    <div className="settings-profile-tab">
      {/* 头像区域 */}
      <div className="profile-avatar-section">
        <div className="profile-avatar">
          {user?.avatar ? (
            <img src={user.avatar} alt="头像" />
          ) : (
            <div className="avatar-placeholder">
              {user?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
            </div>
          )}
        </div>
        <div className="profile-basic-info">
          <h3 className="profile-name">{user?.name || '未设置昵称'}</h3>
          <p className="profile-id">ID: {user?.userId || user?.id}</p>
        </div>
      </div>

      {/* 个人信息表单 */}
      <div className="profile-form">
        <div className="form-group">
          <label>昵称</label>
          <input
            type="text"
            value={isEditing ? localProfile.name : profile.name}
            onChange={(e) => handleChange('name', e.target.value)}
            disabled={!isEditing}
            placeholder="请输入昵称"
            maxLength={20}
          />
        </div>

        <div className="form-group">
          <label>个人简介</label>
          <textarea
            value={isEditing ? localProfile.bio : profile.bio}
            onChange={(e) => handleChange('bio', e.target.value)}
            disabled={!isEditing}
            placeholder="介绍一下自己吧"
            maxLength={200}
            rows={3}
          />
          {isEditing && (
            <span className="char-count">
              {localProfile.bio?.length || 0}/200
            </span>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="profile-actions">
          {isEditing ? (
            <>
              <button 
                className="btn-save"
                onClick={handleSave}
                disabled={loading}
              >
                <Check size={16} />
                {loading ? '保存中...' : '保存'}
              </button>
              <button 
                className="btn-cancel"
                onClick={handleCancel}
                disabled={loading}
              >
                <X size={16} />
                取消
              </button>
            </>
          ) : (
            <button 
              className="btn-edit"
              onClick={() => onEditToggle(true)}
            >
              <Edit2 size={16} />
              编辑资料
            </button>
          )}
        </div>
      </div>

      {/* 账号信息（只读） */}
      <div className="profile-readonly-info">
        <h4>账号信息</h4>
        <div className="info-row">
          <span className="info-label">邮箱</span>
          <span className="info-value">
            {user?.email || '未绑定'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">手机</span>
          <span className="info-value">
            {user?.phone ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '未绑定'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">注册时间</span>
          <span className="info-value">
            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '-'}
          </span>
        </div>
      </div>
    </div>
  );
});

ProfileTab.displayName = 'ProfileTab';

ProfileTab.propTypes = {
  user: PropTypes.object,
  profile: PropTypes.shape({
    name: PropTypes.string,
    bio: PropTypes.string,
  }),
  isEditing: PropTypes.bool,
  loading: PropTypes.bool,
  onProfileChange: PropTypes.func,
  onSave: PropTypes.func.isRequired,
  onEditToggle: PropTypes.func.isRequired,
};

export default ProfileTab;

