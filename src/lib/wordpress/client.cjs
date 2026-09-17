 'use strict';
const { publicFetch, validateSiteUrl } = require('./public-transport.cjs');
function connection(input = {}) {
  const url = validateSiteUrl(input.url);
  const authorization = input.authorization;
  if (typeof authorization !== 'string' || !/^Basic [A-Za-z0-9+/]+=*$/.test(authorization) || authorization.length > 4096) throw Object.assign(Error('Enter your WordPress username and Application Password.'), {status:401});
  const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 1 || !decoded.slice(colon + 1).trim() || /[\r\n\0]/.test(decoded)) throw Object.assign(Error('Enter your WordPress username and Application Password.'), {status:401});
  return {url, authorization};
}
function authorize(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw Object.assign(Error('Cross-origin requests are not allowed.'), {status:403});
  return connection({url:request.headers.get('x-wordpress-url'), authorization:request.headers.get('authorization')});
}
async function readJson(request, limit = 30 * 1024 * 1024) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw Object.assign(Error('Send application/json.'),{status:415});
  const reader = request.body?.getReader(); if (!reader) throw Error('Request body is missing.');
  const chunks=[]; let length=0;
  while (true) { const {value,done}=await reader.read(); if(done)break; length+=value.length; if(length>limit){await reader.cancel();throw Object.assign(Error(`Request exceeds ${Math.round(limit/1024)} KB.`),{status:413});}chunks.push(Buffer.from(value)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Error('Invalid JSON.'); }
}
async function wordpress(path, { method='GET', body } = {}, credentials, transport = publicFetch) {
  if (!/^\/(?:status|pages|deploy|media|identity|homepage)(?:\?.*)?$/.test(path)) throw Error('Unsupported bridge operation.');
  const config = connection(credentials);
  const response = await transport(`${config.url}/wp-json/wcs/v1${path}`, {method,headers:{Authorization:config.authorization,'Content-Type':'application/json'},body:body ? JSON.stringify(body) : undefined,redirect:'error',signal:AbortSignal.timeout(120000),cache:'no-store'});
  const text = await response.text(); let result;
  try { result=JSON.parse(text); } catch {
    let msg = `WordPress did not return JSON (HTTP ${response.status}).`;
    if (response.status === 502 || response.status === 504) {
      msg = `WordPress did not return JSON (HTTP ${response.status} Server Timeout). The server exceeded its request limit. Retry the same operation; completed image uploads and saved pages are reused.`;
    } else if (response.status === 404) {
      msg = 'WordPress did not return JSON (HTTP 404 Not Found). Check that the Converter Studio Bridge plugin is installed and activated on your WordPress site.';
    }
    throw Object.assign(Error(msg), {status: response.status >= 400 ? response.status : 502});
  }
  if (!response.ok) throw Object.assign(Error(result.message || result.error || 'WordPress rejected the request.'), {status:response.status,details:result.data});
  return result;
}
module.exports = { authorize, readJson, connection, wordpress };
