/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 邀请推广相关状态和数据获取 Hook
 */

import { useState, useCallback } from 'react';
import api from '../../../services/api';
import { useToast } from '../../../components/ToastContainer';
import logger from '../../../utils/logger';

const useInvitationData = () => {
  const { showSuccess, showError } = useToast();

  // Invitation state
  const [invitation, setInvitation] = useState(null);
  const [invitees, setInvitees] = useState([]);
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');

  // Fetch invitation data
  const fetchInvitationData = useCallback(async () => {
    setInvitationLoading(true);
    try {
      // 获取邀请信息
      const inviteRes = await api.get('/user/invitation/my');
      if (inviteRes.data.code === 0) {
        // 新的API返回格式: { invitation: {...}, has_invitation: true/false }
        const { invitation: invitationData, has_invitation } = inviteRes.data.data;
        setInvitation(has_invitation ? invitationData : null);

        // 只有当用户有邀请码时才获取统计信息
        if (has_invitation) {
          // 获取邀请统计（包含被邀请者列表）
          const statsRes = await api.get('/user/invitation/statistics');
          if (statsRes.data.code === 0) {
            setInvitees(statsRes.data.data.relationships || []);
          }
        } else {
          // 没有邀请码时清空被邀请者列表
          setInvitees([]);
        }
      }
    } catch (error) {
      logger.error('Failed to fetch invitation data:', error);
    } finally {
      setInvitationLoading(false);
    }
  }, []);

  // Generate invitation code
  const generateInvitation = useCallback(async () => {
    try {
      const response = await api.post('/user/invitation/generate');
      if (response.data.code === 0) {
        setInvitation(response.data.data);
        showSuccess('邀请码生成成功！');
      }
    } catch (error) {
      showError('生成邀请码失败：' + (error.response?.data?.message || error.message));
    }
  }, [showSuccess, showError]);

  // Copy to clipboard
  const copyToClipboard = useCallback(async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(label);
      showSuccess(`${label}已复制到剪贴板！`);
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      showError('复制失败，请手动复制');
    }
  }, [showSuccess, showError]);

  // Get invitation URL
  const getInvitationUrl = useCallback(() => {
    if (!invitation) return '';
    return `${window.location.origin}/?invite=${invitation.invitation_code}`;
  }, [invitation]);

  return {
    // Invitation state
    invitation,
    invitees,
    invitationLoading,
    copySuccess,

    // Actions
    fetchInvitationData,
    generateInvitation,
    copyToClipboard,
    getInvitationUrl,
  };
};

export default useInvitationData;
