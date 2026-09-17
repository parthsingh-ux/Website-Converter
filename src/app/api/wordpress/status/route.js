import { authorize, readJson, wordpress, failure } from '@/lib/wordpress/api';
export const runtime = 'nodejs';
export async function GET(request) {
 try { const credentials=authorize(request); return Response.json(await wordpress('/status',{},credentials), {headers:{'Cache-Control':'no-store'}}); } catch(error) { return failure(error); }
}
