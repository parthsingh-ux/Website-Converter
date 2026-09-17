import { authorize, readJson, wordpress, failure } from '@/lib/wordpress/api';
export const runtime = 'nodejs';
export async function POST(request) {
 try { const credentials=authorize(request); return Response.json(await wordpress('/media',{method:'POST',body:await readJson(request,512*1024)},credentials), {headers:{'Cache-Control':'no-store'}}); } catch(error) { return failure(error); }
}
