const test=require('node:test');const assert=require('node:assert/strict');
const {authorize,readJson,connection,wordpress}=require('../src/lib/wordpress/client.cjs');
const {isPublicAddress,safeLookup,publicFetch}=require('../src/lib/wordpress/public-transport.cjs');
const credentials={url:'https://example.com/wordpress',authorization:'Basic '+Buffer.from('admin:private').toString('base64')};
test('requires request credentials and ignores legacy server credentials',()=>{
 assert.throws(()=>authorize(new Request('https://studio.local')),/WordPress site URL/);
 const headers={'X-WordPress-URL':credentials.url,Authorization:credentials.authorization};
 assert.deepEqual(authorize(new Request('https://studio.local',{headers})),credentials);
 assert.throws(()=>authorize(new Request('https://studio.local',{headers:{...headers,Origin:'https://evil.example'}})),/Cross-origin/);
 assert.throws(()=>connection({...credentials,authorization:'Bearer old-token'}),/Application Password/);
});
test('preserves subdirectory and rejects insecure or internal destinations',()=>{
 assert.equal(connection(credentials).url,'https://example.com/wordpress');
 for(const url of ['http://example.com','https://user:password@example.com','https://127.0.0.1','https://10.0.0.1','https://[::1]','https://[::ffff:127.0.0.1]','https://example.com:8443','https://example.com?redirect=1'])assert.throws(()=>connection({...credentials,url}));
});
test('public IP policy excludes private, link local, mapped and transition addresses',()=>{
 for(const ip of ['127.1.2.3','10.2.3.4','169.254.169.254','172.16.5.1','192.168.1.2','100.64.1.1','::1','::ffff:10.0.0.1','fc00::1','fe80::1','2002:7f00::1','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(isPublicAddress(ip),true,ip);
});
test('DNS validates all answers and pins returned socket addresses',async()=>{
 const dns=require('node:dns'),original=dns.lookup;
 try{dns.lookup=(_h,_o,cb)=>cb(null,[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]);await assert.rejects(new Promise((r,j)=>safeLookup('test',{},(e,a)=>e?j(e):r(a))),/public/);
 dns.lookup=(_h,_o,cb)=>cb(null,[{address:'8.8.8.8',family:4}]);assert.deepEqual(await new Promise((r,j)=>safeLookup('test',{all:true},(e,a)=>e?j(e):r(a))),[{address:'8.8.8.8',family:4}]);}finally{dns.lookup=original;}
});
test('concurrent calls keep destinations and credentials isolated',async()=>{
 const seen=[];const transport=async(url,options)=>{seen.push({url,options});return Response.json({pageId:23});};
 await Promise.all([wordpress('/deploy',{method:'POST',body:{pageId:23}},credentials,transport),wordpress('/status',{}, {url:'https://second.example',authorization:'Basic '+Buffer.from('second:password').toString('base64')},transport)]);
 assert.equal(seen[0].url,'https://example.com/wordpress/wp-json/wcs/v1/deploy');assert.equal(seen[0].options.headers.Authorization,credentials.authorization);assert.equal(seen[1].url,'https://second.example/wp-json/wcs/v1/status');assert.notEqual(seen[0].options.headers.Authorization,seen[1].options.headers.Authorization);assert.equal(seen[0].options.redirect,'error');await assert.rejects(wordpress('//attacker.test',{},credentials),/Unsupported/);
});
test('upstream failures stay failures',async()=>{await assert.rejects(wordpress('/status',{},credentials,async()=>Response.json({message:'Plugin not active'},{status:404})),/Plugin not active/);await assert.rejects(wordpress('/status',{},credentials,async()=>new Response('<html>Error</html>')),/did not return JSON/);});
test('request size is bounded while streaming',async()=>{const request=new Request('https://studio.local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'too long'})});await assert.rejects(readJson(request,5),/exceeds/);});
