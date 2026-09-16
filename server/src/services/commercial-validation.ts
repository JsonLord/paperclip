import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  activityLog, approvals, artifactStaleness, commercialCommitments, issues, marketWaits,
  salesInteractions, salesProspects, salesQuotes,
} from "@paperclipai/db";
import { founderosContentService, type GoalTemplate, type SystemDefinition } from "./founderos-content/index.js";

export const PROSPECT_QUALIFICATIONS = ["UNRESOLVED", "ICP_MATCH", "PARTIAL_MATCH", "NOT_ICP", "QUALIFIED", "DISQUALIFIED", "OUTREACH_READY"] as const;
export const OPPORTUNITY_STAGES = ["PROSPECT", "CONTACTED", "ENGAGED", "QUALIFIED", "DISCOVERY", "OFFERED", "NEGOTIATING", "COMMITTED", "WON", "LOST", "DORMANT"] as const;
export const COMMERCIAL_DECISIONS = ["PROCEED_TO_DELIVERY_VALIDATION", "ITERATE_OFFER", "ITERATE_PRICE", "REFINE_ICP", "REFINE_SALES_PROCESS", "GATHER_MORE_PROSPECTS", "GATHER_MORE_COMMITMENT", "PIVOT_OFFER", "KILL_COMMERCIAL_HYPOTHESIS"] as const;
export const COMMITMENT_STRENGTH: Record<string, number> = {
  OUTREACH_OPENED: 1, REPLY: 2, QUALIFIED_CONVERSATION: 3, PROBLEM_CONFIRMED: 4,
  SAMPLE_REQUEST: 5, PILOT_DISCUSSION: 6, QUOTE_REQUEST: 7, TERMS_NEGOTIATED: 8,
  LOI: 9, DEPOSIT: 10, PAID_PILOT: 11, PAYMENT: 12,
};
export const GOVERNED_SALES_ACTIONS = ["SEND_OUTREACH", "POST_COMMUNITY", "BOOK_EXTERNAL_MEETING", "SEND_QUOTE", "SEND_LOI", "CREATE_PAYMENT_LINK", "COLLECT_PAYMENT", "UPDATE_CRM_CONSEQUENTIAL"] as const;

export const prospectingSystem: SystemDefinition = {
  id: "prospecting", version: "1.0.0", title: "Prospecting & Commercial Validation",
  purpose: "Turn the validated ICP into a source-provenanced, deduplicated prospect universe and test meaningful commercial commitment to the current offer.",
  stateDependencies: ["validated demand", "validated offer", "refined ICP"],
  goals: ["build-prospect-universe", "validate-commercial-commitment"],
  expectedOutputs: ["sales/**", "business-case/PRICING_EVIDENCE.md", "firm/**"],
  wakeConditions: ["reply_received", "meeting_completed", "quote_requested", "quote_accepted", "loi_received", "deposit_received", "payment_received", "followup_due", "operator_resumed"],
  evidenceFeedbackLoop: ["ICP -> sourced prospects -> governed outreach -> real interaction -> verified commitment -> delivery decision"],
  stopConditions: ["commercial decision", "opt-out", "budget stop", "compliance stop"],
};
const common = { system: "prospecting", requiredCapabilities: ["firm"], externalActionPolicy: "APPROVAL_REQUIRED", wakeConditions: prospectingSystem.wakeConditions, firm: { required: true, buildBefore: true, buildAfter: true } };
export const buildProspectUniverseTemplate: GoalTemplate = {
  ...common, id: "build-prospect-universe", version: "1.0.0", title: "Build Prospect Universe", recommendedOwnerRole: "prospect",
  objective: "Build a real, source-provenanced, deduplicated and qualified universe of accounts and contacts matching the current ICP.",
  requiredSkills: ["waterfall-prospect-sourcing", "waterfall-contact-enrichment", "bpw-evidence-and-source-discipline"],
  supportPacks: [{ id: "core.evidence-discipline", version: "1.0.0", required: true }, { id: "sales.prospecting-core", version: "1.0.0", required: true }],
  inputPaths: ["business-case/ICP.md", "business-case/SEGMENT_MAP.md", "business-case/MARKET_ANALYSIS.md", "business-case/OFFER.md", "business-case/VALUE_PROPOSITION.md", "evidence/**", "firm/**"],
  outputPaths: ["sales/PROSPECT_UNIVERSE.*", "sales/ICP_QUALIFICATION_RULES.yaml", "sales/PROSPECTING_REPORT.md", "firm/**"],
  acceptanceCriteria: ["Each meaningful field retains source and retrieval date", "Prospects are deterministically deduplicated", "Unknown and conflicting criteria remain explicit", "No invented contacts or contact details"],
  cannotCompleteIf: ["Fabricated identity or contact detail", "Prospect lacks source provenance", "Opted-out prospect is outreach-ready"],
  writeScope: ["sales/**", "firm/**"], nextGoalHints: ["validate-commercial-commitment"], prerequisites: ["validate-demand accepted"], evidenceRequirements: ["ICP evidence IDs", "prospect source IDs"],
};
export const validateCommercialCommitmentTemplate: GoalTemplate = {
  ...common, id: "validate-commercial-commitment", version: "1.0.0", title: "Validate Commercial Commitment", recommendedOwnerRole: "sales",
  objective: "Determine whether real qualified prospects make meaningful commitments to the current offer under explicit commercial terms.",
  requiredSkills: ["market-validation-sales", "sales-second-brain", "diagnostic-community-outreach", "watering-hole-discovery", "customer-discovery-methods", "sample-first-offer-validation", "goal-contract-execution", "bpw-evidence-and-source-discipline", "value-proposition-design"],
  supportPacks: [{ id: "core.evidence-discipline", version: "1.0.0", required: true }, { id: "sales.commercial-validation-core", version: "1.0.0", required: true }],
  inputPaths: ["business-case/OFFER.md", "business-case/ICP.md", "experiments/DEMAND_REPORT.md", "sales/**", "evidence/**", "firm/**"],
  outputPaths: ["sales/COMMERCIAL_VALIDATION_REPORT.md", "sales/COMMITMENT_LEDGER.md", "sales/OBJECTION_LIBRARY.md", "business-case/PRICING_EVIDENCE.md", "firm/**"],
  acceptanceCriteria: ["A real qualified prospect and source-provenanced interaction exist", "Commitment strength is not inferred from sentiment", "Quote, LOI and payment claims retain artifacts or verified events", "Firm builds before and after"],
  cannotCompleteIf: ["Synthetic interaction counted", "Draft quote counted as commitment", "Unverified payment claim", "Unapproved consequential action"],
  writeScope: ["sales/**", "business-case/PRICING_EVIDENCE.md", "firm/**"], nextGoalHints: ["observe-product-usage", "validate-value-realization", "validate-retention"], prerequisites: ["validate-demand accepted", "build-prospect-universe active"], evidenceRequirements: ["qualified prospect ID", "sales interaction source ID", "commercial event provenance"],
};

export interface ProspectInput { prospectId: string; accountName: string; canonicalDomain?: string; registryId?: string; canonicalUrl?: string; contactRef?: string; qualification: typeof PROSPECT_QUALIFICATIONS[number]; qualificationRationale: Array<{criterion: string; status: "MATCH"|"NO_MATCH"|"UNKNOWN"|"CONFLICT"; evidenceIds: string[]}>; fieldProvenance: Array<{field: string; value: string; source: string; retrievedAt: string; lastVerifiedAt?: string; confidence: string}>; suppressed?: boolean; suppressionReason?: string }
export function validateProspect(input: ProspectInput) {
  const failures: string[] = [];
  if (!input.accountName.trim()) failures.push("Account identity is required");
  if (![input.canonicalDomain, input.registryId, input.canonicalUrl, input.contactRef].some(Boolean)) failures.push("A deterministic account/contact identity is required");
  for (const field of ["accountName", "canonicalDomain", "registryId", "canonicalUrl", "contactRef"].filter(k => input[k as keyof ProspectInput])) if (!input.fieldProvenance.some(p => p.field === field && p.source && p.retrievedAt)) failures.push(`Missing source provenance for ${field}`);
  if (input.contactRef && /^(guessed|generated|unknown):/i.test(input.contactRef)) failures.push("Invented contact details are forbidden");
  if (input.suppressed && input.qualification === "OUTREACH_READY") failures.push("Suppressed prospect cannot be outreach-ready");
  return { pass: failures.length === 0, failures };
}
export function prospectIdentity(input: {canonicalDomain?:string|null;registryId?:string|null;canonicalUrl?:string|null;contactRef?:string|null;prospectId:string}) { return (input.registryId || input.canonicalDomain?.toLowerCase().replace(/^www\./, "") || input.canonicalUrl?.toLowerCase() || input.contactRef?.toLowerCase() || input.prospectId); }
export interface CommercialSignal { kind: keyof typeof COMMITMENT_STRENGTH; synthetic?: boolean; sourceRef: string; bindingStatus?: "BINDING"|"NON_BINDING"|"CONDITIONAL"|"REVOCABLE"; verifiedSystemEventId?: string; quoteStatus?: string; qualifiedProspect?: boolean }
export function assessCommercialEvidence(signals: CommercialSignal[], minimumStrength = COMMITMENT_STRENGTH.QUOTE_REQUEST) {
  const real = signals.filter(s => !s.synthetic && s.sourceRef && s.qualifiedProspect !== false);
  const valid = real.filter(s => !(s.kind === "QUOTE_REQUEST" && s.quoteStatus && ["DRAFT", "SENT", "VIEWED"].includes(s.quoteStatus))).filter(s => !["DEPOSIT", "PAID_PILOT", "PAYMENT"].includes(s.kind) || Boolean(s.verifiedSystemEventId));
  const strongest = valid.reduce((max, signal) => COMMITMENT_STRENGTH[signal.kind] > (max?.strength ?? 0) ? { kind: signal.kind, strength: COMMITMENT_STRENGTH[signal.kind] } : max, null as null|{kind:string;strength:number});
  const failures: string[] = [];
  if (!real.length) failures.push("No real qualified sales interaction");
  if (!strongest || strongest.strength < minimumStrength) failures.push("Meaningful commercial commitment threshold not reached");
  if (real.some(s => ["DEPOSIT", "PAID_PILOT", "PAYMENT"].includes(s.kind) && !s.verifiedSystemEventId)) failures.push("Payment-related evidence lacks a verified system event");
  return { pass: failures.length === 0, hardFailure: failures.some(f => f.includes("verified")), strongest, failures, realSignalCount: real.length };
}
export function compileSalesViews(input: {prospects: ProspectInput[]; interactions: Array<{interactionId:string; prospectId:string; channel:string; sourceRef:string; occurredAt:string; objection?:string; nextAction?:string}>; signals: CommercialSignal[]}) {
  const line = (s:string) => s || "UNKNOWN";
  return {
    "sales/PROSPECT_UNIVERSE.md": ["# Prospect Universe", ...input.prospects.map(p => `- ${p.prospectId}: ${p.accountName} — ${p.qualification} — sources: ${[...new Set(p.fieldProvenance.map(x=>x.source))].join(", ")}`)].join("\n"),
    "sales/INTERACTION_INDEX.md": ["# Interaction Index", ...input.interactions.map(i => `- ${i.interactionId}: ${i.prospectId}; ${i.channel}; ${i.occurredAt}; source ${i.sourceRef}`)].join("\n"),
    "sales/OBJECTION_LIBRARY.md": ["# Objection Library", ...input.interactions.filter(i=>i.objection).map(i=>`- ${line(i.objection!)} — source ${i.sourceRef}`)].join("\n"),
    "sales/COMMITMENT_LEDGER.md": ["# Commitment Ledger", ...input.signals.map(s=>`- ${s.kind} (${s.bindingStatus ?? "UNKNOWN"}) — source ${s.sourceRef}`)].join("\n"),
    "sales/NEXT_ACTIONS.md": ["# Next Actions", ...input.interactions.filter(i=>i.nextAction).map(i=>`- ${i.prospectId}: ${i.nextAction} — source ${i.sourceRef}`)].join("\n"),
    "business-case/PRICING_EVIDENCE.md": ["# Pricing Evidence", "Displayed price, reaction, quote, accepted quote, deposit, and payment are distinct. Only source-linked records are included.", ...input.signals.filter(s=>["QUOTE_REQUEST","TERMS_NEGOTIATED","DEPOSIT","PAID_PILOT","PAYMENT"].includes(s.kind)).map(s=>`- ${s.kind} — source ${s.sourceRef}`)].join("\n"),
  };
}

export function commercialValidationService(db: Db, hooks: { firmBuild?(phase:"before"|"after"):Promise<{success:boolean}>; writeFirm?(records:unknown[]):Promise<void> } = {}) {
  const content = founderosContentService(db);
  async function activity(companyId:string, action:string, entityId:string, details:Record<string,unknown>) { await db.insert(activityLog).values({companyId,actorType:"system",actorId:"commercial-validation",action,entityType:"issue",entityId,details}); }
  async function activate(input:{companyId:string;parentGoalId:string;sourceRepository:string;sourceCommit:string}) {
    const prospect = await content.instantiateGoal(input.companyId,{repository:input.sourceRepository,commit:input.sourceCommit},buildProspectUniverseTemplate,input.parentGoalId);
    const commitment = await content.instantiateGoal(input.companyId,{repository:input.sourceRepository,commit:input.sourceCommit},validateCommercialCommitmentTemplate,prospect.goal.id);
    const project = await content.activateSystem(input.companyId,{repository:input.sourceRepository,commit:input.sourceCommit},prospectingSystem,prospect.goal.id,prospect.goal.ownerAgentId!);
    const titles = ["Build prospect universe","Qualify accounts","Prepare outreach","Approve and send outreach","Run sales discovery","Prepare quote","Seek commercial commitment","Analyze commercial evidence"];
    const created=[]; for (const title of titles) { const goalId = /prospect|Qualify/.test(title) ? prospect.goal.id : commitment.goal.id; created.push((await content.createGoalIssue(input.companyId,goalId,project.project.id,goalId===prospect.goal.id?prospect.goal.ownerAgentId!:commitment.goal.ownerAgentId!,title)).issue); }
    return {prospectGoal:prospect.goal,commitmentGoal:commitment.goal,project:project.project,issues:created};
  }
  async function ingestProspect(companyId:string,input:ProspectInput) { const valid=validateProspect(input); if(!valid.pass)throw new Error(valid.failures.join("; ")); const existing=await db.select().from(salesProspects).where(and(eq(salesProspects.companyId,companyId),eq(salesProspects.prospectId,input.prospectId))).limit(1).then(r=>r[0]); if(existing)return{prospect:existing,duplicate:true}; const identity=prospectIdentity(input); const rows=await db.select().from(salesProspects).where(eq(salesProspects.companyId,companyId)); const duplicate=rows.find(p=>prospectIdentity({...p,prospectId:p.prospectId})===identity); if(duplicate)return{prospect:duplicate,duplicate:true}; const [prospect]=await db.insert(salesProspects).values({...input,companyId,suppressed:input.suppressed??false}).returning(); return{prospect,duplicate:false}; }
  async function ingestInteraction(companyId:string,prospectId:string,input:{interactionId:string;sourceType:string;sourceRef:string;occurredAt:Date;channel:string;collector:string;rawProvenance:Record<string,unknown>;synthetic?:boolean}) { const prospect=await db.select().from(salesProspects).where(and(eq(salesProspects.companyId,companyId),eq(salesProspects.prospectId,prospectId))).limit(1).then(r=>r[0]); if(!prospect)throw new Error("Prospect not found"); const existing=await db.select().from(salesInteractions).where(and(eq(salesInteractions.companyId,companyId),eq(salesInteractions.interactionId,input.interactionId))).limit(1).then(r=>r[0]); if(existing)return{interaction:existing,duplicate:true}; const [interaction]=await db.insert(salesInteractions).values({...input,companyId,prospectDbId:prospect.id,synthetic:input.synthetic??false}).returning(); return{interaction,duplicate:false}; }
  async function recordCommitment(companyId:string,input:{commitmentId:string;interactionId?:string;kind:keyof typeof COMMITMENT_STRENGTH;bindingStatus:string;paidStatus:string;amountMinor?:number;currency?:string;sourceRef:string;verifiedSystemEventId?:string;conditions?:string[]}) { const interaction=input.interactionId?await db.select().from(salesInteractions).where(and(eq(salesInteractions.companyId,companyId),eq(salesInteractions.interactionId,input.interactionId))).limit(1).then(r=>r[0]):undefined; if(input.interactionId&&!interaction)throw new Error("Source interaction not found"); if(["DEPOSIT","PAID_PILOT","PAYMENT"].includes(input.kind)&&!input.verifiedSystemEventId)throw new Error("Payment commitment requires verified system-of-record event"); const [row]=await db.insert(commercialCommitments).values({...input,companyId,interactionDbId:interaction?.id,strength:COMMITMENT_STRENGTH[input.kind],conditions:input.conditions??[]}).onConflictDoNothing().returning(); return row; }
  async function requireApproval(companyId:string,action:string,approvalId:string) { if(!GOVERNED_SALES_ACTIONS.includes(action as any))return; const approval=await db.select().from(approvals).where(and(eq(approvals.companyId,companyId),eq(approvals.id,approvalId))).limit(1).then(r=>r[0]); if(approval?.status!=="approved")throw new Error(`Native approval required for ${action}`); }
  async function wait(companyId:string,issueId:string,reason:string) { const issue=await db.select().from(issues).where(and(eq(issues.companyId,companyId),eq(issues.id,issueId))).limit(1).then(r=>r[0]); if(!issue?.goalId||!issue.projectId)throw new Error("Bound native Issue required"); const [row]=await db.insert(marketWaits).values({companyId,goalId:issue.goalId,projectId:issue.projectId,issueId,stage:"COMMERCIAL_RESPONSE",reason,wakeConditions:prospectingSystem.wakeConditions.map(type=>({type})),status:"WAITING_FOR_MARKET"}).onConflictDoNothing().returning(); await db.update(issues).set({status:"blocked",updatedAt:new Date()}).where(eq(issues.id,issueId)); await activity(companyId,"commercial.waiting_for_market",issueId,{reason,julesPolling:false,wakeConditions:prospectingSystem.wakeConditions}); return row; }
  async function analyze(companyId:string,issueId:string,signals:CommercialSignal[],minimumStrength?:number) { const result=assessCommercialEvidence(signals,minimumStrength); if(!result.pass)return{result,decision:"GATHER_MORE_COMMITMENT" as const}; if(hooks.firmBuild&&!((await hooks.firmBuild("before")).success))throw new Error("Firm build before sales update failed"); await hooks.writeFirm?.(signals.map((s,i)=>({type:"commitment",id:`commitment-${i}`,kind:s.kind,sourceRef:s.sourceRef,bindingStatus:s.bindingStatus}))); if(hooks.firmBuild&&!((await hooks.firmBuild("after")).success))throw new Error("Firm build after sales update failed"); for(const artifact of ["BUSINESS_MODEL_CANVAS","financial-model","GTM","business-plan","pitch","content-strategy","kickstarter-economics"])await db.insert(artifactStaleness).values({companyId,artifact,reason:"Commercial evidence changed",evidenceId:signals.at(-1)!.sourceRef,affectedDependency:"commercial-commitment"}).onConflictDoNothing(); await activity(companyId,"commercial.evidence.analyzed",issueId,{strongest:result.strongest,realSignalCount:result.realSignalCount}); return{result,decision:null}; }
  return {activate,ingestProspect,ingestInteraction,recordCommitment,requireApproval,wait,analyze};
}
