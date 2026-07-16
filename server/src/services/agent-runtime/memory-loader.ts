import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentMemories } from "@paperclipai/db";

export function memoryLoaderService(db: Db) {
  return {
    async loadMemories(
      agentId: string,
      projectId?: string | null,
      opts?: { scope?: "global" | "project"; category?: string },
    ) {
      const conditions = [eq(agentMemories.agentId, agentId)];

      if (opts?.scope) {
        conditions.push(eq(agentMemories.scope, opts.scope));
      }

      if (opts?.category) {
        conditions.push(
          eq(
            agentMemories.category,
            opts.category as "pattern" | "preference" | "decision" | "learning" | "feedback",
          ),
        );
      }

      if (projectId) {
        conditions.push(eq(agentMemories.projectId, projectId));
      }

      // Return global + project-scoped memories
      const memories = await db
        .select()
        .from(agentMemories)
        .where(and(...conditions))
        .orderBy(desc(agentMemories.createdAt));

      // If projectId specified and no scope filter, also include global memories
      if (projectId && !opts?.scope) {
        const globalMemories = await db
          .select()
          .from(agentMemories)
          .where(
            and(eq(agentMemories.agentId, agentId), eq(agentMemories.scope, "global")),
          )
          .orderBy(desc(agentMemories.createdAt));

        // Deduplicate by id
        const seen = new Set(memories.map((m) => m.id));
        for (const m of globalMemories) {
          if (!seen.has(m.id)) {
            memories.push(m);
          }
        }
      }

      return memories;
    },

    async saveMemory(data: {
      agentId: string;
      companyId: string;
      scope: "global" | "project";
      projectId?: string | null;
      category: "pattern" | "preference" | "decision" | "learning" | "feedback";
      title: string;
      content: string;
      source: "self" | "ceo" | "board" | "human";
      confidence?: number;
    }) {
      const [memory] = await db
        .insert(agentMemories)
        .values({
          agentId: data.agentId,
          companyId: data.companyId,
          scope: data.scope,
          projectId: data.projectId ?? null,
          category: data.category,
          title: data.title,
          content: data.content,
          source: data.source,
          confidence: data.confidence ?? 0.5,
        })
        .returning();

      return memory;
    },

    async updateMemory(
      id: string,
      data: {
        title?: string;
        content?: string;
        category?: "pattern" | "preference" | "decision" | "learning" | "feedback";
        confidence?: number;
      },
    ) {
      const [updated] = await db
        .update(agentMemories)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(agentMemories.id, id))
        .returning();

      return updated;
    },

    async deleteMemory(id: string) {
      const [deleted] = await db
        .delete(agentMemories)
        .where(eq(agentMemories.id, id))
        .returning();

      return deleted;
    },

    async getMemory(id: string) {
      const [memory] = await db
        .select()
        .from(agentMemories)
        .where(eq(agentMemories.id, id))
        .limit(1);

      return memory ?? null;
    },
  };
}
