
(function(){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.14});
  document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});
})();
function afOpenModal(){var m=document.getElementById('afModal');if(m){m.classList.add('open');document.body.style.overflow='hidden';}}
function afCloseModal(){var m=document.getElementById('afModal');if(m){m.classList.remove('open');document.body.style.overflow='';}}
function afOverlay(e){if(e.target.classList.contains('af-modal-overlay'))afCloseModal();}
document.addEventListener('keydown',function(e){if(e.key==='Escape')afCloseModal();});

(function(){
  var d = document.getElementById('countdown'); if(!d) return;
  document.body.classList.add('has-topbar');
  function next(){
    var n=new Date(); var t=new Date(n);
    var day=n.getDay(); var add=(2-day+7)%7;
    if(add===0 && (n.getHours()>20 || (n.getHours()===20 && n.getMinutes()>=30))) add=7;
    t.setDate(t.getDate()+add); t.setHours(20,30,0,0); return t;
  }
  function pad(x){return (x<10?'0':'')+x;}
  var target=next();
  function tick(){
    var ms=target-new Date(); if(ms<0){target=next(); ms=target-new Date();}
    var s=Math.floor(ms/1000);
    document.getElementById('cd-d').textContent=pad(Math.floor(s/86400));
    document.getElementById('cd-h').textContent=pad(Math.floor(s/3600)%24);
    document.getElementById('cd-m').textContent=pad(Math.floor(s/60)%60);
    document.getElementById('cd-s').textContent=pad(s%60);
    var date=target.toLocaleDateString('fr-FR',{day:'numeric',month:'long'});
    document.querySelectorAll('[data-webin-date]').forEach(function(e){e.textContent=date;});
  }
  setInterval(tick,1000); tick();
})();
function afOpenWebin(){var m=document.getElementById('afModalWebin');if(m){m.classList.add('open');document.body.style.overflow='hidden';}}
function afCloseWebin(){var m=document.getElementById('afModalWebin');if(m){m.classList.remove('open');document.body.style.overflow='';}}

function reelsScroll(dir){
  var t=document.getElementById('reelsTrack'); if(!t) return;
  var c=t.querySelector('.reel'); var step=c?c.offsetWidth+16:260;
  t.scrollBy({left:dir*step*2,behavior:'smooth'});
}
(function(){
  var vids=document.querySelectorAll('.reel video'); if(!vids.length) return;
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){
      var v=e.target;
      if(e.isIntersecting){ v.play().catch(function(){}); } else { v.pause(); }
    });
  },{threshold:.35});
  vids.forEach(function(v){io.observe(v);});
})();

/* Cursor spotlight (met a jour --mx/--my) */
(function(){
  if(window.matchMedia("(max-width:900px)").matches) return;
  var raf=null,mx=window.innerWidth/2,my=window.innerHeight/2;
  document.addEventListener('mousemove',function(e){
    mx=e.clientX; my=e.clientY;
    if(raf) return;
    raf=requestAnimationFrame(function(){
      document.documentElement.style.setProperty('--mx',mx+'px');
      document.documentElement.style.setProperty('--my',my+'px');
      raf=null;
    });
  });
})();
/* Tilt 3D subtil */
(function(){
  document.querySelectorAll('[data-tilt]').forEach(function(el){
    el.addEventListener('mousemove',function(e){
      var r=el.getBoundingClientRect();
      var x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
      var rx=(y-.5)*-5, ry=(x-.5)*5;
      el.style.transform='perspective(900px) rotateX('+rx+'deg) rotateY('+ry+'deg) translateY(-4px)';
    });
    el.addEventListener('mouseleave',function(){el.style.transform='';});
  });
})();

/* Manifesto scroll-driven (met a jour le grand chiffre + titre + dots) */
(function(){
  var panels=document.querySelectorAll('.mf-panel');
  var num=document.getElementById('mfNum');
  var title=document.getElementById('mfTitle');
  var dots=document.querySelectorAll('.mf-progress .d');
  if(!panels.length || !num) return;
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(e.isIntersecting){
        var i=Array.prototype.indexOf.call(panels,e.target);
        num.textContent=e.target.dataset.num || (i+1);
        title.textContent=e.target.dataset.title || '';
        dots.forEach(function(d,j){d.classList.toggle('active', j===i);});
      }
    });
  },{threshold:[.35], rootMargin:'-30% 0px -30% 0px'});
  panels.forEach(function(p){io.observe(p);});
})();
