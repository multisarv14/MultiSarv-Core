import { defineMessages } from "../define";

/** Sagle pages madhe vaparle janare shabd — nav, status, roles, errors, toasts. */
export const common = defineMessages({
  // ── Navigation ──
  "nav.group.overview": { en: "Overview", hi: "अवलोकन", mr: "आढावा", gu: "ઝાંખી" },
  "nav.group.operations": { en: "Operations", hi: "संचालन", mr: "कामकाज", gu: "કામગીરી" },
  "nav.group.finance": { en: "Finance", hi: "वित्त", mr: "वित्त", gu: "નાણાં" },
  "nav.group.engage": { en: "Engage", hi: "संवाद", mr: "संवाद", gu: "સંવાદ" },
  "nav.group.catalog": { en: "Catalog", hi: "कैटलॉग", mr: "कॅटलॉग", gu: "કૅટલોગ" },
  "nav.dashboard": { en: "Dashboard", hi: "डैशबोर्ड", mr: "डॅशबोर्ड", gu: "ડૅશબોર્ડ" },
  "nav.users": { en: "Users", hi: "यूज़र्स", mr: "युजर्स", gu: "યુઝર્સ" },
  "nav.kyc": { en: "KYC review", hi: "KYC समीक्षा", mr: "KYC तपासणी", gu: "KYC સમીક્ષા" },
  "nav.tasks": { en: "Tasks", hi: "टास्क", mr: "टास्क", gu: "ટાસ્ક" },
  "nav.disputes": { en: "Disputes", hi: "विवाद", mr: "वाद", gu: "વિવાદ" },
  "nav.payouts": { en: "Payouts", hi: "पेआउट", mr: "पेआउट", gu: "પેઆઉટ" },
  "nav.ledger": { en: "Ledger", hi: "लेजर", mr: "लेजर", gu: "લેજર" },
  "nav.notifications": { en: "Notifications", hi: "नोटिफ़िकेशन", mr: "नोटिफिकेशन", gu: "નોટિફિકેશન" },
  "nav.catalog": { en: "Categories", hi: "कैटेगरी", mr: "कॅटेगरी", gu: "કૅટેગરી" },

  // ── Header / shell ──
  "shell.search": { en: "Search…", hi: "खोजें…", mr: "शोधा…", gu: "શોધો…" },
  "shell.refresh": { en: "Refresh data", hi: "डेटा रीफ़्रेश करें", mr: "डेटा रिफ्रेश करा", gu: "ડેટા રિફ્રેશ કરો" },
  "shell.theme": { en: "Theme", hi: "थीम", mr: "थीम", gu: "થીમ" },
  "shell.language": { en: "Language", hi: "भाषा", mr: "भाषा", gu: "ભાષા" },
  "shell.signOut": { en: "Sign out", hi: "साइन आउट", mr: "साइन आउट", gu: "સાઇન આઉટ" },
  "shell.admin": { en: "Admin", hi: "एडमिन", mr: "ॲडमिन", gu: "એડમિન" },
  "shell.projects": { en: "Projects", hi: "प्रोजेक्ट", mr: "प्रोजेक्ट", gu: "પ્રોજેક્ટ" },
  "shell.allProjects": { en: "All projects", hi: "सभी प्रोजेक्ट", mr: "सर्व प्रोजेक्ट", gu: "બધા પ્રોજેક્ટ" },
  "shell.switchProject": { en: "Switch project", hi: "प्रोजेक्ट बदलें", mr: "प्रोजेक्ट बदला", gu: "પ્રોજેક્ટ બદલો" },
  "shell.notConfigured": { en: "Not configured", hi: "कॉन्फ़िगर नहीं", mr: "कॉन्फिगर नाही", gu: "કૉન્ફિગર નથી" },

  // ── Command palette ──
  "palette.placeholder": {
    en: "Page, project, phone number or task id…",
    hi: "पेज, प्रोजेक्ट, फ़ोन नंबर या टास्क id…",
    mr: "पेज, प्रोजेक्ट, फोन नंबर किंवा टास्क id…",
    gu: "પેજ, પ્રોજેક્ટ, ફોન નંબર અથવા ટાસ્ક id…",
  },
  "palette.noMatch": { en: "No matches", hi: "कुछ नहीं मिला", mr: "काही जुळले नाही", gu: "કંઈ મળ્યું નહીં" },
  "palette.hint.page": { en: "Page", hi: "पेज", mr: "पेज", gu: "પેજ" },
  "palette.hint.users": { en: "Users", hi: "यूज़र्स", mr: "युजर्स", gu: "યુઝર્સ" },
  "palette.hint.taskId": { en: "Task id", hi: "टास्क id", mr: "टास्क id", gu: "ટાસ્ક id" },
  "palette.hint.userId": { en: "User id", hi: "यूज़र id", mr: "युजर id", gu: "યુઝર id" },
  "palette.hint.project": { en: "Project", hi: "प्रोजेक्ट", mr: "प्रोजेक्ट", gu: "પ્રોજેક્ટ" },
  "palette.openTask": { en: "Open task {id}", hi: "टास्क {id} खोलें", mr: "टास्क {id} उघडा", gu: "ટાસ્ક {id} ખોલો" },
  "palette.openUser": { en: "Open user {id}", hi: "यूज़र {id} खोलें", mr: "युजर {id} उघडा", gu: "યુઝર {id} ખોલો" },
  "palette.searchPhone": { en: "Search phone {phone}", hi: "फ़ोन {phone} खोजें", mr: "फोन {phone} शोधा", gu: "ફોન {phone} શોધો" },

  // ── Generic actions / words ──
  "act.confirm": { en: "Confirm", hi: "पुष्टि करें", mr: "खात्री करा", gu: "પુષ્ટિ કરો" },
  "act.cancel": { en: "Cancel", hi: "रद्द करें", mr: "रद्द करा", gu: "રદ કરો" },
  "act.close": { en: "Close", hi: "बंद करें", mr: "बंद करा", gu: "બંધ કરો" },
  "act.save": { en: "Save", hi: "सेव करें", mr: "सेव्ह करा", gu: "સેવ કરો" },
  "act.send": { en: "Send", hi: "भेजें", mr: "पाठवा", gu: "મોકલો" },
  "act.retry": { en: "Retry", hi: "फिर कोशिश करें", mr: "पुन्हा प्रयत्न करा", gu: "ફરી પ્રયાસ કરો" },
  "act.loadMore": { en: "Load more", hi: "और देखें", mr: "आणखी पाहा", gu: "વધુ જુઓ" },
  "act.exportCsv": { en: "Export CSV", hi: "CSV डाउनलोड", mr: "CSV डाउनलोड", gu: "CSV ડાઉનલોડ" },
  "act.copy": { en: "Copy", hi: "कॉपी करें", mr: "कॉपी करा", gu: "કૉપિ કરો" },
  "act.copied": { en: "Copied", hi: "कॉपी हो गया", mr: "कॉपी झाले", gu: "કૉપિ થયું" },
  "act.viewAll": { en: "View all", hi: "सब देखें", mr: "सर्व पाहा", gu: "બધું જુઓ" },
  "act.clear": { en: "Clear", hi: "हटाएँ", mr: "काढा", gu: "દૂર કરો" },
  "word.all": { en: "All", hi: "सभी", mr: "सर्व", gu: "બધા" },
  "word.yes": { en: "Yes", hi: "हाँ", mr: "हो", gu: "હા" },
  "word.no": { en: "No", hi: "नहीं", mr: "नाही", gu: "ના" },
  "word.none": { en: "None", hi: "कोई नहीं", mr: "काहीही नाही", gu: "કોઈ નહીં" },
  "word.total": { en: "Total", hi: "कुल", mr: "एकूण", gu: "કુલ" },
  "word.optional": { en: "optional", hi: "वैकल्पिक", mr: "ऐच्छिक", gu: "વૈકલ્પિક" },
  "word.reasonOptional": { en: "Reason (optional)", hi: "कारण (वैकल्पिक)", mr: "कारण (ऐच्छिक)", gu: "કારણ (વૈકલ્પિક)" },
  "word.unnamed": { en: "Unnamed", hi: "बेनाम", mr: "नाव नाही", gu: "નામ નથી" },

  // ── Tables / states ──
  "table.empty": { en: "Nothing found", hi: "कुछ नहीं मिला", mr: "काही सापडले नाही", gu: "કંઈ મળ્યું નહીં" },
  "table.shown": { en: "{n} shown", hi: "{n} दिखाए गए", mr: "{n} दाखवले", gu: "{n} બતાવ્યા" },
  "table.end": { en: "End of list", hi: "सूची समाप्त", mr: "यादी संपली", gu: "યાદી પૂરી" },
  "state.loadFailed": { en: "Couldn't load data", hi: "डेटा लोड नहीं हुआ", mr: "डेटा लोड झाला नाही", gu: "ડેટા લોડ ન થયો" },

  // ── Time ──
  "time.justNow": { en: "just now", hi: "अभी", mr: "आत्ताच", gu: "હમણાં" },
  "time.days": { en: "{n} days", hi: "{n} दिन", mr: "{n} दिवस", gu: "{n} દિવસ" },
  "time.lastDays": { en: "last {n} days", hi: "पिछले {n} दिन", mr: "मागील {n} दिवस", gu: "છેલ્લા {n} દિવસ" },

  // ── Roles ──
  "role.customer": { en: "Customer", hi: "ग्राहक", mr: "ग्राहक", gu: "ગ્રાહક" },
  "role.worker": { en: "Worker", hi: "वर्कर", mr: "वर्कर", gu: "વર્કર" },
  "role.business": { en: "Business", hi: "बिज़नेस", mr: "बिझनेस", gu: "બિઝનેસ" },
  "role.admin": { en: "Admin", hi: "एडमिन", mr: "ॲडमिन", gu: "એડમિન" },
  "role.customers": { en: "Customers", hi: "ग्राहक", mr: "ग्राहक", gu: "ગ્રાહકો" },
  "role.workers": { en: "Workers", hi: "वर्कर्स", mr: "वर्कर्स", gu: "વર્કર્સ" },
  "role.businesses": { en: "Businesses", hi: "बिज़नेस", mr: "बिझनेस", gu: "બિઝનેસ" },

  // ── Task status ──
  "status.task.posted": { en: "Posted", hi: "पोस्ट हुआ", mr: "पोस्ट झाला", gu: "પોસ્ટ થયો" },
  "status.task.accepted": { en: "Accepted", hi: "स्वीकार हुआ", mr: "स्वीकारला", gu: "સ્વીકાર્યો" },
  "status.task.navigating": { en: "On the way", hi: "रास्ते में", mr: "मार्गावर", gu: "રસ્તામાં" },
  "status.task.arrived": { en: "Arrived", hi: "पहुँच गया", mr: "पोहोचला", gu: "પહોંચ્યો" },
  "status.task.inProgress": { en: "In progress", hi: "काम जारी", mr: "काम चालू", gu: "કામ ચાલુ" },
  "status.task.proofUploaded": { en: "Proof uploaded", hi: "प्रूफ़ अपलोड", mr: "पुरावा अपलोड", gu: "પુરાવો અપલોડ" },
  "status.task.submitted": { en: "Submitted", hi: "सबमिट हुआ", mr: "सबमिट झाला", gu: "સબમિટ થયો" },
  "status.task.paid": { en: "Paid", hi: "भुगतान हुआ", mr: "पैसे दिले", gu: "ચૂકવાયું" },
  "status.task.cancelled": { en: "Cancelled", hi: "रद्द", mr: "रद्द", gu: "રદ" },
  "status.task.disputed": { en: "Disputed", hi: "विवादित", mr: "वादात", gu: "વિવાદમાં" },
  "status.task.live": { en: "Live", hi: "लाइव", mr: "लाइव्ह", gu: "લાઇવ" },

  // ── KYC status ──
  "status.kyc.notSubmitted": { en: "No KYC", hi: "KYC नहीं", mr: "KYC नाही", gu: "KYC નથી" },
  "status.kyc.pending": { en: "Pending", hi: "लंबित", mr: "प्रलंबित", gu: "બાકી" },
  "status.kyc.verified": { en: "Verified", hi: "सत्यापित", mr: "पडताळले", gu: "ચકાસાયેલ" },
  "status.kyc.rejected": { en: "Rejected", hi: "अस्वीकृत", mr: "नाकारले", gu: "નકાર્યું" },

  // ── Dispute status ──
  "status.dispute.open": { en: "Open", hi: "खुला", mr: "उघडा", gu: "ખુલ્લો" },
  "status.dispute.underReview": { en: "Under review", hi: "समीक्षा में", mr: "तपासणीत", gu: "સમીક્ષામાં" },
  "status.dispute.resolvedCustomer": { en: "Customer won", hi: "ग्राहक के पक्ष में", mr: "ग्राहकाच्या बाजूने", gu: "ગ્રાહકની તરફેણમાં" },
  "status.dispute.resolvedWorker": { en: "Partner won", hi: "पार्टनर के पक्ष में", mr: "पार्टनरच्या बाजूने", gu: "પાર્ટનરની તરફેણમાં" },
  "status.dispute.closed": { en: "Closed", hi: "बंद", mr: "बंद", gu: "બંધ" },

  // ── Payout status ──
  "status.payout.requested": { en: "Requested", hi: "अनुरोधित", mr: "विनंती केली", gu: "વિનંતી કરી" },
  "status.payout.paid": { en: "Paid", hi: "भुगतान हुआ", mr: "दिले", gu: "ચૂકવાયું" },
  "status.payout.failed": { en: "Failed", hi: "विफल", mr: "अयशस्वी", gu: "નિષ્ફળ" },

  // ── Transaction types ──
  "txn.topUp": { en: "Top-up", hi: "टॉप-अप", mr: "टॉप-अप", gu: "ટૉપ-અપ" },
  "txn.escrowHold": { en: "Escrow hold", hi: "एस्क्रो होल्ड", mr: "एस्क्रो होल्ड", gu: "એસ્ક્રો હોલ્ડ" },
  "txn.escrowRelease": { en: "Escrow release", hi: "एस्क्रो रिलीज़", mr: "एस्क्रो रिलीज", gu: "એસ્ક્રો રિલીઝ" },
  "txn.platformFee": { en: "Platform fee", hi: "प्लेटफ़ॉर्म फ़ीस", mr: "प्लॅटफॉर्म फी", gu: "પ્લેટફોર્મ ફી" },
  "txn.refund": { en: "Refund", hi: "रिफ़ंड", mr: "परतावा", gu: "રિફંડ" },
  "txn.payout": { en: "Payout", hi: "पेआउट", mr: "पेआउट", gu: "પેઆઉટ" },

  // ── Errors (lib/firebase errorMessage) ──
  "err.notAdminClaim": {
    en: "Permission denied — this account has no admin claim.",
    hi: "अनुमति नहीं — इस अकाउंट को एडमिन अधिकार नहीं है।",
    mr: "परवानगी नाही — या अकाउंटला ॲडमिन अधिकार नाही.",
    gu: "પરવાનગી નથી — આ એકાઉન્ટને એડમિન અધિકાર નથી.",
  },
  "err.permission": { en: "Permission denied", hi: "अनुमति नहीं", mr: "परवानगी नाही", gu: "પરવાનગી નથી" },
  "err.tooMany": {
    en: "Too many attempts. Try again after a while.",
    hi: "बहुत ज़्यादा प्रयास। थोड़ी देर बाद फिर कोशिश करें।",
    mr: "खूप प्रयत्न झाले. थोड्या वेळाने पुन्हा प्रयत्न करा.",
    gu: "ઘણા પ્રયાસ થયા. થોડી વાર પછી ફરી પ્રયાસ કરો.",
  },
  "err.unauthorizedDomain": {
    en: "Add this domain in Firebase Auth → Settings → Authorized domains.",
    hi: "यह डोमेन Firebase Auth → Settings → Authorized domains में जोड़ें।",
    mr: "हे डोमेन Firebase Auth → Settings → Authorized domains मध्ये जोडा.",
    gu: "આ ડોમેન Firebase Auth → Settings → Authorized domains માં ઉમેરો.",
  },
  "err.badApiKey": {
    en: "Invalid API key — put the Firebase web app config in .env.local.",
    hi: "API key गलत है — Firebase वेब ऐप का config .env.local में डालें।",
    mr: "API key चुकीची आहे — Firebase वेब ॲपचा config .env.local मध्ये टाका.",
    gu: "API key ખોટી છે — Firebase વેબ ઍપનો config .env.local માં મૂકો.",
  },
  "err.needsIndex": {
    en: "A Firestore index is needed — open the link in the console to create it.",
    hi: "Firestore index चाहिए — console की लिंक खोलकर index बनाएँ।",
    mr: "Firestore index लागतो — console मधली लिंक उघडून index बनवा.",
    gu: "Firestore index જોઈએ — console ની લિંક ખોલીને index બનાવો.",
  },
  "err.notPossible": { en: "Action not possible.", hi: "यह कार्य संभव नहीं।", mr: "ही कृती शक्य नाही.", gu: "આ ક્રિયા શક્ય નથી." },
  "err.unavailable": {
    en: "Network / server unavailable. Try again.",
    hi: "नेटवर्क / सर्वर उपलब्ध नहीं। फिर कोशिश करें।",
    mr: "नेटवर्क / सर्व्हर उपलब्ध नाही. पुन्हा प्रयत्न करा.",
    gu: "નેટવર્ક / સર્વર ઉપલબ્ધ નથી. ફરી પ્રયાસ કરો.",
  },
  "err.network": {
    en: "Can't reach Firebase. Check your internet (or start the emulator).",
    hi: "Firebase तक नहीं पहुँच सके। इंटरनेट जाँचें (या emulator चालू करें)।",
    mr: "Firebase पर्यंत पोहोचता आले नाही. इंटरनेट तपासा (किंवा emulator चालू करा).",
    gu: "Firebase સુધી પહોંચી શકાયું નહીં. ઇન્ટરનેટ તપાસો (અથવા emulator ચાલુ કરો).",
  },
  "err.generic": {
    en: "Something went wrong. Try again.",
    hi: "कुछ गलत हो गया। फिर कोशिश करें।",
    mr: "काहीतरी चुकले. पुन्हा प्रयत्न करा.",
    gu: "કંઈક ખોટું થયું. ફરી પ્રયાસ કરો.",
  },

  // ── Toasts (hooks/queries) ──
  "toast.kycVerified": { en: "KYC verified", hi: "KYC सत्यापित", mr: "KYC पडताळले", gu: "KYC ચકાસાયું" },
  "toast.kycRejected": { en: "KYC rejected", hi: "KYC अस्वीकृत", mr: "KYC नाकारले", gu: "KYC નકાર્યું" },
  "toast.userBlocked": {
    en: "User blocked — sessions revoked",
    hi: "यूज़र ब्लॉक — सभी सेशन बंद",
    mr: "युजर ब्लॉक — सर्व सेशन बंद",
    gu: "યુઝર બ્લૉક — બધા સેશન બંધ",
  },
  "toast.userUnblocked": { en: "User unblocked", hi: "यूज़र अनब्लॉक", mr: "युजर अनब्लॉक", gu: "યુઝર અનબ્લૉક" },
  "toast.kycReturned": {
    en: "KYC returned to the user with your reason",
    hi: "KYC कारण के साथ यूज़र को वापस भेजा",
    mr: "KYC कारणासह युजरला परत पाठवले",
    gu: "KYC કારણ સાથે યુઝરને પાછું મોકલ્યું",
  },
  "toast.userUpdated": {
    en: "Profile updated — user notified",
    hi: "प्रोफ़ाइल अपडेट — यूज़र को सूचना भेजी",
    mr: "प्रोफाइल अपडेट — युजरला कळवले",
    gu: "પ્રોફાઇલ અપડેટ — યુઝરને જાણ કરી",
  },
  "toast.userDeleted": { en: "User deleted", hi: "यूज़र डिलीट हुआ", mr: "युजर डिलीट झाला", gu: "યુઝર ડિલીટ થયો" },
  "toast.disputeUpdated": { en: "Dispute updated", hi: "विवाद अपडेट हुआ", mr: "वाद अपडेट झाला", gu: "વિવાદ અપડેટ થયો" },
  "toast.payoutPaid": { en: "Payout marked paid", hi: "पेआउट भुगतान दर्ज", mr: "पेआउट दिले म्हणून नोंदवले", gu: "પેઆઉટ ચૂકવાયું તરીકે નોંધ્યું" },
  "toast.payoutFailed": {
    en: "Payout failed — amount refunded to wallet",
    hi: "पेआउट विफल — रकम वॉलेट में वापस",
    mr: "पेआउट अयशस्वी — रक्कम वॉलेटमध्ये परत",
    gu: "પેઆઉટ નિષ્ફળ — રકમ વૉલેટમાં પરત",
  },
  "toast.taskCancelled": {
    en: "Task cancelled — escrow refunded",
    hi: "टास्क रद्द — एस्क्रो रिफ़ंड",
    mr: "टास्क रद्द — एस्क्रो परत",
    gu: "ટાસ્ક રદ — એસ્ક્રો રિફંડ",
  },
});
