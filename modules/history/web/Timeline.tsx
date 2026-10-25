import { Fragment } from "react";
import { CHAPTERS, type TimelineEntry, type TimelineSource } from "../data";

/** 「新华社（新华网，载…）」只显示机构名，括号里的说明留在提示里。 */
function shortOrg(org: string): string {
  return org.split("（")[0]!.split("(")[0]!.trim();
}

function Sources({ sources }: { sources: TimelineSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] leading-none">
      <span className="text-[10.5px] tracking-[0.02em] text-ink-4">来源</span>
      {sources.map((s, i) => (
        <Fragment key={`${s.url}-${i}`}>
          {i > 0 && <span aria-hidden="true" className="text-line-strong">·</span>}
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${s.title} — ${s.org}`}
            className={`whitespace-nowrap underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline ${
              s.kind === "official" ? "text-ink-2" : "text-ink-4"
            }`}
          >
            {shortOrg(s.org)}
          </a>
        </Fragment>
      ))}
    </div>
  );
}

function Entry({ entry }: { entry: TimelineEntry }) {
  return (
    <li className="relative pb-7 pl-6 last:pb-1">
      <span aria-hidden="true" className="absolute left-0 top-[7px] size-[7px] -translate-x-1/2 rounded-full bg-accent ring-[3px] ring-bg" />
      <div className="flex items-center gap-2">
        <time className="num text-[11.5px] font-medium tracking-[0.01em] text-ink-4">{entry.label}</time>
        {entry.disputed && (
          <span
            title={entry.verify}
            aria-label="日期或数字与通行说法有出入，悬停看核实说明"
            className="size-[5px] shrink-0 rounded-full bg-amber/80"
          />
        )}
      </div>
      <h3 className="mt-1 text-[15px] font-semibold leading-[1.5] text-ink">{entry.title}</h3>
      <p className="mt-1 text-[13.5px] leading-[1.72] text-ink-3">{entry.event}</p>
      <Sources sources={entry.sources} />
    </li>
  );
}

/** 时间轴：七个阶段由近及远，阶段内按日期倒序。 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const groups = CHAPTERS.map((chapter) => ({
    ...chapter,
    items: entries.filter((e) => e.chapter === chapter.no),
  }))
    .filter((g) => g.items.length > 0)
    .reverse();

  return (
    <div className="space-y-11">
      {groups.map((group) => (
        <section key={group.no} aria-labelledby={`chapter-${group.no}`}>
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2.5">
            <span className="num text-[11px] font-semibold tracking-[0.1em] text-accent">{group.no}</span>
            <h2 id={`chapter-${group.no}`} className="text-[17px] font-semibold leading-tight text-ink">
              {group.name}
            </h2>
            <span className="num ml-auto text-[11.5px] text-ink-4">{group.span}</span>
          </header>
          <ol className="mt-4 border-l border-line-soft">
            {group.items.map((entry, i) => (
              <Entry key={`${group.no}-${i}`} entry={entry} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
