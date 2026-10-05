import { Badge, type Tone } from "@/components/ui/primitives";
import type { ProjectStatus, ProjectType } from "@/config/projects";
import { t, type MsgKey } from "@/i18n";

const STATUS: Record<ProjectStatus, { label: MsgKey; tone: Tone }> = {
  planning: { label: "projects.status.planning", tone: "blue" },
  rnd: { label: "projects.status.rnd", tone: "violet" },
  development: { label: "projects.status.development", tone: "cyan" },
  testing: { label: "projects.status.testing", tone: "neutral" },
  active: { label: "projects.status.active", tone: "green" },
  onHold: { label: "projects.status.onHold", tone: "amber" },
};

export const projectStatusLabel = (s: ProjectStatus) => t(STATUS[s].label);
export const projectTypeLabel = (s: ProjectType) => t(`projects.type.${s}`);

export function ProjectStatusBadge({ status }: { status?: ProjectStatus }) {
  if (!status) return null;
  return (
    <Badge tone={STATUS[status].tone} dot>
      {projectStatusLabel(status)}
    </Badge>
  );
}
