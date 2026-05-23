/**
 * ============================================================================
 * LibraryPanel —— 抽屉中段：文献集功能内容
 * ----------------------------------------------------------------------------
 * v1 范围：只有"默认收藏夹"。展示总篇数 + 按源拆分的快捷入口。
 *
 * 设计稿对应：[Sidebar] gs3tU 文件夹树，本版本暂不实现多文件夹。
 * ============================================================================
 */
import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library as LibraryIcon, BookmarkCheck } from 'lucide-react';
import { useAuth } from '../../../../utils/AuthContext';
import { useLibrary, useLibraryStore } from '../../../../stores/library.store';
import { useDrawerV2 } from '../../../../stores/drawerV2.store';
import '../DrawerPanels.css';

const SOURCE_FILTERS = [
  { key: 'all', label: '全部', route: '/library' },
  { key: 'stc', label: '精选', route: '/library?source=stc' },
  { key: 'olx', label: '全域', route: '/library?source=olx' },
];

const LibraryPanel = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { close } = useDrawerV2();
  const { totalCount, refreshTotal } = useLibrary();
  // 按源分组的本地命中计数（来自 store 的 saved cache）
  const savedMap = useLibraryStore((s) => s.saved);

  useEffect(() => {
    if (isAuthenticated) refreshTotal();
  }, [isAuthenticated, refreshTotal]);

  const perSourceCount = useMemo(() => {
    const counts = { stc: 0, olx: 0 };
    Object.entries(savedMap).forEach(([k, ok]) => {
      if (!ok) return;
      const [src] = k.split(':');
      if (src in counts) counts[src] += 1;
    });
    return counts;
  }, [savedMap]);

  const go = (path) => {
    navigate(path);
    close();
  };

  if (!isAuthenticated) {
    return (
      <div className="dp-empty">
        <div className="dp-empty-icon"><LibraryIcon size={28} strokeWidth={1.5} /></div>
        <div className="dp-empty-title">文献集</div>
        <p className="dp-empty-desc">
          登录后可把搜索结果加入"默认收藏"，按源管理。
        </p>
      </div>
    );
  }

  return (
    <div className="dp-library">
      <div className="dp-library-section">
        <div className="dp-library-section-title">收藏夹</div>
        <button
          type="button"
          className="dp-library-folder is-active"
          onClick={() => go('/library')}
        >
          <BookmarkCheck size={14} strokeWidth={2} />
          <span className="dp-library-folder-name">默认收藏</span>
          <span className="dp-library-folder-count">{totalCount ?? '…'}</span>
        </button>
      </div>

      <div className="dp-library-section">
        <div className="dp-library-section-title">按源筛选</div>
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="dp-library-sub"
            onClick={() => go(f.route)}
          >
            <span className="dp-library-sub-name">{f.label}</span>
            {f.key !== 'all' && (
              <span className="dp-library-sub-count">{perSourceCount[f.key]}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LibraryPanel;
