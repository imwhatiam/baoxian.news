import { defineModule } from "@aihot/contracts/modules";

/** 中国保险业大事记：一页按时间倒序排的行业年表，来源在每条下面。 */
export default defineModule({
  name: "history",
  pages: [{ path: "history", file: "web/Page.tsx" }],
});
