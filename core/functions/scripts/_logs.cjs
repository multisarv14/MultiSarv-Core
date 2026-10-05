require("./_admin.cjs");
const { GoogleAuth } = require("google-auth-library");
(async () => {
  const c = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data } = await c.request({
    url: "https://logging.googleapis.com/v2/entries:list", method: "POST",
    data: { resourceNames: [`projects/${process.env.P}`], orderBy: "timestamp desc", pageSize: 15,
      filter: `timestamp>="${since}" AND severity>=WARNING` },
  });
  for (const e of data.entries || []) console.log(e.timestamp, e.severity, e.resource.labels.service_name || e.resource.type, e.httpRequest?.status ?? "", (e.textPayload || e.jsonPayload?.message || e.protoPayload?.status?.message || "").slice(0, 220));
  console.log("entries:", (data.entries || []).length);
})().catch((e) => console.error("ERR", e.response?.status, e.response?.data?.error?.message || e.message));
