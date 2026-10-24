import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyJulesSources, julesSessions } from "@paperclipai/db";
import { createHash } from "node:crypto";
import { parsePullRequestUrl } from "./jules-outbox.js";

// GATE05-R WP8 - genuine provider-artifact retrieval on the correct credential boundary.
// The supervisor CLI MUST NOT hold a GitHub secret; the deployment's authorized
// GITHUB_TOKEN lives here. Retrieval is read-only through documented GitHub APIs and
// NEVER executes repository code. Retrieval success is kept SEPARATE from validation and
// acceptance: an artifact miss is a structured, recoverable code - never synthesized,
// never a placeholder, and never a reason to start a new remote session.

export interface ArtifactProvenance { companyId: string; paperclipRunId: string; agentId?: string | null; issueId?: string | null; julesSessionId?: string | null; runId?: string | null; remoteSessionId?: string | null; repository?: string; branch?: string | null; pullRequestUrl?: string | null; headSha?: string | null; baseSha?: string | null; paths?: string[]; bodies?: Record<string, string>; binaryOrSymlink?: boolean; prMetadataVerified?: boolean; }
export interface ProviderArtifactResult { artifactRetrieved: boolean; code: string; status?: number; contentHash?: string; product?: ArtifactProvenance; }

function gitHeaders(token?: string): Record<string, string> { return { accept: "application/vnd.github+json", "user-agent": "paperclip-supervisor-artifact-reader", ...(token ? { authorization: "Bearer " + token } : {}) }; }

export function providerArtifactReaderService(db: Db, options: { githubToken?: string; fetchImpl?: typeof fetch; apiBaseUrl?: string } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.githubToken ?? process.env.GITHUB_TOKEN;
  const base = options.apiBaseUrl ?? "https://api.github.com";

  async function gh(url: string): Promise<{ ok: boolean; status: number; json?: any }> {
    try { const response = await fetchImpl(url, { headers: gitHeaders(token) }); if (!response.ok) return { ok: false, status: response.status }; return { ok: true, status: response.status, json: await response.json() }; }
    catch { return { ok: false, status: 0 }; }
  }

  async function readForRun(input: { companyId: string; paperclipRunId: string }): Promise<ProviderArtifactResult> {
    const session = (await db.select().from(julesSessions).where(and(eq(julesSessions.companyId, input.companyId), eq(julesSessions.paperclipRunId, input.paperclipRunId))).limit(1).then((rows) => rows[0] ?? null));
    if (!session) return { artifactRetrieved: false, code: "NO_JULES_SESSION", product: { companyId: input.companyId, paperclipRunId: input.paperclipRunId } };
    const source = (await db.select().from(companyJulesSources).where(eq(companyJulesSources.id, session.companySourceId)).limit(1).then((rows) => rows[0] ?? null));
    const prov: ArtifactProvenance = { companyId: session.companyId, paperclipRunId: session.paperclipRunId, agentId: session.agentId, issueId: session.issueId, julesSessionId: session.julesSessionId, runId: session.paperclipRunId, remoteSessionId: session.julesSessionId, repository: source?.repository ?? "", branch: source?.startingBranch ?? null, pullRequestUrl: session.pullRequestUrl ?? null };
    if (!source || source.companyId !== session.companyId) return { artifactRetrieved: false, code: "SOURCE_BINDING_MISMATCH", product: prov };
    const repository = source.repository; const startingBranch = source.startingBranch;
    if (!token) return { artifactRetrieved: false, code: "GITHUB_TOKEN_MISSING", product: prov };
    let head: string | null = null; let prMetadataVerified = false;
    const parsed = parsePullRequestUrl(session.pullRequestUrl);
    if (parsed) {
      const pr = await gh(base + "/repos/" + parsed.repo + "/pulls/" + parsed.number);
      if (!pr.ok) return { artifactRetrieved: false, code: "GITHUB_READ_REJECTED", status: pr.status, product: prov };
      head = pr.json?.head?.sha ?? null;
      if (String(pr.json?.base?.repo?.full_name ?? "").toLowerCase() !== repository.toLowerCase()) return { artifactRetrieved: false, code: "REPOSITORY_MISMATCH", product: prov };
      prMetadataVerified = Boolean(head);
    } else {
      const commit = await gh(base + "/repos/" + repository + "/commits/" + encodeURIComponent(startingBranch));
      if (!commit.ok) return { artifactRetrieved: false, code: "GITHUB_READ_REJECTED", status: commit.status, product: prov };
      head = commit.json?.sha ?? null;
    }
    if (!head) return { artifactRetrieved: false, code: "HEAD_UNRESOLVED", product: prov };
    const cmp = await gh(base + "/repos/" + repository + "/compare/" + encodeURIComponent(startingBranch) + "..." + head);
    if (!cmp.ok) return { artifactRetrieved: false, code: "GITHUB_READ_REJECTED", status: cmp.status, product: prov };
    const files = (cmp.json?.files ?? []) as Array<Record<string, any>>;
    const paths = files.map((f) => f.filename).filter((x): x is string => typeof x === "string");
    const bodies: Record<string, string> = {}; let binaryOrSymlink = false;
    for (const file of files) {
      if (file.type && file.type !== "file") { binaryOrSymlink = true; continue; }
      if (Number(file.size ?? 0) > 200000) { binaryOrSymlink = true; continue; }
      const contents = await gh(base + "/repos/" + repository + "/contents/" + encodeURIComponent(String(file.filename)) + "?ref=" + head);
      if (contents.ok && typeof contents.json?.content === "string") { try { bodies[String(file.filename)] = Buffer.from(contents.json.content, "base64").toString("utf8"); } catch { binaryOrSymlink = true; } }
    }
    const contentHash = "sha256:" + createHash("sha256").update(Object.keys(bodies).sort().map((k) => k + "\u0000" + bodies[k]).join("\n---\n")).digest("hex");
    const product: ArtifactProvenance = { ...prov, repository, branch: parsed ? cmp.json?.base?.ref ?? null : startingBranch, headSha: head, baseSha: cmp.json?.merge_base_commit?.sha ?? null, paths, bodies, binaryOrSymlink, prMetadataVerified };
    return { artifactRetrieved: paths.length > 0, code: paths.length > 0 ? "ARTIFACT_RETRIEVED" : "NO_CHANGED_FILES", contentHash, product };
  }

  return { readForRun };
}
