import { describe, expect, it } from "vitest";
import { enforceAttemptLimits } from "../services/jules-outcome-controller.js";
describe("bounded Jules correction policy", () => {
 it("permits two same-session revisions without consuming a fresh retry",()=>{ expect(enforceAttemptLimits("REVISE_SAME_SESSION",0,0)).toBe("REVISE_SAME_SESSION"); expect(enforceAttemptLimits("REVISE_SAME_SESSION",1,0)).toBe("REVISE_SAME_SESSION"); expect(enforceAttemptLimits("REVISE_SAME_SESSION",2,0)).toBe("ESCALATE"); });
 it("permits one brokered fresh retry and then escalates",()=>{ expect(enforceAttemptLimits("RETRY_NEW_SESSION",2,0)).toBe("RETRY_NEW_SESSION"); expect(enforceAttemptLimits("RETRY_NEW_SESSION",0,1)).toBe("ESCALATE"); });
 it("preserves WAIT and FAIL_OUTCOME",()=>{ expect(enforceAttemptLimits("WAIT",99,99)).toBe("WAIT"); expect(enforceAttemptLimits("FAIL_OUTCOME",99,99)).toBe("FAIL_OUTCOME"); });
});
