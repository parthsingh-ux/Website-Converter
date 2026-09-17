import client from './client.cjs';
export const { authorize, readJson, wordpress } = client;
export function failure(error) {
  return Response.json({ error: error.message || 'Request failed.', details:error.details }, { status: error.status || 400, headers:{'Cache-Control':'no-store'} });
}
