import { cn } from "@/lib/utils";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Horizontal funnel: bar length = share of the first step; label shows count and step conversion. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = steps[0]?.value ?? 0;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        return (
          <li key={s.label} className="group relative grid grid-cols-[104px_1fr_72px] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="h-6 rounded-r bg-muted/40">
              <span
                className="block h-full rounded-r bg-primary transition group-hover:opacity-90"
                style={{ width: `${Math.max(top ? (s.value / top) * 100 : 0, s.value ? 1.5 : 0)}%` }}
              />
            </span>
            <span className="text-right tabular-nums">
              {s.value.toLocaleString()} <span className="text-xs text-muted-foreground">{i === 0 ? "" : `${pct(s.value, top)}%`}</span>
            </span>
            {prev !== null && (
              <span role="tooltip" className="pointer-events-none absolute -top-8 left-28 z-10 hidden rounded-md border bg-popover px-2 py-1 text-xs shadow group-hover:block">
                {pct(s.value, prev)}% of “{steps[i - 1].label}” continued
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Column chart over time: baseline-anchored, rounded data ends, hover tooltip, label on the latest column. */
export function Columns({ data, unit }: { data: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="space-y-2">
      <div className="flex h-40 items-end gap-[2px] border-b border-border/70">
        {data.map((d, i) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end">
            <div
              className={cn("w-full rounded-t-[4px] bg-primary transition group-hover:opacity-90", !d.value && "bg-muted")}
              style={{ height: `${Math.max((d.value / max) * 100, d.value ? 3 : 1.5)}%` }}
            />
            {i === data.length - 1 && d.value > 0 && (
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-medium tabular-nums">{d.value}</span>
            )}
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow group-hover:block">
              {d.label}: <span className="font-medium">{d.value}</span> {unit}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full">
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right tabular-nums">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Ranked horizontal bars for a small categorical breakdown (single hue — identity comes from the label). */
export function Breakdown({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((n, i) => n + i.value, 0);
  if (!items.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {[...items].sort((a, b) => b.value - a.value).map((i) => (
        <li key={i.label} className="grid grid-cols-[90px_1fr_64px] items-center gap-3 text-sm">
          <span className="truncate capitalize text-muted-foreground">{i.label}</span>
          <span className="h-3 rounded-r bg-muted/40">
            <span className="block h-full rounded-r bg-primary" style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">{i.value} <span className="text-xs text-muted-foreground">{pct(i.value, total)}%</span></span>
        </li>
      ))}
    </ul>
  );
}
