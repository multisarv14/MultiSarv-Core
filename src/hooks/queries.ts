import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import * as api from "@/api/admin";
import * as notif from "@/api/notifications";
import type { DisputeStatus, KycStatus, PayoutStatus, TaskStatus, TxnType, UserChanges } from "@/api/types";
import { useProject } from "@/context/project";
import { t } from "@/i18n";
import { errorMessage } from "@/lib/firebase";

/**
 * React Query wrappers. Pratyek key cha pahila part project id —
 * project switch kela tar cache vegla rahto, parat aalyavar instant.
 */
function useKey() {
  const { project } = useProject();
  return { project, k: (...parts: unknown[]) => [project.id, ...parts] };
}

export function useDashboard(days: number) {
  const { project, k } = useKey();
  return useQuery({
    queryKey: k("dashboard", days),
    queryFn: () => api.getDashboard(project, days),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useQueueCounts() {
  const { project, k } = useKey();
  return useQuery({
    queryKey: k("queues"),
    queryFn: () => api.getQueueCounts(project),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useUsers(filter: api.UserFilter) {
  const { project, k } = useKey();
  return useInfiniteQuery({
    queryKey: k("users", filter),
    queryFn: ({ pageParam }) => api.listUsers(project, filter, pageParam),
    initialPageParam: null as api.Cursor,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useUserSearch(term: string) {
  const { project, k } = useKey();
  const t = term.trim();
  return useQuery({
    queryKey: k("userSearch", t),
    queryFn: () => api.findUsers(project, t),
    enabled: t.replace(/\D/g, "").length >= 10 || /^[A-Za-z0-9]{20,40}$/.test(t),
  });
}

export function useUserDetail(uid: string | null) {
  const { project, k } = useKey();
  return useQuery({
    queryKey: k("user", uid),
    queryFn: () => api.getUserDetail(project, uid!),
    enabled: !!uid,
  });
}

export function useKycQueue(status: KycStatus) {
  const { project, k } = useKey();
  return useQuery({ queryKey: k("kyc", status), queryFn: () => api.listKyc(project, status) });
}

export function useKycImages(uid: string | null) {
  const { project, k } = useKey();
  return useQuery({
    queryKey: k("kycImages", uid),
    queryFn: () => api.getKycImages(project, uid!),
    enabled: !!uid,
    // Download URLs badalat nahit — punha fetch nako.
    staleTime: Infinity,
  });
}

export function useTasks(status: TaskStatus | "live" | undefined) {
  const { project, k } = useKey();
  return useInfiniteQuery({
    queryKey: k("tasks", status ?? "all"),
    queryFn: ({ pageParam }) => api.listTasks(project, status, pageParam),
    initialPageParam: null as api.Cursor,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useTaskDetail(id: string | null) {
  const { project, k } = useKey();
  return useQuery({
    queryKey: k("task", id),
    queryFn: () => api.getTaskDetail(project, id!),
    enabled: !!id,
  });
}

export function useDisputes() {
  const { project, k } = useKey();
  return useQuery({ queryKey: k("disputes"), queryFn: () => api.listDisputes(project) });
}

export function usePayouts(status: PayoutStatus) {
  const { project, k } = useKey();
  return useQuery({ queryKey: k("payouts", status), queryFn: () => api.listPayouts(project, status) });
}

export function useTransactions(filter: { type?: TxnType; userId?: string }) {
  const { project, k } = useKey();
  return useInfiniteQuery({
    queryKey: k("txns", filter),
    queryFn: ({ pageParam }) => api.listTransactions(project, filter, pageParam),
    initialPageParam: null as api.Cursor,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useCategories() {
  const { project, k } = useKey();
  return useQuery({
    queryKey: k("categories"),
    queryFn: () => api.listCategories(project),
    staleTime: 10 * 60_000,
  });
}

// ── Mutations (Cloud Functions) ──────────────────────────────────────

/** Action nantar he data stale — dashboard, queues ani list punha load. */
function useInvalidate() {
  const qc = useQueryClient();
  const { project } = useProject();
  return (...groups: string[]) =>
    Promise.all(
      ["dashboard", "queues", ...groups].map((g) =>
        qc.invalidateQueries({ queryKey: [project.id, g] }),
      ),
    );
}

const onError = (e: unknown) => toast.error(errorMessage(e));

export function useReviewKyc() {
  const { project } = useProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { userId: string; approve: boolean; reason?: string }) =>
      api.reviewKyc(project, v.userId, v.approve, v.reason),
    onSuccess: (_, v) => {
      toast.success(t(v.approve ? "toast.kycVerified" : "toast.kycReturned"));
      return invalidate("kyc", "users", "user");
    },
    onError,
  });
}

export function useUpdateUser() {
  const { project } = useProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { userId: string; changes: UserChanges }) => api.updateUser(project, v.userId, v.changes),
    onSuccess: () => {
      toast.success(t("toast.userUpdated"));
      return invalidate("users", "user", "kyc");
    },
    onError,
  });
}

export function useDeleteUser() {
  const { project } = useProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (userId: string) => api.deleteUser(project, userId),
    onSuccess: () => {
      toast.success(t("toast.userDeleted"));
      return invalidate("users", "user", "kyc", "payouts");
    },
    onError,
  });
}

export function useToggleBlock() {
  const { project } = useProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (userId: string) => api.toggleBlock(project, userId),
    onSuccess: (r) => {
      toast.success(t(r.isBlocked ? "toast.userBlocked" : "toast.userUnblocked"));
      return invalidate("users", "user");
    },
    onError,
  });
}

export function useResolveDispute() {
  const { project } = useProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { disputeId: string; resolution: Exclude<DisputeStatus, "open">; note: string }) =>
      api.resolveDispute(project, v.disputeId, v.resolution, v.note),
    onSuccess: () => {
      toast.success(t("toast.disputeUpdated"));
      return invalidate("disputes", "tasks", "task", "txns");
    },
    onError,
  });
}

export function useSettlePayout() {
  const { project } = useProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { payoutId: string; success: boolean; utr: string }) =>
      api.settlePayout(project, v.payoutId, v.success, v.utr),
    onSuccess: (_, v) => {
      toast.success(t(v.success ? "toast.payoutPaid" : "toast.payoutFailed"));
      return invalidate("payouts", "txns", "user");
    },
    onError,
  });
}

export function useCancelTask() {
  const { project } = useProject();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { taskId: string; reason: string }) => api.cancelTask(project, v.taskId, v.reason),
    onSuccess: () => {
      toast.success(t("toast.taskCancelled"));
      return invalidate("tasks", "task", "txns");
    },
    onError,
  });
}

// ── Notifications ────────────────────────────────────────────────────

export function useNotificationSettings() {
  const { project, k } = useKey();
  return useQuery({ queryKey: k("notifSettings"), queryFn: () => notif.getNotificationSettings(project) });
}

export function useUpdateNotificationSettings() {
  const { project } = useProject();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<notif.NotificationSettings>) => notif.updateNotificationSettings(project, patch),
    onSuccess: (s) => {
      qc.setQueryData([project.id, "notifSettings"], s);
      toast.success(t("notif.auto.saved"));
    },
    onError,
  });
}

export function useBroadcasts(type?: notif.BroadcastType) {
  const { project, k } = useKey();
  return useQuery({
    queryKey: k("broadcasts", type ?? "all"),
    queryFn: () => notif.listBroadcasts(project, type),
    // Navin task alerts apoaap yetat — list taji theva.
    refetchInterval: 30_000,
  });
}

export function useRecipients(id: string | null, status?: notif.DeliveryStatus) {
  const { project, k } = useKey();
  return useQuery({
    queryKey: k("recipients", id, status ?? "all"),
    queryFn: () => notif.listRecipients(project, id!, status),
    enabled: !!id,
  });
}

export function useAudienceEstimate(audience: notif.Audience) {
  const { project, k } = useKey();
  return useQuery({
    queryKey: k("audience", audience),
    queryFn: () => notif.estimateAudience(project, audience),
    staleTime: 60_000,
  });
}

export function useSendBroadcast() {
  const { project } = useProject();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { text: notif.NoticeText; audience: notif.Audience; test?: boolean }) =>
      notif.sendBroadcast(project, v.text, v.audience, v.test),
    onSuccess: (_, v) => {
      toast.success(t(v.test ? "notif.send.testQueued" : "notif.send.queued"));
      return qc.invalidateQueries({ queryKey: [project.id, "broadcasts"] });
    },
    onError,
  });
}
