import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companySkills, skillChangeLog } from "@paperclipai/db";

export interface SkillSnapshot {
  skillId: string;
  name: string;
  key: string;
  content: string;
}

export function skillResolverService(db: Db) {
  return {
    async resolveSkills(
      agentId: string,
      companyId: string,
      desiredSkills?: string[],
    ): Promise<SkillSnapshot[]> {
      // Get all company skills
      const allSkills = await db
        .select()
        .from(companySkills)
        .where(eq(companySkills.companyId, companyId));

      // If desiredSkills specified, filter to those
      let matched = allSkills;
      if (desiredSkills && desiredSkills.length > 0) {
        matched = allSkills.filter(
          (s) => desiredSkills.includes(s.key) || desiredSkills.includes(s.slug),
        );
      }

      return matched.map((s) => ({
        skillId: s.id,
        name: s.name,
        key: s.key,
        content: s.markdown,
      }));
    },

    async detectSkillChanges(
      beforeSnapshots: SkillSnapshot[],
      afterSnapshots: SkillSnapshot[],
      agentId: string,
      companyId: string,
      runId?: string | null,
    ) {
      const changes: Array<{
        skillId: string;
        changeNotes: string;
        previousContent: string;
        newContent: string;
      }> = [];

      const beforeMap = new Map(beforeSnapshots.map((s) => [s.skillId, s]));

      for (const after of afterSnapshots) {
        const before = beforeMap.get(after.skillId);

        if (!before) {
          // New skill appeared
          changes.push({
            skillId: after.skillId,
            changeNotes: `Skill "${after.name}" was added`,
            previousContent: "",
            newContent: after.content,
          });
          continue;
        }

        if (before.content !== after.content) {
          changes.push({
            skillId: after.skillId,
            changeNotes: `Skill "${after.name}" content was modified`,
            previousContent: before.content,
            newContent: after.content,
          });
        }
      }

      // Log changes to skill_change_log
      for (const change of changes) {
        await db.insert(skillChangeLog).values({
          companyId,
          skillId: change.skillId,
          agentId,
          changeNotes: change.changeNotes,
          previousContent: change.previousContent,
          newContent: change.newContent,
          runId: runId ?? null,
        });
      }

      return changes;
    },

    async listChangesForSkill(skillId: string) {
      return db
        .select()
        .from(skillChangeLog)
        .where(eq(skillChangeLog.skillId, skillId))
        .orderBy(desc(skillChangeLog.createdAt));
    },

    async listChangesByAgent(agentId: string) {
      return db
        .select()
        .from(skillChangeLog)
        .where(eq(skillChangeLog.agentId, agentId))
        .orderBy(desc(skillChangeLog.createdAt));
    },
  };
}
