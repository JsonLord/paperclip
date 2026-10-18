import type { ValidationTask } from "@paperclipai/shared";
/** Evaluate before provider admission, secret resolution or dispatch. Negative boundaries are not requests. */
export function isEngineeringDependency(issue: {
  title: string;
  description?: string | null;
  validationTask?: ValidationTask | null;
}) {
  if (issue.validationTask?.workClass === "product_backend") return true;
  if (
    issue.validationTask?.writeScopes.some((s) =>
      /^(server|backend|database|infra|packages\/db)(\/|$)/.test(s),
    )
  )
    return true;
  return `${issue.title}\n${issue.description ?? ""}`
    .split(/[.;\n]/)
    .some((sentence) => {
      if (/^\s*(no\b|never\b|do not\b|without\b)/i.test(sentence)) return false;
      return (
        /\b(build|implement|create|develop|refactor|migrate|deploy)\b.{0,120}\b(backend|database|authentication|auth service|api|product.engineering|inference infrastructure)\b/i.test(
          sentence,
        ) ||
        /\b(production backend|database architecture|authentication backend|billing backend|inference infrastructure|production api|product.engineering refactor)\b/i.test(
          sentence,
        )
      );
    });
}
