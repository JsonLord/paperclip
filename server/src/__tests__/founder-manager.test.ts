import { describe, expect, it } from "vitest";
import { founderManagerService, parseResultJudgment } from "../services/founder-manager/index.js";
const verdict = (v: string) => ({ verdict:v, confidence:.8, reason:"reason", passedCriteria:[], failedCriteria:[], revisionInstructions:[], requiresHuman:false });
describe("Founder manager result judgment", () => {
 for (const v of ["ACCEPT","REVISE_SAME_SESSION","RETRY_NEW_SESSION","WAIT","ESCALATE","FAIL_OUTCOME"]) it(`accepts ${v}`,()=>expect(parseResultJudgment(verdict(v)).verdict).toBe(v));
 it("rejects malformed and unknown verdicts",()=>{ expect(()=>parseResultJudgment("not-json")).toThrow(); expect(()=>parseResultJudgment(verdict("YOLO"))).toThrow(); });
 it("cannot override hard deterministic failure", async()=>{ const service=founderManagerService({resultJudge:async()=>verdict("ACCEPT")}); await expect(service.resultJudge({validation:{hardFailure:true,failed:[],passed:[],warnings:[],evidence:[],status:"FAIL",validatedAt:"",validatedCommit:"x",validatorVersion:"v",contractHash:"h"}} as never)).rejects.toThrow(/cannot override/); });
});
