/** 下段标题:居中弱化,只标当前功能,不跟选中一级抢视线。 */
export function HistorySectionStatus({ title }: { title: string }) {
  return (
    <p className="min-w-0 truncate text-center text-12 font-normal text-faint">
      {title}
    </p>
  );
}
