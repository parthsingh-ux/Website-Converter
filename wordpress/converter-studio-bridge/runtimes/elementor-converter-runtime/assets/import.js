(function () {
  'use strict';
  const button=document.getElementById('ecb-import');if(!button)return;
  const file=document.getElementById('ecb-file'),status=document.getElementById('ecb-status'),notes=document.getElementById('ecb-notes');
  button.addEventListener('click',async()=>{
    if(!file.files[0]){status.textContent='Choose an Elementor Converter JSON file.';return;}
    button.disabled=true;status.textContent='Checking compatibility and importing…';notes.textContent='';
    try{
      const data=JSON.parse(await file.files[0].text());if(data.ecb?.format!=='elementor-converter-bundle')throw new Error('Choose a JSON generated in Elementor Free or Pro mode.');
      notes.textContent=(data.ecb.warnings||[]).join('\n\n');
      const response=await fetch(window.ecbImport.url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-WP-Nonce':window.ecbImport.nonce},body:JSON.stringify(data)});
      const result=await response.json();if(!response.ok)throw new Error(result.message||'Import failed.');
      status.textContent='Imported draft template “'+result.title+'” ('+result.elements+' elements). ';
      const link=document.createElement('a');link.href=result.editUrl;link.textContent='Open in Elementor';status.appendChild(link);
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  });
})();
