import React, { useRef, useState } from "react";
import { departmentLabel, departmentNameFromInput, type TeamDepartment } from "../../../../src/team/default-departments.js";
import type { TeamLanguage } from "../../../../src/team/default-localization.js";

export function DepartmentNameInput({ department, language, onSave }: {
  department: TeamDepartment;
  language: TeamLanguage;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const focused = useRef({ name: department.name, language });
  return <input className="set-field-input" style={{ flex: 1, textAlign: "left" }}
    value={draft ?? departmentLabel(department, language)}
    onFocus={() => { focused.current = { name: department.name, language }; }}
    onChange={e => setDraft(e.target.value)}
    onBlur={e => {
      const original = focused.current;
      const name = departmentNameFromInput(original, e.target.value.trim(), original.language) || (language === "en" ? "Department" : "部门");
      if (name !== department.name) onSave(name);
      setDraft(null);
    }} />;
}
