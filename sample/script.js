function initPage(){
  requestAnimationFrame(()=>document.getElementById('hero').classList.add('loaded'));
  const statementImg=document.querySelector('.statement img');
  const introPh=document.querySelector('.intro .ph img');
  const whyPh=document.querySelector('.why .ph img');
  window.addEventListener('scroll',()=>{
    if(statementImg){
      const sec=statementImg.closest('.statement');
      const r=sec.getBoundingClientRect();
      if(r.bottom>0 && r.top<window.innerHeight){
        const progress=(window.innerHeight-r.top)/(window.innerHeight+r.height);
        const shift=Math.max(-40,Math.min(40,(progress-0.5)*80));
        statementImg.style.transform='translateY('+shift+'px) scale(1.12)';
      }
    }
  },{passive:true});
  const hb=document.getElementById('hamburger'),mn=document.getElementById('mobileNav'),sc=document.getElementById('scrim');
  function toggle(){const open=mn.classList.toggle('open');sc.classList.toggle('open',open);hb.classList.toggle('open',open);hb.setAttribute('aria-expanded',open);}
  hb.addEventListener('click',toggle);
  sc.addEventListener('click',toggle);
  mn.querySelectorAll('a').forEach(a=>a.addEventListener('click',toggle));
  const els=document.querySelectorAll('.reveal');
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in')}),{threshold:.15});
  els.forEach(e=>io.observe(e));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPage);else initPage();
