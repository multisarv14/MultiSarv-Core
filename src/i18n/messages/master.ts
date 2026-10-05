import { defineMessages } from "../define";

/** Master panel (projects chya baher): sidebar, Dashboard, Settings, finance menus. */
export const master = defineMessages({
  "master.tagline": { en: "Master admin", hi: "मास्टर एडमिन", mr: "मास्टर ॲडमिन", gu: "માસ્ટર એડમિન" },

  // ── Sidebar ──
  "master.nav.dashboard": { en: "Dashboard", hi: "डैशबोर्ड", mr: "डॅशबोर्ड", gu: "ડૅશબોર્ડ" },
  "master.nav.projects": { en: "Projects", hi: "प्रोजेक्ट्स", mr: "प्रोजेक्ट्स", gu: "પ્રોજેક્ટ્સ" },
  "master.nav.billing": { en: "Billing", hi: "बिलिंग", mr: "बिलिंग", gu: "બિલિંગ" },
  "master.nav.invoicing": { en: "Invoicing", hi: "इनवॉइसिंग", mr: "इनव्हॉइसिंग", gu: "ઇન્વૉઇસિંગ" },
  "master.nav.receipts": { en: "Receipt", hi: "रसीद", mr: "पावती", gu: "રસીદ" },
  "master.nav.accounts": { en: "Accounts", hi: "अकाउंट्स", mr: "अकाउंट्स", gu: "એકાઉન્ટ્સ" },
  "master.nav.settings": { en: "Settings", hi: "सेटिंग्स", mr: "सेटिंग्ज", gu: "સેટિંગ્સ" },
  "master.nav.company": { en: "Company Profile", hi: "कंपनी प्रोफ़ाइल", mr: "कंपनी प्रोफाइल", gu: "કંપની પ્રોફાઇલ" },
  "master.nav.users": { en: "Users", hi: "यूज़र्स", mr: "युजर्स", gu: "યુઝર્સ" },
  "master.nav.access": { en: "Module Access", hi: "मॉड्यूल एक्सेस", mr: "मॉड्यूल ॲक्सेस", gu: "મૉડ્યુલ ઍક્સેસ" },

  // ── Dashboard ──
  "master.dash.access": { en: "Your access", hi: "आपका एक्सेस", mr: "तुमचा ॲक्सेस", gu: "તમારો ઍક્સેસ" },
  "master.dash.overview": { en: "Projects overview", hi: "प्रोजेक्ट्स अवलोकन", mr: "प्रोजेक्ट्स आढावा", gu: "પ્રોજેક્ટ્સ ઝાંખી" },
  "master.dash.overviewHint": {
    en: "Connection and pending queues of every project",
    hi: "हर प्रोजेक्ट का कनेक्शन और लंबित काम",
    mr: "प्रत्येक प्रोजेक्टचे कनेक्शन आणि प्रलंबित कामे",
    gu: "દરેક પ્રોજેક્ટનું કનેક્શન અને બાકી કામ",
  },

  // ── Finance menus (pudhchya tappyat) ──
  "master.soon.title": { en: "Coming soon", hi: "जल्द आ रहा है", mr: "लवकरच येत आहे", gu: "ટૂંક સમયમાં" },
  "master.soon.desc": {
    en: "This module's menu is ready. Its features will be added in the next phase.",
    hi: "इस मॉड्यूल का मेनू तैयार है। इसके फ़ीचर अगले चरण में जुड़ेंगे।",
    mr: "या मॉड्यूलचा मेनू तयार आहे. याचे फीचर्स पुढच्या टप्प्यात येतील.",
    gu: "આ મૉડ્યુલનું મેનૂ તૈયાર છે. તેના ફીચર્સ આગલા તબક્કામાં ઉમેરાશે.",
  },
  "master.billing.desc": {
    en: "Billing for projects and clients",
    hi: "प्रोजेक्ट्स और क्लाइंट्स की बिलिंग",
    mr: "प्रोजेक्ट्स आणि क्लायंट्सचे बिलिंग",
    gu: "પ્રોજેક્ટ્સ અને ક્લાયન્ટ્સનું બિલિંગ",
  },
  "master.invoicing.desc": {
    en: "Create, manage and track invoices",
    hi: "इनवॉइस बनाएँ, मैनेज करें और ट्रैक करें",
    mr: "इनव्हॉइस तयार करा, मॅनेज करा आणि ट्रॅक करा",
    gu: "ઇન્વૉઇસ બનાવો, મૅનેજ કરો અને ટ્રૅક કરો",
  },
  "master.receipts.desc": {
    en: "Manage and track payment receipts",
    hi: "पेमेंट रसीदें मैनेज और ट्रैक करें",
    mr: "पेमेंट पावत्या मॅनेज आणि ट्रॅक करा",
    gu: "પેમેન્ટ રસીદો મૅનેજ અને ટ્રૅક કરો",
  },
  "master.accounts.desc": {
    en: "Financial and account management",
    hi: "वित्तीय और अकाउंट मैनेजमेंट",
    mr: "आर्थिक आणि अकाउंट व्यवस्थापन",
    gu: "નાણાકીય અને એકાઉન્ટ મૅનેજમેન્ટ",
  },

  // ── Settings → Users ──
  "master.users.subtitle": {
    en: "Admins who can sign in to the panel. Give project and menu access from Module Access.",
    hi: "पैनल में साइन इन करने वाले एडमिन। प्रोजेक्ट और मेनू एक्सेस Module Access से दें।",
    mr: "पॅनलमध्ये साइन इन करणारे ॲडमिन. प्रोजेक्ट आणि मेनू ॲक्सेस Module Access मधून द्या.",
    gu: "પૅનલમાં સાઇન ઇન કરતા એડમિન. પ્રોજેક્ટ અને મેનૂ ઍક્સેસ Module Access માંથી આપો.",
  },
  "master.users.edit": { en: "Edit", hi: "बदलें", mr: "बदला", gu: "બદલો" },
  "master.users.editTitle": { en: "Edit · {name}", hi: "बदलें · {name}", mr: "बदला · {name}", gu: "બદલો · {name}" },
  "master.users.accessHint": {
    en: "After saving, choose this admin's projects and menus in Module Access.",
    hi: "सेव करने के बाद Module Access में इस एडमिन के प्रोजेक्ट और मेनू चुनें।",
    mr: "सेव्ह केल्यावर Module Access मध्ये या ॲडमिनचे प्रोजेक्ट आणि मेनू निवडा.",
    gu: "સેવ કર્યા પછી Module Access માં આ એડમિનના પ્રોજેક્ટ અને મેનૂ પસંદ કરો.",
  },
  "master.users.giveAccess": { en: "Give module access", hi: "मॉड्यूल एक्सेस दें", mr: "मॉड्यूल ॲक्सेस द्या", gu: "મૉડ્યુલ ઍક્સેસ આપો" },

  // ── Settings → Module Access ──
  "master.access.subtitle": {
    en: "Pick an admin, then choose which projects they see and which menus they can use in each.",
    hi: "एडमिन चुनें, फिर वे कौन से प्रोजेक्ट देखें और हर प्रोजेक्ट में कौन से मेनू इस्तेमाल करें, यह चुनें।",
    mr: "ॲडमिन निवडा, मग त्यांना कोणते प्रोजेक्ट दिसतील आणि प्रत्येकात कोणते मेनू वापरता येतील ते निवडा.",
    gu: "એડમિન પસંદ કરો, પછી તેઓ કયા પ્રોજેક્ટ જુએ અને દરેકમાં કયા મેનૂ વાપરે તે પસંદ કરો.",
  },
  "master.access.unsaved": { en: "Unsaved changes", hi: "बदलाव सेव नहीं हुए", mr: "बदल सेव्ह झाले नाहीत", gu: "ફેરફાર સેવ થયા નથી" },
  "master.access.reset": { en: "Reset", hi: "रीसेट", mr: "रीसेट", gu: "રીસેટ" },

  // ── Settings → Company Profile ──
  "master.company.subtitle": {
    en: "Company details used across the panel and, later, on invoices and receipts.",
    hi: "पैनल में और आगे इनवॉइस व रसीदों पर इस्तेमाल होने वाली कंपनी की जानकारी।",
    mr: "पॅनलमध्ये आणि पुढे इनव्हॉइस व पावत्यांवर वापरली जाणारी कंपनीची माहिती.",
    gu: "પૅનલમાં અને આગળ ઇન્વૉઇસ તથા રસીદો પર વપરાતી કંપનીની માહિતી.",
  },
  "master.company.basic": { en: "Basic details", hi: "मूल जानकारी", mr: "मूलभूत माहिती", gu: "મૂળભૂત માહિતી" },
  "master.company.name": { en: "Company name", hi: "कंपनी का नाम", mr: "कंपनीचे नाव", gu: "કંપનીનું નામ" },
  "master.company.namePlaceholder": { en: "Your company", hi: "आपकी कंपनी", mr: "तुमची कंपनी", gu: "તમારી કંપની" },
  "master.company.phone": { en: "Contact number", hi: "संपर्क नंबर", mr: "संपर्क नंबर", gu: "સંપર્ક નંબર" },
  "master.company.website": { en: "Website", hi: "वेबसाइट", mr: "वेबसाइट", gu: "વેબસાઇટ" },
  "master.company.address": { en: "Address", hi: "पता", mr: "पत्ता", gu: "સરનામું" },
  "master.company.street": { en: "Street address", hi: "पता (गली / इमारत)", mr: "पत्ता (रस्ता / इमारत)", gu: "સરનામું (શેરી / બિલ્ડિંગ)" },
  "master.company.city": { en: "City", hi: "शहर", mr: "शहर", gu: "શહેર" },
  "master.company.state": { en: "State", hi: "राज्य", mr: "राज्य", gu: "રાજ્ય" },
  "master.company.pincode": { en: "PIN code", hi: "पिन कोड", mr: "पिन कोड", gu: "પિન કોડ" },
  "master.company.country": { en: "Country", hi: "देश", mr: "देश", gu: "દેશ" },
  "master.company.tax": { en: "GST / Tax", hi: "GST / टैक्स", mr: "GST / कर", gu: "GST / ટૅક્સ" },
  "master.company.taxHint": {
    en: "Printed on invoices and receipts",
    hi: "इनवॉइस और रसीदों पर छपेगा",
    mr: "इनव्हॉइस आणि पावत्यांवर छापले जाईल",
    gu: "ઇન્વૉઇસ અને રસીદો પર છપાશે",
  },
  "master.company.badGstin": { en: "Invalid GSTIN", hi: "GSTIN गलत है", mr: "GSTIN चुकीचा आहे", gu: "GSTIN ખોટો છે" },
  "master.company.badPan": { en: "Invalid PAN", hi: "PAN गलत है", mr: "PAN चुकीचा आहे", gu: "PAN ખોટો છે" },
  "master.company.changeLogo": { en: "Change logo", hi: "लोगो बदलें", mr: "लोगो बदला", gu: "લોગો બદલો" },
  "master.company.removeLogo": { en: "Remove logo", hi: "लोगो हटाएँ", mr: "लोगो काढा", gu: "લોગો દૂર કરો" },
  "master.company.logoHint": {
    en: "PNG / JPG / SVG — shown in the sidebar",
    hi: "PNG / JPG / SVG — साइडबार में दिखेगा",
    mr: "PNG / JPG / SVG — साइडबारमध्ये दिसेल",
    gu: "PNG / JPG / SVG — સાઇડબારમાં દેખાશે",
  },
  "master.company.logoType": { en: "Choose an image file.", hi: "इमेज फ़ाइल चुनें।", mr: "इमेज फाइल निवडा.", gu: "ઇમેજ ફાઇલ પસંદ કરો." },
  "master.company.saved": { en: "Company profile saved", hi: "कंपनी प्रोफ़ाइल सेव हुई", mr: "कंपनी प्रोफाइल सेव्ह झाली", gu: "કંપની પ્રોફાઇલ સેવ થઈ" },
});
