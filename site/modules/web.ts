// What the site's modules add to the web pages (site/modules/index.ts).
import { defineWebModule, type WebModule } from "@aihot/web/modules";
import { IconTimeline } from "@aihot/web/components/icons";

export const WEB_MODULES: readonly WebModule[] = [
  defineWebModule({
    name: "history",
    // 侧栏放在「内容」里，排列由引擎决定（追加在最后）。
    sidebar: { section: "内容", items: [{ to: "/history", label: "大事记", icon: IconTimeline }] },
  }),
];
