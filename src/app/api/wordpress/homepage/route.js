import {authorize,readJson,wordpress,failure} from '@/lib/wordpress/api';
export const runtime='nodejs';
export async function POST(request){try{const credentials=authorize(request);return Response.json(await wordpress('/homepage',{method:'POST',body:await readJson(request,8192)},credentials),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
