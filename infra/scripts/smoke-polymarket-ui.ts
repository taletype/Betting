const baseUrl = (process.env.SMOKE_BASE_URL ?? "https://betting-web-ten.vercel.app").replace(/\/+$/, "");

const paths = [
  "/",
  "/polymarket",
  "/polymarket?view=all",
  "/polymarket?status=all&view=all",
  "/login?next=/polymarket",
  "/login?next=/polymarket&ref=TESTCODE",
];

const forbiddenHtml = [
  /SUPABASE_SERVICE_ROLE/i,
  /SERVICE_ROLE/i,
  /前往 Polymarket/,
  /Open on Polymarket/,
];

const fail = (message: string): never => {
  throw new Error(message);
};

const assertHtml = (path: string, html: string): void => {
  for (const pattern of forbiddenHtml) {
    if (pattern.test(html)) fail(`${path} contains forbidden text: ${pattern}`);
  }

  if (baseUrl.includes("betting-web-ten.vercel.app") && /127\.0\.0\.1|localhost/i.test(html)) {
    fail(`${path} contains localhost development URL`);
  }

  if (path.startsWith("/polymarket")) {
    if (!/熱門市場|Smart Feed/.test(html)) fail(`${path} missing Smart Feed control`);
    if (!/全部市場|All Markets/.test(html)) fail(`${path} missing All Markets control`);
    if (!/來源：Polymarket|Source: Polymarket/.test(html) && !/暫時未有|No synced/.test(html)) {
      fail(`${path} missing market provenance or safe empty state`);
    }
  }

  if (path.startsWith("/login")) {
    if (!/以電郵連結登入|Magic link/.test(html)) fail(`${path} missing login form`);
    if (!/發送登入連結|Auth 尚未設定|Send magic link/.test(html)) fail(`${path} missing magic-link button or unavailable state`);
    if (path.includes("ref=TESTCODE") && !/TESTCODE/.test(html)) fail(`${path} missing referral banner`);
  }
};

const main = async (): Promise<void> => {
  for (const path of paths) {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, { redirect: "follow" });
    const html = await response.text();
    console.log(`CHECK ${url} ${response.status}`);
    if (response.status !== 200) fail(`${url} returned ${response.status}`);
    assertHtml(path, html);
  }

  console.log(`Polymarket UI smoke passed for ${baseUrl}`);
};

void main();
