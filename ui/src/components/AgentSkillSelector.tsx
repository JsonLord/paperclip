import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { companySkillsApi } from "../api/companySkills";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Search, Package } from "lucide-react";

interface AgentSkillSelectorProps {
  companyId: string;
  selectedSkills: string[];
  onSave: (skills: string[]) => void;
  saving?: boolean;
}

export function AgentSkillSelector({
  companyId,
  selectedSkills,
  onSave,
  saving = false,
}: AgentSkillSelectorProps) {
  const [search, setSearch] = useState("");
  const [localSelection, setLocalSelection] = useState<string[]>(selectedSkills);

  const skillsQuery = useQuery({
    queryKey: queryKeys.companySkills.list(companyId),
    queryFn: () => companySkillsApi.list(companyId),
  });

  const skills = skillsQuery.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)),
    );
  }, [skills, search]);

  function toggleSkill(skillName: string) {
    setLocalSelection((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName],
    );
  }

  const hasChanges =
    localSelection.length !== selectedSkills.length ||
    !localSelection.every((s) => selectedSkills.includes(s));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {localSelection.length} skill{localSelection.length !== 1 ? "s" : ""} selected
        </p>
        <Button
          size="sm"
          onClick={() => onSave(localSelection)}
          disabled={!hasChanges || saving}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills..."
          className="pl-8 h-9 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Package className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">
            {skills.length === 0
              ? "No skills available. Add skills in company settings."
              : "No skills match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {filtered.map((skill) => {
            const isSelected = localSelection.includes(skill.name);
            return (
              <Card
                key={skill.id ?? skill.name}
                className={`p-3 cursor-pointer transition-colors hover:bg-muted/30 ${
                  isSelected ? "border-primary/50 bg-primary/5" : ""
                }`}
                onClick={() => toggleSkill(skill.name)}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSkill(skill.name)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate">{skill.name}</h4>
                    {skill.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {skill.description}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
