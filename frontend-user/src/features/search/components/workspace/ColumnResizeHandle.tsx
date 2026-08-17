import { PAPER_COL_WIDTH } from '../matrix/constants';

export const FILE_COL_MIN_PX = 220;
export const FILE_COL_MAX_PX = 560;
export const FILE_COL_DEFAULT_PX = PAPER_COL_WIDTH;

/** 三栏之间的竖向拖动手柄。 */
export function ColumnResizeHandle({
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={onPointerDown}
      className="relative w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-foreground/30"
    >
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

export function startColumnResize(
  e: React.PointerEvent,
  startValue: number,
  setValue: (next: number) => void,
  min: number,
  max: number,
  direction: 1 | -1 = 1,
) {
  e.preventDefault();
  const startX = e.clientX;
  const onMove = (ev: PointerEvent) => {
    const next = Math.max(
      min,
      Math.min(max, startValue + (ev.clientX - startX) * direction),
    );
    setValue(next);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
  };
  document.body.style.cursor = 'col-resize';
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}
