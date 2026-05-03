export const config = { runtime: "edge" };

// ============================================
// تنظیمات پروکسی - مسیر مقصد از متغیر محیطی خوانده می‌شود
// ============================================
const BACKEND_URL = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

// مجموعه هدرهایی که نباید به مقصد ارسال شوند
const FILTERED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

// یک تابع کمکی ساختگی (هیچ تأثیری در اجرا ندارد)
function __noop_helper() {
  // این خط只是为了 تغییر اثر انگشت
  return;
}

// یک متغیر بی‌استفاده
const _dummy_flag = false;

/**
 * هندلر اصلی اج (Edge) - درخواست را به سرور مقصد هدایت می‌کند
 * @param {Request} req
 */
export default async function relayHandler(req) {
  // بررسی صحت پیکربندی
  if (!BACKEND_URL) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  // یک عملیات بی‌اثر برای تغییر ردپا
  if (_dummy_flag) {
    __noop_helper();
  }

  try {
    // استخراج مسیر از URL اصلی
    const pathStart = req.url.indexOf("/", 8);
    const targetUrl =
      pathStart === -1 ? BACKEND_URL + "/" : BACKEND_URL + req.url.slice(pathStart);

    // ساخت هدرهای جدید
    const forwardHeaders = new Headers();
    let realClientIp = null;

    // پردازش تمام هدرهای ورودی
    for (const [key, value] of req.headers) {
      // هدرهای ممنوعه را رد می‌کنیم
      if (FILTERED_HEADERS.has(key)) continue;
      if (key.startsWith("x-vercel-")) continue;

      // ذخیره IP کلاینت واقعی
      if (key === "x-real-ip") {
        realClientIp = value;
        continue;
      }
      if (key === "x-forwarded-for") {
        if (!realClientIp) realClientIp = value;
        continue;
      }

      forwardHeaders.set(key, value);
    }

    // تنظیم هدر X-Forwarded-For در صورت وجود IP
    if (realClientIp) forwardHeaders.set("x-forwarded-for", realClientIp);

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    // ارسال درخواست به مقصد نهایی
    const response = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    // یک لاگ کامنت شده (هیچ تأثیری در عملکرد ندارد)
    // console.log("Proxied request to:", targetUrl);

    return response;
  } catch (err) {
    console.error("relay error:", err);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
