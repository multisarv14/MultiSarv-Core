import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { core } from "@/lib/firebase";

/** Core `settings/company` — master panel che company tapshil (sidebar brand, pudhe invoice). */
export interface CompanyProfile {
  name: string;
  logo: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
}

export const EMPTY_COMPANY: CompanyProfile = {
  name: "",
  logo: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  phone: "",
  email: "",
  website: "",
  gstin: "",
  pan: "",
};

const ref = () => doc(core().db, "settings", "company");

/** Live company profile — `null` load hot astana. */
export function useCompany(): CompanyProfile | null {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  useEffect(
    () =>
      onSnapshot(
        ref(),
        (snap) => setCompany({ ...EMPTY_COMPANY, ...(snap.data() as Partial<CompanyProfile> | undefined) }),
        () => setCompany(EMPTY_COMPANY),
      ),
    [],
  );
  return company;
}

/** Company logo asel tar browser tab cha favicon tech; nasel tar Multisarv cha. */
export function useCompanyFavicon() {
  const company = useCompany();
  useEffect(() => {
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
    links.forEach((l) => {
      l.dataset.default ??= l.href;
      l.href = company?.logo || l.dataset.default;
    });
    if (company?.name) document.title = `${company.name} · Admin`;
  }, [company?.logo, company?.name]);
}

/** Fakt super admin (core rules). */
export const saveCompany = (c: CompanyProfile, uid: string) =>
  setDoc(ref(), { ...c, updatedBy: uid, updatedAt: serverTimestamp() }, { merge: true });
