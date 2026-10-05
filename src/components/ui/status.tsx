import type { DisputeStatus, KycStatus, PayoutStatus, Role, TaskStatus, TxnType } from "@/api/types";
import { tMaybe } from "@/i18n";
import { humanize } from "@/lib/format";

import { Badge, type Tone } from "./primitives";

const taskTone: Record<TaskStatus, Tone> = {
  posted: "blue",
  accepted: "violet",
  navigating: "violet",
  arrived: "violet",
  inProgress: "amber",
  proofUploaded: "cyan",
  submitted: "cyan",
  paid: "green",
  cancelled: "neutral",
  disputed: "red",
};

/** Status / role label current bhashet (navin unknown value asel tar humanize). */
export const taskLabel = (s: string) => tMaybe(`status.task.${s}`, humanize(s));
export const kycLabel = (s: string) => tMaybe(`status.kyc.${s}`, humanize(s));
export const roleLabel = (s: string) => tMaybe(`role.${s}`, humanize(s));
export const disputeLabel = (s: string) => tMaybe(`status.dispute.${s}`, humanize(s));
export const payoutLabel = (s: string) => tMaybe(`status.payout.${s}`, humanize(s));
export const txnLabel = (s: string) => tMaybe(`txn.${s}`, humanize(s));

export const TaskBadge = ({ status }: { status: TaskStatus }) => (
  <Badge tone={taskTone[status] ?? "neutral"} dot>
    {taskLabel(status)}
  </Badge>
);

const kycTone: Record<KycStatus, Tone> = {
  notSubmitted: "neutral",
  pending: "amber",
  verified: "green",
  rejected: "red",
};

export const KycBadge = ({ status }: { status: KycStatus }) => (
  <Badge tone={kycTone[status] ?? "neutral"}>{kycLabel(status)}</Badge>
);

const roleTone: Record<Role, Tone> = {
  customer: "blue",
  worker: "violet",
  business: "cyan",
  admin: "accent",
};

export const RoleBadge = ({ role }: { role: Role }) => <Badge tone={roleTone[role] ?? "neutral"}>{roleLabel(role)}</Badge>;

const disputeTone: Record<DisputeStatus, Tone> = {
  open: "red",
  underReview: "amber",
  resolvedCustomer: "green",
  resolvedWorker: "green",
  closed: "neutral",
};

export const DisputeBadge = ({ status }: { status: DisputeStatus }) => (
  <Badge tone={disputeTone[status] ?? "neutral"} dot>
    {disputeLabel(status)}
  </Badge>
);

const payoutTone: Record<PayoutStatus, Tone> = { requested: "amber", paid: "green", failed: "red" };

export const PayoutBadge = ({ status }: { status: PayoutStatus }) => (
  <Badge tone={payoutTone[status] ?? "neutral"} dot>
    {payoutLabel(status)}
  </Badge>
);

export const TXN_META: Record<TxnType, { tone: Tone; credit: boolean }> = {
  topUp: { tone: "green", credit: true },
  escrowHold: { tone: "amber", credit: false },
  escrowRelease: { tone: "violet", credit: true },
  platformFee: { tone: "accent", credit: false },
  refund: { tone: "blue", credit: true },
  payout: { tone: "cyan", credit: false },
};

export const TxnBadge = ({ type }: { type: TxnType }) => (
  <Badge tone={TXN_META[type]?.tone ?? "neutral"}>{txnLabel(type)}</Badge>
);
