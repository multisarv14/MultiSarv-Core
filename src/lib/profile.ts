import type { Role, User } from "@/api/types";

/**
 * App (`lib/domain/entities/profile_completion.dart`) sarkhach hishob —
 * login nantar user ne kiti profile bharla ani mandatory baki aahe ka.
 */
export type ProfileField = "photo" | "name" | "city" | "email" | "businessName" | "skills" | "upi";

export function profileCompletion(user: User, role: Role = user.activeRole) {
  if (role === "admin") return { percent: 100, missing: [] as ProfileField[] };
  const partner = role === "worker" || role === "business";
  const has = (v: string | null | undefined, min = 1) => (v ?? "").trim().length >= min;

  const items: { field: ProfileField; done: boolean; required: boolean }[] = [
    { field: "photo", done: has(user.photoUrl), required: false },
    { field: "name", done: has(user.name, 3) && user.name !== "Unnamed", required: true },
    { field: "city", done: has(user.location?.city, 2), required: true },
    { field: "email", done: has(user.email), required: false },
    ...(role === "business" ? [{ field: "businessName" as const, done: has(user.businessName, 2), required: true }] : []),
    ...(partner
      ? [
          { field: "skills" as const, done: user.skills.length > 0, required: true },
          { field: "upi" as const, done: has(user.upiId), required: true },
        ]
      : []),
  ];
  return {
    percent: Math.round((items.filter((i) => i.done).length * 100) / items.length),
    missing: items.filter((i) => i.required && !i.done).map((i) => i.field),
  };
}
