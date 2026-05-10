/**
 * PnLTable — sticky-header P&L grid for FinancialProjectionRow[].
 *
 * Year columns. Rows: Revenue, COGS, Gross Profit, OpEx, EBITDA, Headcount, Cash.
 * Color-coded: positive EBITDA → success-300; negative → danger-300.
 * Export-to-CSV button packages the same data as a download.
 */
import { useCallback } from "react";
import { Download } from "lucide-react";
import type { FinancialProjectionRow } from "../../types/agents";
import { formatCurrency } from "../DataPoint";
import { cn } from "../../lib/cn";

export interface PnLTableProps {
  rows: FinancialProjectionRow[];
  filename?: string;
  className?: string;
}

interface RowSpec {
  key: keyof FinancialProjectionRow;
  label: string;
  emphasis?: boolean;
  format?: (v: number) => string;
  /** Color positive/negative differently. */
  signed?: boolean;
}

const ROW_SPECS: RowSpec[] = [
  { key: "revenue_usd", label: "Revenue", emphasis: true, format: formatCurrency },
  { key: "cogs_usd", label: "COGS", format: (v) => `(${formatCurrency(v)})` },
  { key: "gross_profit_usd", label: "Gross profit", format: formatCurrency },
  { key: "opex_usd", label: "OpEx", format: (v) => `(${formatCurrency(v)})` },
  { key: "ebitda_usd", label: "EBITDA", emphasis: true, format: formatCurrency, signed: true },
  { key: "headcount", label: "Headcount", format: (v) => `${Math.round(v)}` },
  { key: "cash_usd", label: "Cash", format: formatCurrency, signed: true },
];

export function PnLTable({ rows, filename = "pl.csv", className }: PnLTableProps): JSX.Element {
  const handleExport = useCallback(() => {
    const header = ["Line", ...rows.map((r) => `Year ${r.year}`)];
    const lines: string[] = [header.join(",")];
    for (const spec of ROW_SPECS) {
      const cells = [
        spec.label,
        ...rows.map((r) => String(r[spec.key])),
      ];
      lines.push(cells.map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [rows, filename]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6 text-center text-sm text-ink-500">
        No projection rows yet — model is still computing.
      </div>
    );
  }

  return (
    <section
      aria-label="P&L table"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-ink-800 bg-ink-900/40 p-4",
        className,
      )}
    >
      <header className="grid grid-cols-[1fr_auto] items-baseline gap-2">
        <div>
          <h2 className="font-display text-sm font-medium text-ink-100">P&amp;L</h2>
          <p className="text-[11px] uppercase tracking-widest text-ink-500">
            Years {rows[0]?.year ?? 1}–{rows[rows.length - 1]?.year ?? 1}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="grid grid-cols-[auto_1fr] items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1.5 text-[12px] text-ink-200 hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Download size={12} aria-hidden="true" />
          Export CSV
        </button>
      </header>
      <div className="overflow-x-auto rounded-xl border border-ink-800 bg-ink-950">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="sticky top-0 z-[1] bg-ink-950">
              <th
                scope="col"
                className="border-b border-ink-800 px-3 py-2 text-left font-medium uppercase tracking-widest text-ink-500"
              >
                Line
              </th>
              {rows.map((r) => (
                <th
                  key={r.year}
                  scope="col"
                  className="border-b border-l border-ink-800 px-3 py-2 text-right font-medium uppercase tracking-widest text-ink-500"
                >
                  Year {r.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROW_SPECS.map((spec) => (
              <tr
                key={spec.key as string}
                className={cn(
                  "transition-colors hover:bg-ink-900/40",
                  spec.emphasis && "bg-ink-900/20",
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    "px-3 py-2 text-left font-medium",
                    spec.emphasis ? "text-ink-50" : "text-ink-300",
                  )}
                >
                  {spec.label}
                </th>
                {rows.map((r) => {
                  const raw = r[spec.key] as number;
                  const formatted =
                    spec.format?.(raw) ??
                    (typeof raw === "number" ? raw.toLocaleString() : String(raw));
                  return (
                    <td
                      key={`${spec.key as string}-${r.year}`}
                      className={cn(
                        "border-l border-ink-900 px-3 py-2 text-right font-mono tabular-nums",
                        spec.emphasis ? "text-ink-50" : "text-ink-200",
                        spec.signed && (raw >= 0 ? "text-emerald-300" : "text-rose-300"),
                      )}
                    >
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
