import { Fragment, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import type {
  WikiMergedTableCell,
  WikiMergedTableColumn,
  WikiMergedTableLink,
  WikiMergedTableRow,
} from "../types";
import { WikiArticlePreviewLink } from "./WikiArticlePreviewLink";
import { WikiTableFigure } from "./WikiMedia";

interface WikiMergedTableProps {
  columns: WikiMergedTableColumn[];
  rows: WikiMergedTableRow[];
  caption: string;
}

export function WikiMergedTable({
  columns,
  rows,
  caption,
}: WikiMergedTableProps) {
  const rowSpans = columns.map((column) =>
    column.merge
      ? computeRowSpans(rows.map((row) => cellKey(row[column.key])))
      : rows.map(() => 1),
  );

  return (
    <WikiTableFigure caption={caption}>
      <table className="wiki-three-line text-12">
        <thead>
          <tr>
            {columns.map((column) => {
              const isGoColumn = column.key === "links";
              return (
                <th
                  key={column.key}
                  className={cn(isGoColumn && "w-16 px-2 text-center")}
                >
                  {isGoColumn ? (
                    <span className="sr-only">前往</span>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="group/row relative">
              {columns.map((column, columnIndex) => {
                const span = rowSpans[columnIndex][rowIndex];
                if (span === 0) return null;
                const cell = row[column.key];
                const isGoColumn = column.key === "links";
                const isFirstColumn = columnIndex === 0;
                return (
                  <td
                    key={column.key}
                    rowSpan={span > 1 ? span : undefined}
                    className={cn(
                      "leading-paragraph",
                      isGoColumn && "w-16 px-2 text-center",
                      isFirstColumn
                        ? "font-serif text-16 font-bold text-foreground"
                        : column.merge
                          ? "font-serif text-14 font-medium text-foreground"
                          : "text-subtle",
                    )}
                  >
                    {isGoColumn
                      ? renderGoCell(cell)
                      : column.key === "status"
                        ? renderStatusCell(cell)
                        : renderCell(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </WikiTableFigure>
  );
}

function renderStatusCell(cell: WikiMergedTableCell | undefined): ReactNode {
  if (typeof cell !== "string" || !cell) return renderCell(cell);
  const planned = cell === "规划中";
  const current = cell === "现行";
  if (!planned && !current) return cell;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-pill border px-2 text-12 font-medium",
        planned
          ? "border-brand-amber/25 bg-brand-amber-soft text-brand-amber"
          : "border-brand-green/20 bg-brand-green-soft text-brand-green",
      )}
    >
      {cell}
    </span>
  );
}

function computeRowSpans(values: string[]): number[] {
  const spans = values.map(() => 1);
  let index = 0;
  while (index < values.length) {
    let end = index + 1;
    while (end < values.length && values[end] === values[index]) end += 1;
    spans[index] = end - index;
    for (let skip = index + 1; skip < end; skip += 1) spans[skip] = 0;
    index = end;
  }
  return spans;
}

function cellKey(cell: WikiMergedTableCell | undefined): string {
  if (cell == null) return "";
  if (typeof cell === "string") return cell;
  if (Array.isArray(cell)) {
    return cell.map((item) => `${item.label}:${item.href}`).join("|");
  }
  return `${cell.label}:${cell.href}`;
}

function renderCell(cell: WikiMergedTableCell | undefined): ReactNode {
  if (cell == null || cell === "") return null;
  if (typeof cell === "string") return cell;
  if (Array.isArray(cell)) {
    return cell.map((item, index) => (
      <Fragment key={`${item.href}-${item.label}`}>
        {index > 0 && <span className="text-faint"> · </span>}
        <TableLink link={item} />
      </Fragment>
    ));
  }
  return <TableLink link={cell} />;
}

function primaryLink(
  cell: WikiMergedTableCell | undefined,
): WikiMergedTableLink | null {
  if (cell == null || cell === "") return null;
  if (typeof cell === "string") return null;
  if (Array.isArray(cell)) return cell[0] ?? null;
  return cell;
}

function renderGoCell(cell: WikiMergedTableCell | undefined): ReactNode {
  const link = primaryLink(cell);
  if (!link) return null;
  return <RowGoButton link={link} />;
}

function RowGoButton({ link }: { link: WikiMergedTableLink }) {
  const className =
    "inline-flex size-11 items-center justify-center rounded-8 text-brand-red transition-transform after:absolute after:inset-0 group-hover/row:translate-x-1 motion-reduce:transform-none";
  const icon = <ArrowRight className="size-3.5" aria-hidden />;
  const label = `前往${link.label}`;
  if (link.href.startsWith("/")) {
    return (
      <Link to={link.href} className={className} aria-label={label}>
        {icon}
      </Link>
    );
  }
  return (
    <a href={link.href} className={className} aria-label={label}>
      {icon}
    </a>
  );
}

function TableLink({ link }: { link: WikiMergedTableLink }) {
  if (link.href.startsWith("/wiki/")) {
    return (
      <WikiArticlePreviewLink href={link.href}>
        {link.label}
      </WikiArticlePreviewLink>
    );
  }
  if (link.href.startsWith("/")) {
    return (
      <Link
        to={link.href}
        className="text-brand-red underline underline-offset-4"
      >
        {link.label}
      </Link>
    );
  }
  return (
    <a href={link.href} className="text-brand-red underline underline-offset-4">
      {link.label}
    </a>
  );
}
