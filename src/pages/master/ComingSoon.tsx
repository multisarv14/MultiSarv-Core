import { CreditCard, FileText, Receipt, Wallet, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/ui/data";
import { Card } from "@/components/ui/primitives";
import { t, type MsgKey } from "@/i18n";

/** Billing / Invoicing / Receipt / Accounts — menu tayar, functionality pudhchya tappyat. */
function Module({ title, description, icon: Icon }: { title: MsgKey; description: MsgKey; icon: LucideIcon }) {
  return (
    <>
      <PageHeader title={t(title)} description={t(description)} />
      <Card className="animate-pop relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col items-center px-6 py-16 text-center">
          <span className="animate-float flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Icon className="size-6" />
          </span>
          <p className="mt-5 text-base font-semibold">{t("master.soon.title")}</p>
          <p className="mt-1 max-w-sm text-sm text-muted">{t("master.soon.desc")}</p>
        </div>
      </Card>
    </>
  );
}

export const Billing = () => <Module title="master.nav.billing" description="master.billing.desc" icon={CreditCard} />;
export const Invoicing = () => <Module title="master.nav.invoicing" description="master.invoicing.desc" icon={FileText} />;
export const Receipts = () => <Module title="master.nav.receipts" description="master.receipts.desc" icon={Receipt} />;
export const Accounts = () => <Module title="master.nav.accounts" description="master.accounts.desc" icon={Wallet} />;
