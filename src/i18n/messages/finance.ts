import { defineMessages } from "../define";

/** Payouts, Ledger, Catalog pages. */
export const finance = defineMessages({
  // ── Payouts ──
  "finance.payouts.desc": {
    en: "Worker / business withdrawals — settle by UPI transfer",
    hi: "वर्कर / बिज़नेस निकासी — UPI ट्रांसफ़र करके सेटल करें",
    mr: "वर्कर / बिझनेस पैसे काढणे — UPI ट्रान्सफर करून सेटल करा",
    gu: "વર્કર / બિઝનેસ ઉપાડ — UPI ટ્રાન્સફર કરીને સેટલ કરો",
  },
  "finance.payouts.tab.pending": { en: "Pending", hi: "लंबित", mr: "प्रलंबित", gu: "બાકી" },
  "finance.payouts.col.user": { en: "User", hi: "यूज़र", mr: "युजर", gu: "યુઝર" },
  "finance.payouts.col.amount": { en: "Amount", hi: "रकम", mr: "रक्कम", gu: "રકમ" },
  "finance.payouts.col.requested": { en: "Requested", hi: "अनुरोध", mr: "विनंती", gu: "વિનંતી" },
  "finance.payouts.col.settled": { en: "Settled", hi: "सेटल", mr: "सेटल", gu: "સેટલ" },
  "finance.payouts.col.result": { en: "Result", hi: "परिणाम", mr: "निकाल", gu: "પરિણામ" },
  "finance.payouts.upiCopied": { en: "UPI copied", hi: "UPI कॉपी हो गया", mr: "UPI कॉपी झाले", gu: "UPI કૉપિ થયું" },
  "finance.payouts.markFailed": { en: "Mark failed", hi: "विफल दर्ज करें", mr: "अयशस्वी नोंदवा", gu: "નિષ્ફળ નોંધો" },
  "finance.payouts.paid": { en: "Paid", hi: "भुगतान हुआ", mr: "दिले", gu: "ચૂકવ્યું" },
  "finance.payouts.totalToTransfer": {
    en: "Total to transfer",
    hi: "कुल ट्रांसफ़र राशि",
    mr: "एकूण ट्रान्सफर रक्कम",
    gu: "કુલ ટ્રાન્સફર રકમ",
  },
  "finance.payouts.requestsOldest": {
    en: "{n} requests · oldest first",
    hi: "{n} अनुरोध · पुराने पहले",
    mr: "{n} विनंत्या · जुन्या आधी",
    gu: "{n} વિનંતીઓ · જૂની પહેલા",
  },
  "finance.payouts.emptyPending": {
    en: "No pending payouts",
    hi: "कोई लंबित पेआउट नहीं",
    mr: "प्रलंबित पेआउट नाहीत",
    gu: "કોઈ બાકી પેઆઉટ નથી",
  },
  "finance.payouts.failTitle": {
    en: "Mark payout as failed?",
    hi: "पेआउट को विफल दर्ज करें?",
    mr: "पेआउट अयशस्वी म्हणून नोंदवायचा?",
    gu: "પેઆઉટ નિષ્ફળ તરીકે નોંધવો?",
  },
  "finance.payouts.failDesc": {
    en: "{amount} will go back to the user's wallet balance and they'll get a notification.",
    hi: "{amount} यूज़र के वॉलेट बैलेंस में वापस जाएगा और उन्हें नोटिफ़िकेशन मिलेगा।",
    mr: "{amount} युजरच्या वॉलेट बॅलन्समध्ये परत जाईल आणि त्यांना नोटिफिकेशन जाईल.",
    gu: "{amount} યુઝરના વૉલેટ બેલેન્સમાં પરત જશે અને તેમને નોટિફિકેશન મળશે.",
  },
  "finance.paid.title": {
    en: "Mark payout as paid",
    hi: "पेआउट भुगतान दर्ज करें",
    mr: "पेआउट दिले म्हणून नोंदवा",
    gu: "પેઆઉટ ચૂકવાયું તરીકે નોંધો",
  },
  "finance.paid.confirm": { en: "Confirm paid", hi: "भुगतान पुष्टि करें", mr: "दिले — खात्री करा", gu: "ચૂકવણી પુષ્ટિ કરો" },
  "finance.paid.warning": {
    en: "First transfer from your bank / UPI app, then enter the UTR here. This can't be undone.",
    hi: "पहले बैंक / UPI ऐप से ट्रांसफ़र करें, फिर यहाँ UTR डालें। इसे वापस नहीं किया जा सकता।",
    mr: "आधी बँक / UPI ॲपमधून ट्रान्सफर करा, मग इथे UTR टाका. हे undo होत नाही.",
    gu: "પહેલા બેંક / UPI ઍપથી ટ્રાન્સફર કરો, પછી અહીં UTR નાખો. આ પાછું ફેરવી શકાતું નથી.",
  },
  "finance.paid.utrLabel": {
    en: "UTR / reference number",
    hi: "UTR / रेफ़रेंस नंबर",
    mr: "UTR / रेफरन्स नंबर",
    gu: "UTR / રેફરન્સ નંબર",
  },
  "finance.paid.utrPlaceholder": { en: "e.g. {example}", hi: "जैसे {example}", mr: "उदा. {example}", gu: "દા.ત. {example}" },

  // ── Ledger ──
  "finance.ledger.desc": {
    en: "All money movements — top-up, escrow, fees, refunds, payouts",
    hi: "सभी पैसों का लेन-देन — टॉप-अप, एस्क्रो, फ़ीस, रिफ़ंड, पेआउट",
    mr: "सर्व पैशांच्या हालचाली — टॉप-अप, एस्क्रो, फी, परतावे, पेआउट",
    gu: "બધી નાણાંની લેવડદેવડ — ટૉપ-અપ, એસ્ક્રો, ફી, રિફંડ, પેઆઉટ",
  },
  "finance.ledger.col.type": { en: "Type", hi: "प्रकार", mr: "प्रकार", gu: "પ્રકાર" },
  "finance.ledger.col.detail": { en: "Detail", hi: "विवरण", mr: "तपशील", gu: "વિગત" },
  "finance.ledger.col.when": { en: "When", hi: "कब", mr: "केव्हा", gu: "ક્યારે" },
  "finance.ledger.userFilter": { en: "User: {id}", hi: "यूज़र: {id}", mr: "युजर: {id}", gu: "યુઝર: {id}" },
  "finance.ledger.allTypes": { en: "All types", hi: "सभी प्रकार", mr: "सर्व प्रकार", gu: "બધા પ્રકાર" },
  "finance.ledger.empty": { en: "No transactions", hi: "कोई लेन-देन नहीं", mr: "व्यवहार नाहीत", gu: "કોઈ વ્યવહાર નથી" },

  // ── Catalog ──
  "finance.catalog.desc": {
    en: "Service catalog — the list customers see in the app",
    hi: "सर्विस कैटलॉग — ऐप में ग्राहकों को दिखने वाली सूची",
    mr: "सर्व्हिस कॅटलॉग — ॲपमध्ये ग्राहकांना दिसणारी यादी",
    gu: "સર્વિસ કૅટલોગ — ઍપમાં ગ્રાહકોને દેખાતી યાદી",
  },
  "finance.catalog.readOnly": {
    en: "Categories are read-only (client writes are blocked in Firestore rules). To change them, edit {file} and run {cmd}.",
    hi: "कैटेगरी केवल पढ़ने के लिए हैं (Firestore rules में client write बंद)। बदलने के लिए {file} एडिट करके {cmd} चलाएँ।",
    mr: "कॅटेगरी फक्त वाचण्यासाठी आहेत (Firestore rules मध्ये client write बंद). बदल करायला {file} एडिट करून {cmd} चालवा.",
    gu: "કૅટેગરી ફક્ત વાંચવા માટે છે (Firestore rules માં client write બંધ). બદલવા માટે {file} એડિટ કરીને {cmd} ચલાવો.",
  },
  "finance.catalog.empty": { en: "No categories", hi: "कोई कैटेगरी नहीं", mr: "कॅटेगरी नाहीत", gu: "કોઈ કૅટેગરી નથી" },
  "finance.catalog.emptyHint": { en: "Run {cmd}.", hi: "{cmd} चलाएँ।", mr: "{cmd} चालवा.", gu: "{cmd} ચલાવો." },
  "finance.catalog.from": { en: "from", hi: "शुरुआत", mr: "पासून", gu: "થી શરૂ" },
});
