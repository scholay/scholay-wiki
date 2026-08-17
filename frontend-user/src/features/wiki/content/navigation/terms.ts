import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const termsNavCategory: WikiNavCategoryMeta = {
  slug: "terms",
  title: "使用条款",
  shortTitle: "条款",
  description: "集中查看隐私、法律、AI 使用安全和学术伦理边界。",
  children: [
    {
      id: "terms-policies",
      title: "服务政策与 AI 使用边界",
      target: primary("service-policies"),
      children: [
        {
          id: "terms-privacy",
          title: "隐私",
          target: jump("service-policies", "documents"),
        },
        {
          id: "terms-legal",
          title: "法律",
          target: jump("service-policies", "documents"),
        },
        {
          id: "terms-ai-safety",
          title: "AI 使用安全",
          target: jump("service-policies", "ai"),
        },
        {
          id: "terms-academic-ethics",
          title: "学术伦理",
          target: jump("service-policies", "ai"),
        },
      ],
    },
  ],
};
