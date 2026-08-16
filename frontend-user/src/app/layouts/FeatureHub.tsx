import { Link } from 'react-router-dom';
import { Database } from 'lucide-react';
import { MENUS } from '@/app/menus';
import {
  getFeatureSubs,
  LIBRARY_SUB_TONE,
  type FeatureRecord,
} from '@/app/layouts/app-sidebar-records';
import { CenteredLanding } from '@/shared/components/CenteredLanding';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { cn } from '@/shared/lib/utils';

/**
 * 一级功能落地 —— 每个二级入口一张统一尺寸的占位卡,只标注入口名称。
 * 我的资源例外:四张卡横排,带四色数据库图标。
 */
export function FeatureHub({ featureId }: { featureId: string }) {
  const menu = MENUS.find((m) => m.id === featureId);
  const cards = getFeatureSubs(featureId);
  if (!menu) return null;
  const isLibrary = featureId === 'library';

  return (
    <>
      <RouteSEO
        title={`${menu.label} — Scholay`}
        description={menu.description}
        canonical={menu.href}
      />
      <CenteredLanding
        contentClassName={isLibrary ? 'w-full max-w-4xl' : 'w-full max-w-5xl'}
      >
        <div
          className={cn(
            'grid w-full gap-4',
            isLibrary ? 'grid-cols-4' : 'grid-cols-1 sm:grid-cols-2',
          )}
        >
          {cards.map((item) => (
            <HubEntryCard
              key={item.id}
              item={item}
              variant={isLibrary ? 'library' : 'default'}
            />
          ))}
        </div>
      </CenteredLanding>
    </>
  );
}

const CARD_CLASS =
  'flex h-36 w-full flex-col items-center justify-center gap-2 rounded-16 border border-border bg-surface-card px-6 text-center';

function HubEntryCard({
  item,
  variant = 'default',
}: {
  item: FeatureRecord;
  variant?: 'default' | 'library';
}) {
  const tone = LIBRARY_SUB_TONE[item.id] ?? 'text-foreground';
  const body = (
    <>
      {variant === 'library' ? (
        <Database className={cn('size-8', tone)} strokeWidth={1.75} />
      ) : null}
      <span className="text-16 font-medium text-foreground">{item.label}</span>
      {item.comingSoon ? (
        <span className="text-12 text-faint">敬请期待</span>
      ) : null}
    </>
  );

  if (item.comingSoon) {
    return (
      <div className={cn(CARD_CLASS, 'opacity-70')} aria-disabled>
        {body}
      </div>
    );
  }

  return (
    <Link
      to={item.href}
      className={cn(
        CARD_CLASS,
        'transition-colors hover:border-border-strong hover:bg-surface-1',
      )}
    >
      {body}
    </Link>
  );
}
