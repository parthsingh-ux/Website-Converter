import modes from '@/lib/conversion/header-footer.cjs';
import conversion from '@/lib/conversion/site-bundle.cjs';
import {authorize,readJson,wordpress,failure} from '@/lib/wordpress/api';
export const runtime='nodejs';
export async function POST(request){try{const credentials=authorize(request); await wordpress('/status',{},credentials);const input=await readJson(request);return Response.json(modes.headerFooterMode(conversion.normalizeBundle(input.bundle,input.editor,input.siteKey),input.sharedParts));}catch(error){return failure(error);}}
