/**
 * ============================================================================
 * Scholay学术 V1.0
 * 智能审稿 V2 主壳 — 接入 peer.scholay.com 的客户端入口。
 *
 * 布局:
 *   ┌──────────┬─────────────────────────────────────┐
 *   │ Sidebar  │ Workspace                           │
 *   │  历史    │  - 空态: UploadView                 │
 *   │  会话    │  - 进行中: FourPanelStream          │
 *   │          │  - 完成态: FinalReview + FollowUp   │
 *   └──────────┴─────────────────────────────────────┘
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  peerReview2API,
  pr2AnonToken,
} from '../services/peerReview2.api';
import ConversationListSidebar from './peer-review-v2/components/ConversationListSidebar';
import UploadView from './peer-review-v2/components/UploadView';
import ReviewWorkspace from './peer-review-v2/components/ReviewWorkspace';
import './peer-review-v2/styles.css';

const PeerReviewV2Page = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSelectedId = searchParams.get('id');

  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState(
    urlSelectedId ? Number(urlSelectedId) : null,
  );
  const [conversation, setConversation] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [trial, setTrial] = useState(null);

  // 列表加载
  const reloadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await peerReview2API.listConversations(1, 50);
      setItems(data.items || []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pr2-page] list failed', err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // 详情加载
  const reloadConversation = useCallback(async (id) => {
    if (!id) {
      setConversation(null);
      return;
    }
    try {
      const detail = await peerReview2API.getConversation(id);
      setConversation(detail);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pr2-page] detail failed', err);
      setConversation(null);
    }
  }, []);

  // 试用余额
  const reloadTrial = useCallback(async () => {
    try {
      const t = await peerReview2API.trialStatus();
      setTrial(t);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    reloadList();
    reloadTrial();
  }, [reloadList, reloadTrial]);

  useEffect(() => {
    if (selectedId) {
      reloadConversation(selectedId);
      // 同步 URL
      const next = new URLSearchParams(searchParams);
      next.set('id', String(selectedId));
      setSearchParams(next, { replace: true });
    } else {
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // 上传 → 创建会话 → 选中
  const onUpload = useCallback(
    async (file) => {
      setUploading(true);
      setUploadErr('');
      try {
        const created = await peerReview2API.createConversation(file, file.name);
        await reloadList();
        await reloadTrial();
        setSelectedId(created.id);
      } catch (err) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          '上传失败,请稍后重试';
        setUploadErr(msg);
      } finally {
        setUploading(false);
      }
    },
    [reloadList, reloadTrial],
  );

  const onSelect = useCallback((id) => {
    setSelectedId(id);
  }, []);

  const onNew = useCallback(() => {
    setSelectedId(null);
    setConversation(null);
  }, []);

  const onDelete = useCallback(
    async (id) => {
      try {
        await peerReview2API.deleteConversation(id);
        if (selectedId === id) {
          setSelectedId(null);
          setConversation(null);
        }
        await reloadList();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[pr2-page] delete failed', err);
      }
    },
    [selectedId, reloadList],
  );

  // 子组件状态变化(turn done 等)→ 刷新列表 + 详情
  const onWorkspaceChanged = useCallback(() => {
    reloadList();
    if (selectedId) reloadConversation(selectedId);
  }, [reloadList, reloadConversation, selectedId]);

  // 登录态变化时清掉旧 anon_token (避免登录用户继续带匿名身份)
  useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (token && pr2AnonToken.get()) {
      // 登录用户:不主动清,先尝试认领老的匿名会话
      const anonTok = pr2AnonToken.get();
      peerReview2API
        .claimAll(anonTok)
        .then(() => {
          pr2AnonToken.clear();
          reloadList();
        })
        .catch(() => {
          /* ignore: 没有可认领的也没关系 */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="prv2-page">
      <ConversationListSidebar
        items={items}
        loading={loadingList}
        selectedId={selectedId}
        onSelect={onSelect}
        onNew={onNew}
        onDelete={onDelete}
      />

      <main className="prv2-main">
        {!selectedId && (
          <UploadView
            onUpload={onUpload}
            uploading={uploading}
            error={uploadErr}
            trialStatus={trial}
          />
        )}

        {selectedId && conversation && (
          <ReviewWorkspace
            key={conversation.id}
            conversation={conversation}
            onChanged={onWorkspaceChanged}
          />
        )}

        {selectedId && !conversation && (
          <div className="prv2-loading">加载会话…</div>
        )}
      </main>
    </div>
  );
};

export default PeerReviewV2Page;
