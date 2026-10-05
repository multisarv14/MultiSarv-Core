import { defineMessages } from "../define";

/** Master home (project list) ani project gate (setup / access screens). */
export const shell = defineMessages({
  // ── Master home ──
  "home.title": { en: "Control center", hi: "कंट्रोल सेंटर", mr: "कंट्रोल सेंटर", gu: "કંટ્રોલ સેન્ટર" },
  "home.intro": {
    en: "All projects in one place. Pick a project — manage users, KYC, tasks, disputes, payouts and the ledger from there.",
    hi: "सभी प्रोजेक्ट एक जगह। प्रोजेक्ट चुनें — वहाँ से यूज़र्स, KYC, टास्क, विवाद, पेआउट और लेजर मैनेज करें।",
    mr: "सर्व प्रोजेक्ट एकाच ठिकाणी. प्रोजेक्ट निवडा — तिथून युजर्स, KYC, टास्क, वाद, पेआउट आणि लेजर मॅनेज करा.",
    gu: "બધા પ્રોજેક્ટ એક જગ્યાએ. પ્રોજેક્ટ પસંદ કરો — ત્યાંથી યુઝર્સ, KYC, ટાસ્ક, વિવાદ, પેઆઉટ અને લેજર મૅનેજ કરો.",
  },
  "home.checking": { en: "Checking…", hi: "जाँच हो रही है…", mr: "तपासत आहे…", gu: "તપાસ ચાલુ…" },
  "home.noAdmin": { en: "No admin access", hi: "एडमिन एक्सेस नहीं", mr: "ॲडमिन ॲक्सेस नाही", gu: "એડમિન ઍક્સેસ નથી" },
  "home.connected": { en: "Connected", hi: "कनेक्टेड", mr: "कनेक्टेड", gu: "કનેક્ટેડ" },
  "home.pendingQueue": { en: "Pending {label}", hi: "लंबित {label}", mr: "प्रलंबित {label}", gu: "બાકી {label}" },
  "home.openPanel": { en: "Open admin panel", hi: "एडमिन पैनल खोलें", mr: "ॲडमिन पॅनल उघडा", gu: "એડમિન પૅનલ ખોલો" },
  "home.newProject": { en: "New project", hi: "नया प्रोजेक्ट", mr: "नवीन प्रोजेक्ट", gu: "નવો પ્રોજેક્ટ" },
  "home.newProjectHint": {
    en: "Add an entry in {file} and the Firebase config in {env}.",
    hi: "{file} में एंट्री और {env} में Firebase config जोड़ें।",
    mr: "{file} मध्ये एंट्री आणि {env} मध्ये Firebase config ॲड करा.",
    gu: "{file} માં એન્ટ્રી અને {env} માં Firebase config ઉમેરો.",
  },

  // ── Project gate ──
  "gate.unconfigured": {
    en: "{name} is not configured",
    hi: "{name} कॉन्फ़िगर नहीं है",
    mr: "{name} कॉन्फिगर केलेले नाही",
    gu: "{name} કૉન્ફિગર થયેલ નથી",
  },
  "gate.unconfiguredDesc": {
    en: "Put {key} and the rest of the Firebase web config in {env}, then restart the dev server.",
    hi: "{env} में {key} और बाकी Firebase web config डालें, फिर dev server रीस्टार्ट करें।",
    mr: "{env} मध्ये {key} आणि बाकी Firebase web config टाका, मग dev server रिस्टार्ट करा.",
    gu: "{env} માં {key} અને બાકીનો Firebase web config મૂકો, પછી dev server રીસ્ટાર્ટ કરો.",
  },
  "gate.accessDenied": { en: "Access denied", hi: "एक्सेस नहीं मिला", mr: "ॲक्सेस नाकारला", gu: "ઍક્સેસ નકાર્યો" },
});
