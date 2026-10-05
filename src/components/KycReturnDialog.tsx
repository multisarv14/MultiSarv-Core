import { Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import { t, type MsgKey } from "@/i18n";

import { Modal } from "./ui/overlay";
import { Button, Label, Textarea } from "./ui/primitives";

const QUICK: MsgKey[] = [
  "users.kyc.reason.blurry",
  "users.kyc.reason.sides",
  "users.kyc.reason.number",
  "users.kyc.reason.name",
  "users.kyc.reason.gstin",
];

/**
 * KYC "return for correction" — karan user la app madhe ani notification
 * madhe disto (server ≥ 5 akshare magto). Approve hoiparyant app lock.
 */
export function KycReturnDialog({
  open,
  name,
  loading,
  onClose,
  onSend,
}: {
  open: boolean;
  name: string;
  loading?: boolean;
  onClose: () => void;
  onSend: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const valid = reason.trim().length >= 5;

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={t("users.kyc.returnTitle")}
      description={t("users.kyc.returnDesc", { name })}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            {t("act.cancel")}
          </Button>
          <Button
            variant="danger"
            icon={<Undo2 className="size-4" />}
            loading={loading}
            disabled={!valid}
            onClick={() => onSend(reason.trim())}
          >
            {t("users.kyc.returnSend")}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setReason((r) => (r.trim() ? `${r.trim()}. ${t(k)}` : t(k)))}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-text"
          >
            + {t(k)}
          </button>
        ))}
      </div>
      <Label hint={`${reason.trim().length}/300`}>{t("users.kyc.returnReason")}</Label>
      <Textarea
        autoFocus
        value={reason}
        maxLength={300}
        placeholder={t("users.kyc.returnPlaceholder")}
        onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
}
