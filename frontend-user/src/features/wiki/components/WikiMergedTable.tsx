import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import type {
  WikiMergedTableCell,
  WikiMergedTableColumn,
  WikiMergedTableLink,
  WikiMergedTableRow,
} from "../types";

interface WikiMergedTableProps {
  columns: WikiMergedTableColumn[];
  rows: WikiMergedTableRow[];
}

export function WikiMergedTable({ columns, rows }: WikiMergedTableProps) {
  const rowSpans = columns.map((column) =>
    column.merge
      ? computeRowSpans(rows.map((row) => cellKey(row[column.key])))
      : rows.map(() => 1),
  );

  return (
    <div className="mt-6 overflow-x-auto rounded-12 border border-border bg-surface-card">
      <table className="w-full border-collapse text-left text-12">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="border-b border-border-hairline px-4 py-3 font-medium text-muted-foreground"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="transition-colors hover:bg-surface-card"
            >
              {columns.map((column, columnIndex) => {
                const span = rowSpans[columnIndex][rowIndex];
                if (span === 0) return null;
                const cell = row[column.key];
                return (
                  <td
                    key={column.key}
                    rowSpan={span > 1 ? span : undefined}
                    className={cn(
                      "px-4 py-3 leading-paragraph",
                      column.merge
                        ? "border-b border-r border-border-hairline align-middle font-serif text-14 font-medium text-foreground"
                        : "border-b border-border-hairline align-middle text-subtle",
                    )}
                  >
                    {column.key === "status"
                      ? renderStatusCell(cell)
                      : renderCell(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function TableLink({ link }: { link: WikiMergedTableLink }) {
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
