/**
 * Corporate Affairs — sagle record prakar (kinds) ani tyanche fields ithe ek jagi.
 * Server validation, web panel ani phone app che forms / tables hech schema vachtat
 * (`corpSchema` callable) — field badalla tar fakt ithe badla.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "money"
  | "percent"
  | "date"
  | "select"
  | "email"
  | "phone"
  | "url"
  | "ref"
  | "bool";

/** Indian registration numbers — client pan hech regex vaparto. */
export const PATTERNS = {
  pan: "^[A-Z]{5}[0-9]{4}[A-Z]$",
  tan: "^[A-Z]{4}[0-9]{5}[A-Z]$",
  gstin: "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$",
  cin: "^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$",
  din: "^[0-9]{8}$",
} as const;
export type PatternKey = keyof typeof PATTERNS;

export interface Option {
  value: string;
  label: string;
}

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Option[];
  /** `ref` — konta kind (id sathavto). */
  ref?: Kind;
  pattern?: PatternKey;
  /** List table madhe column. */
  list?: boolean;
  /** List var filter (select / bool / ref). */
  filter?: boolean;
  /** Text max (default text 200, textarea 5000). */
  max?: number;
  hint?: string;
}

export interface KindDef {
  kind: Kind;
  section: SectionKey;
  label: string;
  singular: string;
  /** Record cha naav (list, history, ref dropdown). */
  titleField: string;
  /** List default sort (desc). */
  sortField: string;
  /** Date range filter. */
  dateField?: string;
  /** Ekach record (Company Profile). */
  singleton?: boolean;
  /** Server ne mojlele (read-only) fields — list / detail madhe. */
  computed?: { key: string; label: string; type: FieldType }[];
  fields: Field[];
}

export type SectionKey =
  | "company"
  | "directors"
  | "shareholders"
  | "capital"
  | "investors"
  | "documents"
  | "meetings"
  | "compliance"
  | "assets"
  | "relatedParties";

export type Kind =
  | "company"
  | "directors"
  | "shareholders"
  | "shareTxns"
  | "capital"
  | "valuations"
  | "investors"
  | "investorPayments"
  | "documents"
  | "meetings"
  | "resolutions"
  | "compliance"
  | "assets"
  | "relatedParties"
  | "rpTransactions";

const opts = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

const SHARE_CLASS = opts([
  ["equity", "Equity"],
  ["preference", "Preference"],
]);

const notes: Field = { key: "notes", label: "Notes", type: "textarea", max: 5000 };

export const KINDS: KindDef[] = [
  // ── 1. Company Profile ──
  {
    kind: "company",
    section: "company",
    label: "Company Profile",
    singular: "Company Profile",
    titleField: "name",
    sortField: "name",
    singleton: true,
    fields: [
      { key: "name", label: "Company name", type: "text", required: true, max: 150 },
      { key: "cin", label: "CIN", type: "text", pattern: "cin", hint: "U72900MH2020PTC123456" },
      { key: "incorporationDate", label: "Date of incorporation", type: "date" },
      {
        key: "companyType",
        label: "Company type",
        type: "select",
        options: opts([
          ["privateLimited", "Private Limited"],
          ["publicLimited", "Public Limited"],
          ["opc", "One Person Company"],
          ["llp", "LLP"],
          ["section8", "Section 8"],
        ]),
      },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: opts([
          ["limitedByShares", "Limited by shares"],
          ["limitedByGuarantee", "Limited by guarantee"],
          ["unlimited", "Unlimited"],
        ]),
      },
      { key: "roc", label: "Registrar of Companies (ROC)", type: "text", max: 100 },
      { key: "pan", label: "PAN", type: "text", pattern: "pan" },
      { key: "tan", label: "TAN", type: "text", pattern: "tan" },
      { key: "gstin", label: "GSTIN", type: "text", pattern: "gstin" },
      { key: "registeredAddress", label: "Registered office address", type: "textarea", max: 500 },
      { key: "corporateAddress", label: "Corporate office address", type: "textarea", max: 500 },
      { key: "email", label: "Official email", type: "email" },
      { key: "phone", label: "Phone", type: "phone" },
      { key: "website", label: "Website", type: "url" },
      { key: "authorizedCapital", label: "Authorized capital", type: "money" },
      { key: "paidUpCapital", label: "Paid-up capital", type: "money" },
      { key: "faceValue", label: "Face value per share", type: "money" },
      { key: "financialYearEnd", label: "Financial year end", type: "text", max: 20, hint: "31 March" },
      { key: "auditor", label: "Statutory auditor", type: "text", max: 150 },
      { key: "companySecretary", label: "Company secretary", type: "text", max: 150 },
      notes,
    ],
  },

  // ── 2. Directors ──
  {
    kind: "directors",
    section: "directors",
    label: "Directors",
    singular: "Director",
    titleField: "name",
    sortField: "appointmentDate",
    dateField: "appointmentDate",
    fields: [
      { key: "name", label: "Full name", type: "text", required: true, list: true, max: 120 },
      { key: "din", label: "DIN", type: "text", pattern: "din", list: true },
      {
        key: "designation",
        label: "Designation",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["director", "Director"],
          ["managingDirector", "Managing Director"],
          ["wholeTimeDirector", "Whole-time Director"],
          ["independentDirector", "Independent Director"],
          ["additionalDirector", "Additional Director"],
          ["nomineeDirector", "Nominee Director"],
          ["alternateDirector", "Alternate Director"],
        ]),
      },
      { key: "appointmentDate", label: "Appointment date", type: "date", required: true, list: true },
      { key: "resignationDate", label: "Resignation / cessation date", type: "date" },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["active", "Active"],
          ["resigned", "Resigned"],
          ["disqualified", "Disqualified"],
        ]),
      },
      { key: "pan", label: "PAN", type: "text", pattern: "pan" },
      {
        key: "kycStatus",
        label: "DIR-3 KYC status",
        type: "select",
        list: true,
        filter: true,
        options: opts([
          ["completed", "Completed"],
          ["pending", "Pending"],
          ["expired", "Expired / deactivated"],
        ]),
      },
      { key: "kycDate", label: "Last KYC filed on", type: "date" },
      { key: "dob", label: "Date of birth", type: "date" },
      { key: "nationality", label: "Nationality", type: "text", max: 60 },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "phone" },
      { key: "address", label: "Residential address", type: "textarea", max: 500 },
      notes,
    ],
  },

  // ── 3. Shareholders ──
  {
    kind: "shareholders",
    section: "shareholders",
    label: "Shareholders",
    singular: "Shareholder",
    titleField: "name",
    sortField: "name",
    computed: [
      { key: "shares", label: "Shares held", type: "number" },
      { key: "percent", label: "Shareholding %", type: "percent" },
      { key: "invested", label: "Amount invested", type: "money" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, list: true, max: 150 },
      {
        key: "holderType",
        label: "Holder type",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["individual", "Individual"],
          ["company", "Company"],
          ["llp", "LLP"],
          ["trust", "Trust"],
          ["huf", "HUF"],
          ["other", "Other"],
        ]),
      },
      { key: "folioNo", label: "Folio no.", type: "text", list: true, max: 40 },
      { key: "pan", label: "PAN", type: "text", pattern: "pan" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "phone" },
      { key: "address", label: "Address", type: "textarea", max: 500 },
      { key: "joinedDate", label: "Member since", type: "date" },
      notes,
    ],
  },
  {
    kind: "shareTxns",
    section: "shareholders",
    label: "Allotments & Transfers",
    singular: "Share transaction",
    titleField: "certificateNo",
    sortField: "date",
    dateField: "date",
    fields: [
      {
        key: "type",
        label: "Transaction",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["allotment", "Allotment"],
          ["transfer", "Transfer"],
          ["transmission", "Transmission"],
          ["bonus", "Bonus issue"],
          ["buyback", "Buy-back"],
        ]),
      },
      { key: "date", label: "Date", type: "date", required: true, list: true },
      { key: "fromHolder", label: "From (transferor)", type: "ref", ref: "shareholders", list: true, filter: true },
      { key: "toHolder", label: "To (allottee / transferee)", type: "ref", ref: "shareholders", list: true, filter: true },
      { key: "shares", label: "No. of shares", type: "number", required: true, list: true },
      { key: "shareClass", label: "Share class", type: "select", required: true, filter: true, options: SHARE_CLASS },
      { key: "pricePerShare", label: "Price per share", type: "money" },
      { key: "amount", label: "Total consideration", type: "money", list: true, hint: "Blank = shares × price" },
      { key: "certificateNo", label: "Share certificate no.", type: "text", max: 40 },
      { key: "distinctiveFrom", label: "Distinctive no. from", type: "number" },
      { key: "distinctiveTo", label: "Distinctive no. to", type: "number" },
      { key: "resolution", label: "Approving resolution", type: "ref", ref: "resolutions" },
      { key: "filing", label: "Form / SRN (PAS-3, SH-4 …)", type: "text", max: 60 },
      notes,
    ],
  },

  // ── 4. Share Capital & Valuation ──
  {
    kind: "capital",
    section: "capital",
    label: "Capital History",
    singular: "Capital change",
    titleField: "event",
    sortField: "date",
    dateField: "date",
    fields: [
      { key: "date", label: "Effective date", type: "date", required: true, list: true },
      {
        key: "event",
        label: "Event",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["incorporation", "Incorporation"],
          ["authorizedIncrease", "Increase in authorized capital"],
          ["rightsIssue", "Rights issue"],
          ["privatePlacement", "Private placement"],
          ["bonusIssue", "Bonus issue"],
          ["buyback", "Buy-back"],
          ["other", "Other"],
        ]),
      },
      { key: "authorizedCapital", label: "Authorized capital", type: "money", required: true, list: true },
      { key: "paidUpCapital", label: "Paid-up capital", type: "money", required: true, list: true },
      { key: "faceValue", label: "Face value", type: "money", required: true, list: true },
      { key: "issuePrice", label: "Issue price per share", type: "money" },
      { key: "sharesIssued", label: "Shares issued", type: "number" },
      { key: "resolution", label: "Approving resolution", type: "ref", ref: "resolutions" },
      { key: "srn", label: "SRN (SH-7 / PAS-3)", type: "text", max: 40 },
      notes,
    ],
  },
  {
    kind: "valuations",
    section: "capital",
    label: "Valuations",
    singular: "Valuation",
    titleField: "purpose",
    sortField: "date",
    dateField: "date",
    fields: [
      { key: "date", label: "Valuation date", type: "date", required: true, list: true },
      { key: "valuation", label: "Company valuation", type: "money", required: true, list: true },
      { key: "pricePerShare", label: "Fair value per share", type: "money", list: true },
      { key: "preMoney", label: "Pre-money", type: "money" },
      { key: "postMoney", label: "Post-money", type: "money" },
      {
        key: "method",
        label: "Method",
        type: "select",
        list: true,
        filter: true,
        options: opts([
          ["dcf", "DCF"],
          ["nav", "Net asset value"],
          ["marketMultiple", "Market multiple"],
          ["comparable", "Comparable transactions"],
          ["other", "Other"],
        ]),
      },
      {
        key: "purpose",
        label: "Purpose",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["fundraise", "Fund raise"],
          ["esop", "ESOP"],
          ["regulatory", "Regulatory (FEMA / Income tax)"],
          ["transfer", "Share transfer"],
          ["other", "Other"],
        ]),
      },
      { key: "valuer", label: "Valuer", type: "text", list: true, max: 150 },
      notes,
    ],
  },

  // ── 5. Investors ──
  {
    kind: "investors",
    section: "investors",
    label: "Investors",
    singular: "Investor",
    titleField: "name",
    sortField: "investmentDate",
    dateField: "investmentDate",
    computed: [
      { key: "received", label: "Amount received", type: "money" },
      { key: "pending", label: "Pending", type: "money" },
    ],
    fields: [
      { key: "name", label: "Investor name", type: "text", required: true, list: true, max: 150 },
      {
        key: "investorType",
        label: "Investor type",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["angel", "Angel"],
          ["vc", "Venture capital"],
          ["pe", "Private equity"],
          ["strategic", "Strategic / corporate"],
          ["familyOffice", "Family office"],
          ["individual", "Individual"],
          ["other", "Other"],
        ]),
      },
      {
        key: "instrument",
        label: "Investment type",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["equity", "Equity shares"],
          ["ccps", "CCPS"],
          ["ccd", "CCD"],
          ["safe", "SAFE / iSAFE"],
          ["convertibleNote", "Convertible note"],
          ["debt", "Debt / loan"],
        ]),
      },
      { key: "commitment", label: "Investment amount", type: "money", required: true, list: true },
      { key: "investmentDate", label: "Investment date", type: "date", list: true },
      { key: "round", label: "Round", type: "text", max: 60, hint: "Seed, Series A …" },
      { key: "shareholder", label: "Linked shareholder", type: "ref", ref: "shareholders" },
      { key: "agreementDate", label: "Agreement date", type: "date" },
      {
        key: "agreementStatus",
        label: "Agreement status",
        type: "select",
        filter: true,
        options: opts([
          ["draft", "Draft"],
          ["signed", "Signed"],
          ["terminated", "Terminated"],
        ]),
      },
      { key: "boardSeat", label: "Board seat", type: "bool" },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["prospect", "Prospect"],
          ["active", "Active"],
          ["exited", "Exited"],
        ]),
      },
      { key: "contactPerson", label: "Contact person", type: "text", max: 120 },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "phone" },
      { key: "pan", label: "PAN", type: "text", pattern: "pan" },
      { key: "address", label: "Address", type: "textarea", max: 500 },
      notes,
    ],
  },
  {
    kind: "investorPayments",
    section: "investors",
    label: "Payments",
    singular: "Payment",
    titleField: "reference",
    sortField: "date",
    dateField: "date",
    fields: [
      { key: "investor", label: "Investor", type: "ref", ref: "investors", required: true, list: true, filter: true },
      { key: "date", label: "Date", type: "date", required: true, list: true },
      { key: "amount", label: "Amount", type: "money", required: true, list: true },
      {
        key: "mode",
        label: "Mode",
        type: "select",
        required: true,
        list: true,
        options: opts([
          ["bankTransfer", "Bank transfer"],
          ["cheque", "Cheque"],
          ["upi", "UPI"],
          ["other", "Other"],
        ]),
      },
      { key: "reference", label: "UTR / reference", type: "text", list: true, max: 60 },
      { key: "tranche", label: "Tranche", type: "text", max: 60 },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["received", "Received"],
          ["pending", "Pending"],
          ["refunded", "Refunded"],
        ]),
      },
      notes,
    ],
  },

  // ── 6. Company Documents ──
  {
    kind: "documents",
    section: "documents",
    label: "Company Documents",
    singular: "Document",
    titleField: "title",
    sortField: "issueDate",
    dateField: "issueDate",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, list: true, max: 150 },
      {
        key: "category",
        label: "Category",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["moa", "MOA"],
          ["aoa", "AOA"],
          ["incorporation", "Incorporation Certificate"],
          ["pan", "PAN"],
          ["gst", "GST"],
          ["tan", "TAN"],
          ["rocFiling", "ROC filing"],
          ["agreement", "Agreement"],
          ["license", "License / registration"],
          ["boardResolution", "Board resolution"],
          ["other", "Other"],
        ]),
      },
      { key: "docNumber", label: "Document / reference no.", type: "text", list: true, max: 60 },
      { key: "issueDate", label: "Issue / signing date", type: "date", list: true },
      { key: "expiryDate", label: "Expiry / renewal date", type: "date", list: true },
      { key: "issuedBy", label: "Issued by / counterparty", type: "text", max: 150 },
      notes,
    ],
  },

  // ── 7. Board Meetings & Resolutions ──
  {
    kind: "meetings",
    section: "meetings",
    label: "Meetings",
    singular: "Meeting",
    titleField: "title",
    sortField: "date",
    dateField: "date",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, list: true, max: 150 },
      {
        key: "type",
        label: "Meeting type",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["board", "Board meeting"],
          ["agm", "AGM"],
          ["egm", "EGM"],
          ["committee", "Committee meeting"],
        ]),
      },
      { key: "date", label: "Date", type: "date", required: true, list: true },
      { key: "time", label: "Time", type: "text", max: 20, hint: "11:00 AM" },
      { key: "venue", label: "Venue / video link", type: "text", list: true, max: 200 },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["scheduled", "Scheduled"],
          ["held", "Held"],
          ["adjourned", "Adjourned"],
          ["cancelled", "Cancelled"],
        ]),
      },
      { key: "chairperson", label: "Chairperson", type: "text", max: 120 },
      { key: "agenda", label: "Agenda", type: "textarea", max: 10000 },
      { key: "attendees", label: "Attendees", type: "textarea", max: 3000 },
      { key: "minutes", label: "Minutes", type: "textarea", max: 20000 },
      notes,
    ],
  },
  {
    kind: "resolutions",
    section: "meetings",
    label: "Resolutions",
    singular: "Resolution",
    titleField: "title",
    sortField: "date",
    dateField: "date",
    fields: [
      { key: "number", label: "Resolution no.", type: "text", required: true, list: true, max: 40 },
      { key: "title", label: "Title", type: "text", required: true, list: true, max: 200 },
      {
        key: "type",
        label: "Type",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["board", "Board resolution"],
          ["ordinary", "Ordinary resolution"],
          ["special", "Special resolution"],
          ["circular", "Circular resolution"],
        ]),
      },
      { key: "meeting", label: "Meeting", type: "ref", ref: "meetings", filter: true },
      { key: "date", label: "Date", type: "date", required: true, list: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["proposed", "Proposed"],
          ["passed", "Passed"],
          ["rejected", "Rejected"],
          ["withdrawn", "Withdrawn"],
        ]),
      },
      { key: "text", label: "Resolution text", type: "textarea", max: 20000 },
      { key: "filingRequired", label: "MGT-14 filing required", type: "bool" },
      { key: "filingRef", label: "MGT-14 SRN", type: "text", max: 40 },
      notes,
    ],
  },

  // ── 8. Legal & Compliance ──
  {
    kind: "compliance",
    section: "compliance",
    label: "Legal & Compliance",
    singular: "Compliance item",
    titleField: "title",
    sortField: "dueDate",
    dateField: "dueDate",
    computed: [
      { key: "overdue", label: "Overdue", type: "bool" },
      { key: "daysLeft", label: "Days left", type: "number" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true, list: true, max: 150 },
      { key: "form", label: "Form / return", type: "text", list: true, max: 40, hint: "AOC-4, MGT-7, GSTR-3B …" },
      {
        key: "authority",
        label: "Authority",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["roc", "ROC / MCA"],
          ["gst", "GST"],
          ["incomeTax", "Income Tax"],
          ["tds", "TDS"],
          ["pf", "PF"],
          ["esic", "ESIC"],
          ["rbi", "RBI / FEMA"],
          ["other", "Other"],
        ]),
      },
      { key: "period", label: "Period", type: "text", max: 40, hint: "FY 2025-26, Q2 …" },
      { key: "dueDate", label: "Due date", type: "date", required: true, list: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["pending", "Pending"],
          ["filed", "Filed"],
          ["notApplicable", "Not applicable"],
        ]),
      },
      { key: "filedDate", label: "Filed on", type: "date" },
      { key: "srn", label: "SRN / acknowledgement", type: "text", max: 60 },
      { key: "reminderDays", label: "Remind days before", type: "number", hint: "Default 7" },
      {
        key: "recurrence",
        label: "Repeats",
        type: "select",
        filter: true,
        options: opts([
          ["none", "Does not repeat"],
          ["monthly", "Monthly"],
          ["quarterly", "Quarterly"],
          ["halfYearly", "Half-yearly"],
          ["yearly", "Yearly"],
        ]),
        hint: "Marking filed creates the next one",
      },
      { key: "responsible", label: "Responsible person", type: "text", list: true, max: 120 },
      { key: "fees", label: "Filing fees", type: "money" },
      { key: "penalty", label: "Penalty / late fee", type: "money" },
      notes,
    ],
  },

  // ── 9. Company Assets & IP ──
  {
    kind: "assets",
    section: "assets",
    label: "Assets & IP",
    singular: "Asset",
    titleField: "name",
    sortField: "renewalDate",
    dateField: "renewalDate",
    computed: [{ key: "daysToRenewal", label: "Days to renewal", type: "number" }],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, list: true, max: 150 },
      {
        key: "type",
        label: "Type",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["domain", "Domain"],
          ["software", "Software product"],
          ["trademark", "Trademark"],
          ["copyright", "Copyright"],
          ["patent", "Patent"],
          ["license", "License"],
          ["other", "Other"],
        ]),
      },
      { key: "registrationNo", label: "Registration / application no.", type: "text", list: true, max: 60 },
      { key: "registrar", label: "Registrar / vendor / authority", type: "text", max: 150 },
      { key: "trademarkClass", label: "Class", type: "text", max: 40 },
      { key: "owner", label: "Registered owner", type: "text", max: 150 },
      { key: "filingDate", label: "Filing date", type: "date" },
      { key: "registrationDate", label: "Registration date", type: "date" },
      { key: "renewalDate", label: "Renewal / expiry date", type: "date", list: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["active", "Active / registered"],
          ["pending", "Pending / applied"],
          ["objected", "Objected / opposed"],
          ["expired", "Expired"],
          ["abandoned", "Abandoned"],
          ["transferred", "Transferred"],
        ]),
      },
      { key: "value", label: "Book value", type: "money" },
      { key: "url", label: "URL", type: "url" },
      notes,
    ],
  },

  // ── 10. Related Parties ──
  {
    kind: "relatedParties",
    section: "relatedParties",
    label: "Related Parties",
    singular: "Related party",
    titleField: "name",
    sortField: "name",
    computed: [{ key: "totalAmount", label: "Total transactions", type: "money" }],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, list: true, max: 150 },
      {
        key: "relationship",
        label: "Relationship",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["director", "Director"],
          ["kmp", "Key managerial personnel"],
          ["relative", "Relative of director / KMP"],
          ["holding", "Holding company"],
          ["subsidiary", "Subsidiary"],
          ["associate", "Associate"],
          ["jointVenture", "Joint venture"],
          ["interestedEntity", "Firm / company with director interest"],
          ["other", "Other"],
        ]),
      },
      { key: "relatedPerson", label: "Related to (director / KMP)", type: "text", list: true, max: 120 },
      { key: "natureOfInterest", label: "Nature of interest", type: "textarea", max: 1000 },
      { key: "pan", label: "PAN", type: "text", pattern: "pan" },
      { key: "since", label: "Related since", type: "date" },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["active", "Active"],
          ["inactive", "Inactive"],
        ]),
      },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "phone" },
      { key: "address", label: "Address", type: "textarea", max: 500 },
      notes,
    ],
  },
  {
    kind: "rpTransactions",
    section: "relatedParties",
    label: "Transactions",
    singular: "Related party transaction",
    titleField: "description",
    sortField: "date",
    dateField: "date",
    fields: [
      { key: "party", label: "Related party", type: "ref", ref: "relatedParties", required: true, list: true, filter: true },
      { key: "date", label: "Date", type: "date", required: true, list: true },
      {
        key: "nature",
        label: "Nature",
        type: "select",
        required: true,
        list: true,
        filter: true,
        options: opts([
          ["sale", "Sale of goods / services"],
          ["purchase", "Purchase"],
          ["services", "Availing services"],
          ["loanGiven", "Loan given"],
          ["loanTaken", "Loan taken"],
          ["rent", "Rent / lease"],
          ["remuneration", "Remuneration"],
          ["guarantee", "Guarantee / security"],
          ["investment", "Investment"],
          ["other", "Other"],
        ]),
      },
      { key: "amount", label: "Amount", type: "money", required: true, list: true },
      { key: "description", label: "Description", type: "text", list: true, max: 200 },
      { key: "armsLength", label: "At arm's length", type: "bool", filter: true },
      { key: "ordinaryCourse", label: "In ordinary course of business", type: "bool" },
      { key: "approval", label: "Approving resolution", type: "ref", ref: "resolutions" },
      { key: "agreement", label: "Agreement document", type: "ref", ref: "documents" },
      notes,
    ],
  },
];

export const SECTIONS: { key: SectionKey; label: string; kinds: Kind[] }[] = [
  { key: "company", label: "Company Profile", kinds: ["company"] },
  { key: "directors", label: "Directors", kinds: ["directors"] },
  { key: "shareholders", label: "Shareholders", kinds: ["shareholders", "shareTxns"] },
  { key: "capital", label: "Share Capital & Valuation", kinds: ["capital", "valuations"] },
  { key: "investors", label: "Investors", kinds: ["investors", "investorPayments"] },
  { key: "documents", label: "Company Documents", kinds: ["documents"] },
  { key: "meetings", label: "Board Meetings & Resolutions", kinds: ["meetings", "resolutions"] },
  { key: "compliance", label: "Legal & Compliance", kinds: ["compliance"] },
  { key: "assets", label: "Company Assets & IP", kinds: ["assets"] },
  { key: "relatedParties", label: "Related Parties", kinds: ["relatedParties", "rpTransactions"] },
];

export const KIND_MAP = Object.fromEntries(KINDS.map((k) => [k.kind, k])) as Record<Kind, KindDef>;
