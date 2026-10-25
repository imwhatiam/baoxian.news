import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { CHAPTERS, TIMELINE } from "../data";
import { Timeline } from "./Timeline";

export const handle: Screen = { tab: "featured", name: "中国保险行业大事记" };

const COUNT = TIMELINE.length;
const SOURCE_COUNT = TIMELINE.reduce((n, e) => n + e.sources.length, 0);
const FIRST = TIMELINE.at(-1)?.year ?? 1805;
const LAST = TIMELINE[0]?.year ?? 2026;
const TITLE = "中国保险行业大事记";

const DESCRIPTION = `中国保险业 ${FIRST}—${LAST} 年的 ${COUNT} 个节点，由近及远排列。每个节点附政策原文、监管公告、公司公告与媒体报道，来源可点开核对。`;

export function meta() {
  return pageMeta({ title: TITLE, description: DESCRIPTION, path: "/history" });
}

/** 右侧的阶段索引：七个阶段由近及远，点了跳到对应一节。 */
function ChapterIndex() {
  return (
    <nav aria-label="阶段索引" className="sticky top-6">
      <div className="pb-2 text-[11px] font-medium text-ink-4">七个阶段</div>
      <div className="-mx-2 flex flex-col">
        {[...CHAPTERS].reverse().map((chapter) => (
          <a
            key={chapter.no}
            href={`#chapter-${chapter.no}`}
            className="group flex items-baseline gap-2 rounded-control px-2 py-[5px] transition-colors duration-150 hover:bg-bg-sunk"
          >
            <span className="num w-[15px] shrink-0 text-[10.5px] text-ink-4 group-hover:text-accent">{chapter.no}</span>
            <span className="text-[12.5px] leading-snug text-ink-3 group-hover:text-ink">{chapter.name}</span>
          </a>
        ))}
      </div>
      <div className="mt-4 space-y-1 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-4">
        <div>
          <span className="num text-ink-2">{COUNT}</span> 个节点
        </div>
        <div>
          <span className="num text-ink-2">{SOURCE_COUNT}</span> 条来源
        </div>
        <div>每月更新一次</div>
        <div className="num pt-0.5">
          {FIRST}—{LAST}
        </div>
      </div>
    </nav>
  );
}

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-[1040px] pb-12">
      <PhoneBar title={TITLE} large sub={`${FIRST}—${LAST} · ${COUNT} 个节点`} />

      {/* 桌面：标题与说明 */}
      <div className="hidden lg:block">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{TITLE}</h1>
      </div>

      <div className="mt-8 grid gap-12 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_236px]">
        <div className="min-w-0">
          <Timeline entries={TIMELINE} />
        </div>
        <aside className="hidden lg:block">
          <ChapterIndex />
        </aside>
      </div>
    </div>
  );
}
