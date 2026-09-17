const test=require('node:test'),assert=require('node:assert/strict');
const {uploadImages,deploymentBundle,CHUNK_SIZE}=require('../src/features/converter/media-queue.cjs');
global.FileReader=class {readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:image/png;base64,'+Buffer.from(b).toString('base64');this.onload();});}};
test('queue resumes after a lost chunk response without repeating completed bytes',async()=>{
 const image={filename:'assets/test.png',file:new Blob([Buffer.alloc(CHUNK_SIZE*2+7,42)])};let offset=0,failed=false,initializations=0,completed=0;const sent=[];
 const transport=async(_token,b)=>{if(b.action==='init'){initializations++;return {id:'job'};}if(b.action==='status')return {offset};if(b.action==='chunk'){assert.equal(b.offset,offset);sent.push(b.offset);offset+=Buffer.from(b.data,'base64').length;if(!failed){failed=true;throw Error('Lost response');}return {offset};}if(b.action==='complete'){completed++;return {offset,urls:{[image.filename]:'https://wp.test/image.png'}};}};
 await assert.rejects(uploadImages([image],{connection:{'X-WordPress-URL':'https://one.example',Authorization:'Basic test'},transport}),/Lost response/);
 const urls=await uploadImages([image],{connection:{'X-WordPress-URL':'https://one.example',Authorization:'Basic test'},transport});assert.equal(urls[image.filename],'https://wp.test/image.png');assert.equal(initializations,1);assert.equal(completed,1);assert.deepEqual(sent,[0,CHUNK_SIZE,CHUNK_SIZE*2]);
});
test('deployment removes embedded bytes at all levels without changing page content',()=>{const original={imagesArray:[{data:'huge'}],previewHtml:'preview',parts:{page:{imagesArray:[{data:'huge'}],content:'<img src="photo.png">'}}};const clean=deploymentBundle(original);assert.deepEqual(clean,{parts:{page:{content:'<img src="photo.png">'}}});assert.ok(original.imagesArray);});
test('stopping a queue does not initialize or send the next image',async()=>{let calls=0;await assert.rejects(uploadImages([{filename:'a',file:new Blob(['a'])}],{shouldStop:()=>true,transport:async()=>{calls++;}}),/Stopped/);assert.equal(calls,0);});
test('large page selections remain a queue of independent saves',async()=>{const {deployQueue}=require('../src/features/converter/batch-utils.cjs');let count=0;const rows=Array.from({length:120},(_,i)=>({key:String(i),path:i+'.html',title:'Page '+i,selected:true}));await deployQueue(rows,{convert:async()=>({}),deploy:async()=>({pageId:++count})});assert.equal(count,120);});
test('conflicting image filenames cannot silently replace another page image',async()=>{await assert.rejects(uploadImages([{filename:'logo.png',file:new Blob(['a'])},{filename:'logo.png',file:new Blob(['b'])}]),/Duplicate image path/);});
test('switching WordPress sites starts a separate upload job for the same file',async()=>{
 const image={filename:'same.png',file:new Blob(['abc'])};const calls=[];
 const transport=async(connection,body)=>{calls.push({connection,body});if(body.action==='init')return {id:connection.site};return {offset:3,urls:{'same.png':connection.site+'/same.png'}};};
 const first=await uploadImages([image],{connection:{site:'https://one.example'},transport});
 const second=await uploadImages([image],{connection:{site:'https://two.example'},transport});
 assert.equal(calls.filter(c=>c.body.action==='init').length,2);assert.notEqual(first['same.png'],second['same.png']);
});
