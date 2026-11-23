'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
    (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 192 && p[1] === 0 && p[2] === 0) || (p[0] === 192 && p[1] === 0 && p[2] === 2) ||
    (p[0] === 198 && p[1] === 51 && p[2] === 100) || (p[0] === 203 && p[1] === 0 && p[2] === 113);
}
function isPublicIP(ip) {
  if (net.isIP(ip) === 4) return !isPrivateIPv4(ip);
  if (net.isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPublicIP(v.split(':').at(-1));
    return !(v === '::' || v === '::1' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('ff') || v.startsWith('2001:db8:'));
  }
  return false;
}
function safeHttpsUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2000) throw new Error('Invalid URL');
  let u;
  try { u = new URL(raw); } catch { throw new Error('Invalid URL'); }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443'))
    throw new Error('Only public HTTPS URLs without credentials or custom ports are accepted');
  const h = u.hostname.toLowerCase();
  if (net.isIP(h) || !h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost'))
    throw new Error('IP addresses and internal hosts are forbidden');
  return u;
}
async function publicDnsVerified(raw) {
  const u = safeHttpsUrl(raw);
  const resolved = await dns.lookup(u.hostname, { all: true, verbatim: true });
  if (!resolved.length || resolved.some(x => !isPublicIP(x.address))) throw new Error('Target DNS includes a private/reserved IP address');
  return u;
}
function detectSensitive(message) {
  const checks = [
    /\b(?:password|secret key|api[_ -]?key|client[_ -]?secret)\s*[:=]/i,
    /\b(?:bearer\s+[a-z0-9._~+\/-]{12,}|sk-(?:proj-)?[a-z0-9_-]{12,})/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\b(?:MRN|medical record number|patient ID|national ID)\s*[:#-]?\s*\w{4,}/i,
    /\b(?:date of birth|DOB)\s*[:#-]?\s*\d/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  ];
  return checks.some(r => r.test(message));
}
function summarizeUi(text = '') {
  if (/captcha|hcaptcha|recaptcha|cloudflare.{0,80}(security|verification)|verify.{0,30}(human|robot)|drag the slider|slider.{0,35}puzzle|complete security verification|quick security check/i.test(text)) return 'verification_required';
  if (/temporarily unavailable|endpoint serves.+chat page only|access denied|rate limit|too many requests|daily limit reached|unusual traffic/i.test(text)) return 'unavailable_or_limited';
  if (/sign in to continue|log in to continue|create an account to continue|sign up to continue/i.test(text)) return 'login_required';
  return null;
}
function browserRouteHostAllowed(raw) {
  const u=safeHttpsUrl(raw),h=u.hostname.toLowerCase();
  // Policy decisions grounded in published terms as reviewed 2026-11-23.
  const forbidden=['duck.ai','duckduckgo.com','qwen.ai','chat.qwen.ai','z.ai','chat.z.ai',
    'gemini.google.com','tryingopen.com'];
  return !forbidden.some(b=>h===b||h.endsWith('.'+b));
}
module.exports = { isPublicIP, safeHttpsUrl, publicDnsVerified, detectSensitive, summarizeUi, browserRouteHostAllowed };
