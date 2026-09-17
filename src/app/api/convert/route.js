import conversion from '@/lib/conversion/site-bundle.cjs';
import { authorize, readJson, wordpress, failure } from '@/lib/wordpress/api';
export const runtime = 'nodejs';
export async function POST(request) {
  try { const credentials=authorize(request); await wordpress('/status',{},credentials); const input=await readJson(request); return Response.json(await conversion.convertSite(input)); }
  catch(error) { return failure(error); }
}
