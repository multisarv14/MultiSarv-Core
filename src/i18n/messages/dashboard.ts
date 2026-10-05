import { defineMessages } from "../define";

export const dashboard = defineMessages({
  "dash.subtitle": { en: "{project} — platform overview", hi: "{project} — प्लेटफ़ॉर्म अवलोकन", mr: "{project} — प्लॅटफॉर्मचा आढावा", gu: "{project} — પ્લેટફોર્મ ઝાંખી" },
  "dash.range.7": { en: "7 days", hi: "7 दिन", mr: "7 दिवस", gu: "7 દિવસ" },
  "dash.range.30": { en: "30 days", hi: "30 दिन", mr: "30 दिवस", gu: "30 દિવસ" },
  "dash.range.90": { en: "90 days", hi: "90 दिन", mr: "90 दिवस", gu: "90 દિવસ" },

  // KPI
  "dash.kpi.gmv": { en: "GMV (escrow in)", hi: "GMV (एस्क्रो में)", mr: "GMV (एस्क्रोमध्ये)", gu: "GMV (એસ્ક્રોમાં)" },
  "dash.kpi.revenue": { en: "Platform revenue", hi: "प्लेटफ़ॉर्म कमाई", mr: "प्लॅटफॉर्म उत्पन्न", gu: "પ્લેટફોર્મ આવક" },
  "dash.kpi.lifetime": { en: "{amount} lifetime", hi: "कुल {amount}", mr: "एकूण {amount}", gu: "કુલ {amount}" },
  "dash.kpi.escrow": { en: "Escrow held", hi: "एस्क्रो में रकम", mr: "एस्क्रोमधील रक्कम", gu: "એસ્ક્રોમાં રકમ" },
  "dash.kpi.liability": { en: "live liability", hi: "मौजूदा देनदारी", mr: "सध्याची देणी", gu: "હાલની જવાબદારી" },
  "dash.kpi.released": { en: "Released", hi: "रिलीज़ हुआ", mr: "रिलीज झाले", gu: "રિલીઝ થયું" },
  "dash.kpi.live": { en: "Live tasks", hi: "लाइव टास्क", mr: "लाइव्ह टास्क", gu: "લાઇવ ટાસ્ક" },
  "dash.kpi.openToAccept": { en: "{n} open to accept", hi: "{n} स्वीकार के लिए खुले", mr: "{n} स्वीकारायला उघडे", gu: "{n} સ્વીકારવા ખુલ્લા" },
  "dash.kpi.users": { en: "Users", hi: "यूज़र्स", mr: "युजर्स", gu: "યુઝર્સ" },
  "dash.kpi.newIn": { en: "new in {n}d", hi: "{n} दिन में नए", mr: "{n} दिवसांत नवीन", gu: "{n} દિવસમાં નવા" },

  // Trend
  "dash.trend.title": { en: "Growth", hi: "ग्रोथ", mr: "वाढ", gu: "વૃદ્ધિ" },
  "dash.trend.subtitle": { en: "Daily · {total} in this period", hi: "रोज़ाना · इस अवधि में {total}", mr: "रोजचे · या कालावधीत {total}", gu: "દૈનિક · આ સમયગાળામાં {total}" },
  "dash.metric.gmv": { en: "GMV", hi: "GMV", mr: "GMV", gu: "GMV" },
  "dash.metric.revenue": { en: "Revenue", hi: "कमाई", mr: "उत्पन्न", gu: "આવક" },
  "dash.metric.tasks": { en: "Tasks posted", hi: "पोस्ट हुए टास्क", mr: "पोस्ट झालेले टास्क", gu: "પોસ્ટ થયેલા ટાસ્ક" },
  "dash.metric.signups": { en: "New users", hi: "नए यूज़र्स", mr: "नवीन युजर्स", gu: "નવા યુઝર્સ" },
  "dash.trend.holds": { en: "{n} escrow holds", hi: "{n} एस्क्रो होल्ड", mr: "{n} एस्क्रो होल्ड", gu: "{n} એસ્ક્રો હોલ્ડ" },
  "dash.trend.peak": { en: "Best day: {day}", hi: "सबसे अच्छा दिन: {day}", mr: "सर्वोत्तम दिवस: {day}", gu: "શ્રેષ્ઠ દિવસ: {day}" },

  // Attention
  "dash.attention.title": { en: "Needs attention", hi: "ध्यान दें", mr: "लक्ष द्या", gu: "ધ્યાન આપો" },
  "dash.attention.subtitle": { en: "Admin action pending", hi: "एडमिन कार्रवाई बाकी", mr: "ॲडमिन कृती बाकी", gu: "એડમિન કાર્યવાહી બાકી" },
  "dash.attention.kyc": { en: "KYC to review", hi: "KYC जाँचनी है", mr: "KYC तपासायची", gu: "KYC તપાસવાની" },
  "dash.attention.disputes": { en: "Open disputes", hi: "खुले विवाद", mr: "उघडे वाद", gu: "ખુલ્લા વિવાદ" },
  "dash.attention.payouts": { en: "Payout requests", hi: "पेआउट अनुरोध", mr: "पेआउट विनंत्या", gu: "પેઆઉટ વિનંતી" },
  "dash.attention.toSettle": { en: "{amount} to settle", hi: "{amount} चुकाना बाकी", mr: "{amount} द्यायचे बाकी", gu: "{amount} ચૂકવવાના બાકી" },
  "dash.attention.blocked": { en: "{n} blocked accounts", hi: "{n} ब्लॉक अकाउंट", mr: "{n} ब्लॉक अकाउंट", gu: "{n} બ્લૉક એકાઉન્ટ" },
  "dash.attention.clear": { en: "All clear — nothing pending", hi: "सब ठीक — कुछ बाकी नहीं", mr: "सर्व ठीक — काही बाकी नाही", gu: "બધું બરાબર — કંઈ બાકી નથી" },

  // Roles
  "dash.roles.title": { en: "Users by role", hi: "रोल के अनुसार यूज़र्स", mr: "रोलनुसार युजर्स", gu: "રોલ મુજબ યુઝર્સ" },
  "dash.roles.subtitle": { en: "One user can hold several roles", hi: "एक यूज़र के कई रोल हो सकते हैं", mr: "एका युजरचे अनेक रोल असू शकतात", gu: "એક યુઝરના ઘણા રોલ હોઈ શકે" },
  "dash.roles.new": { en: "+{n} new", hi: "+{n} नए", mr: "+{n} नवीन", gu: "+{n} નવા" },

  // Categories / cities / funnel
  "dash.cat.title": { en: "Top categories", hi: "टॉप कैटेगरी", mr: "टॉप कॅटेगरी", gu: "ટોપ કૅટેગરી" },
  "dash.cat.subtitle": { en: "Tasks posted in this period", hi: "इस अवधि में पोस्ट टास्क", mr: "या कालावधीत पोस्ट झालेले टास्क", gu: "આ સમયગાળામાં પોસ્ટ ટાસ્ક" },
  "dash.cat.tasks": { en: "{n} tasks", hi: "{n} टास्क", mr: "{n} टास्क", gu: "{n} ટાસ્ક" },
  "dash.cat.avg": { en: "avg {amount}", hi: "औसत {amount}", mr: "सरासरी {amount}", gu: "સરેરાશ {amount}" },
  "dash.city.title": { en: "Top cities", hi: "टॉप शहर", mr: "टॉप शहरे", gu: "ટોપ શહેરો" },
  "dash.city.subtitle": { en: "Where tasks are posted", hi: "टास्क कहाँ पोस्ट होते हैं", mr: "टास्क कुठे पोस्ट होतात", gu: "ટાસ્ક ક્યાં પોસ્ટ થાય છે" },
  "dash.funnel.title": { en: "Task funnel", hi: "टास्क फ़नल", mr: "टास्क फनेल", gu: "ટાસ્ક ફનલ" },
  "dash.funnel.subtitle": { en: "Tasks posted in this period", hi: "इस अवधि में पोस्ट टास्क", mr: "या कालावधीत पोस्ट झालेले टास्क", gu: "આ સમયગાળામાં પોસ્ટ ટાસ્ક" },
  "dash.funnel.posted": { en: "Posted", hi: "पोस्ट", mr: "पोस्ट", gu: "પોસ્ટ" },
  "dash.funnel.accepted": { en: "Accepted by a partner", hi: "पार्टनर ने स्वीकारा", mr: "पार्टनरने स्वीकारले", gu: "પાર્ટનરે સ્વીકાર્યું" },
  "dash.funnel.completed": { en: "Completed & paid", hi: "पूरा व भुगतान", mr: "पूर्ण व पैसे दिले", gu: "પૂર્ણ અને ચૂકવાયું" },
  "dash.funnel.cancelRate": { en: "{pct}% cancelled", hi: "{pct}% रद्द", mr: "{pct}% रद्द", gu: "{pct}% રદ" },
  "dash.noData": { en: "No data in this period", hi: "इस अवधि में डेटा नहीं", mr: "या कालावधीत डेटा नाही", gu: "આ સમયગાળામાં ડેટા નથી" },

  // Status card
  "dash.status.title": { en: "Tasks by status", hi: "स्टेटस के अनुसार टास्क", mr: "स्टेटसनुसार टास्क", gu: "સ્ટેટસ મુજબ ટાસ્ક" },
  "dash.status.subtitle": { en: "All-time · click to filter", hi: "अब तक · फ़िल्टर के लिए क्लिक करें", mr: "आजपर्यंत · फिल्टरसाठी क्लिक करा", gu: "અત્યાર સુધી · ફિલ્ટર માટે ક્લિક કરો" },
  "dash.completedTasks": { en: "Completed tasks", hi: "पूरे टास्क", mr: "पूर्ण टास्क", gu: "પૂર્ણ ટાસ્ક" },
  "dash.feeRate": { en: "Fee rate", hi: "फ़ीस दर", mr: "फी दर", gu: "ફી દર" },
});
