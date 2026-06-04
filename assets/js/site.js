
(function(){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.14});
  document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});
})();
function afOpenModal(){var m=document.getElementById('afModal');if(m){m.classList.add('open');document.body.style.overflow='hidden';}}
function afCloseModal(){var m=document.getElementById('afModal');if(m){m.classList.remove('open');document.body.style.overflow='';}}
function afOverlay(e){if(e.target.classList.contains('af-modal-overlay'))afCloseModal();}
document.addEventListener('keydown',function(e){if(e.key==='Escape')afCloseModal();});
