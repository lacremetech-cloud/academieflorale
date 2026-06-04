#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genere le funnel Academie Florale v3 :
- CSS/JS partages (fond anime, CTA premium, modale)
- Pages no-scroll mobile : titre + (video|photo) + CTA dans le 1er ecran
Lancer : python3 build.py"""
import os
ROOT=os.path.dirname(os.path.abspath(__file__))
for d in ("pages","assets/css","assets/js"):
    os.makedirs(os.path.join(ROOT,d),exist_ok=True)

# =================================================== CSS
CSS = r"""
:root{
  --orange:#F64B0C; --orange-dk:#D63E08; --orange-br:#FF6A2B;
  --ink:#221A14; --muted:#6E625A; --line:#EADFD1;
  --cream:#FBF6EF; --card:#FFFFFF;
  --serif:'Fraunces',Georgia,serif; --sans:'Jost',system-ui,sans-serif; --hand:'Caveat',cursive;
  --maxw:1180px;
  --glow:rgba(246,75,12,.55); --glow-soft:rgba(246,75,12,.22);
}
*{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;}
body{font-family:var(--sans);color:var(--ink);background:var(--cream);line-height:1.6;font-size:17px;overflow-x:hidden;-webkit-font-smoothing:antialiased;}
img{max-width:100%;display:block;}
a{color:inherit;text-decoration:none;}

/* FOND DYNAMIQUE PREMIUM */
.af-bg{position:fixed;inset:0;z-index:-4;overflow:hidden;background:linear-gradient(180deg,#FFF6EE 0%, #FBF3EA 50%, #F5EBDD 100%);}
.af-bg-fx{position:fixed;inset:0;z-index:-4;pointer-events:none;background:
  radial-gradient(ellipse 80% 50% at 50% 10%, rgba(246,75,12,.13) 0%, rgba(246,75,12,.05) 30%, transparent 62%),
  radial-gradient(ellipse 60% 45% at 86% 82%, rgba(255,138,61,.13) 0%, transparent 52%),
  radial-gradient(ellipse 52% 42% at 12% 66%, rgba(255,184,128,.13) 0%, transparent 52%);}
.af-spot{position:fixed;top:-12%;left:50%;transform:translateX(-50%);width:min(1000px,120vw);height:62vh;z-index:-4;pointer-events:none;filter:blur(30px);animation:afBreath 9s ease-in-out infinite;background:radial-gradient(ellipse at center, rgba(246,75,12,.16) 0%, rgba(246,75,12,.05) 36%, transparent 66%);}
.af-orb{position:fixed;z-index:-4;pointer-events:none;border-radius:50%;filter:blur(48px);}
.af-orb1{top:13%;left:-8%;width:300px;height:300px;animation:afFloat1 13s ease-in-out infinite;background:radial-gradient(circle,rgba(255,160,100,.34),transparent 70%);}
.af-orb2{bottom:6%;right:-9%;width:350px;height:350px;animation:afFloat2 16s ease-in-out infinite;background:radial-gradient(circle,rgba(246,75,12,.20),transparent 70%);}
.af-orb3{top:48%;left:42%;width:260px;height:260px;animation:afFloat1 18s ease-in-out infinite reverse;background:radial-gradient(circle,rgba(255,120,61,.12),transparent 70%);}
.af-grain{position:fixed;inset:0;z-index:-3;pointer-events:none;opacity:.05;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
@keyframes afBreath{0%,100%{opacity:.75;transform:translateX(-50%) scale(1);}50%{opacity:1;transform:translateX(-50%) scale(1.12);}}
@keyframes afFloat1{0%,100%{transform:translate(0,0) scale(1);}33%{transform:translate(28px,-22px) scale(1.1);}66%{transform:translate(-16px,24px) scale(.95);}}
@keyframes afFloat2{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(-26px,-30px) scale(1.14);}}
@media (prefers-reduced-motion: reduce){.af-spot,.af-orb{animation:none;}}

/* LAYOUT */
.wrap{width:100%;max-width:var(--maxw);margin:0 auto;padding:0 22px;}
.narrow{max-width:780px;}
.eyebrow{font-size:12.5px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:var(--orange);}
h1,h2,h3{font-family:var(--serif);font-weight:400;line-height:1.05;letter-spacing:-.015em;font-optical-sizing:auto;}
h1{font-size:clamp(2.3rem,6.6vw,4.5rem);}
h1 em,h2 em{font-style:italic;color:var(--orange);}
h2{font-size:clamp(1.9rem,4.6vw,3.1rem);}
h3{font-size:clamp(1.2rem,2.4vw,1.55rem);}
p.lead{font-size:clamp(1.05rem,2.2vw,1.3rem);color:var(--muted);}

/* NAV */
header.nav{position:relative;z-index:5;}
.nav-inner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0;}
.nav-logo img{height:46px;width:auto;filter:drop-shadow(0 6px 16px rgba(246,75,12,.12));}
.nav-tag{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);}
@media(max-width:640px){.nav-tag{display:none;}.nav-logo img{height:38px;}}

/* BADGE */
.af-badge{display:inline-flex;align-items:center;gap:9px;padding:7px 16px;border-radius:100px;background:rgba(246,75,12,.09);border:1px solid rgba(246,75,12,.28);font-weight:600;font-size:clamp(10.5px,2.4vw,12px);letter-spacing:.14em;text-transform:uppercase;color:var(--orange);}
.af-badge .dot{width:7px;height:7px;border-radius:50%;background:var(--orange);box-shadow:0 0 10px var(--orange);animation:afPulse 2s ease-in-out infinite;}
@keyframes afPulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.55;transform:scale(1.3);}}

/* BOUTONS PREMIUM */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;position:relative;overflow:hidden;background:linear-gradient(135deg,var(--orange-br) 0%, var(--orange) 100%);color:#fff;font-family:var(--sans);font-weight:600;font-size:15.5px;letter-spacing:.01em;padding:16px 30px;border:none;border-radius:100px;cursor:pointer;white-space:nowrap;transition:transform .2s,box-shadow .3s;animation:afGlow 3.2s ease-in-out infinite;box-shadow:0 0 22px var(--glow-soft),0 0 45px var(--glow-soft),0 8px 22px rgba(246,75,12,.22);}
.btn:hover{transform:translateY(-2px);box-shadow:0 0 0 4px rgba(246,75,12,.14),0 0 40px var(--glow),0 14px 34px rgba(246,75,12,.4);}
.btn:active{transform:translateY(0);}
.btn::before{content:"";position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);transition:left .6s ease;}
.btn:hover::before{left:100%;}
.btn .arrow{display:inline-block;font-size:1.15em;animation:afArrow 1.6s ease-in-out infinite;}
.btn:hover .arrow{animation-play-state:paused;transform:translateX(5px);}
.btn.full{width:100%;}
@keyframes afArrow{0%,100%{transform:translateX(0);}50%{transform:translateX(4px);}}
@keyframes afGlow{0%,100%{box-shadow:0 0 22px var(--glow-soft),0 0 45px var(--glow-soft),0 8px 22px rgba(246,75,12,.22);}50%{box-shadow:0 0 34px var(--glow-soft),0 0 72px var(--glow-soft),0 10px 28px rgba(246,75,12,.3);}}
@media (prefers-reduced-motion: reduce){.btn{animation:none;}.btn .arrow{animation:none;}}
@media(max-width:560px){.btn{width:100%;padding:15px 26px;font-size:14.5px;}}

.af-hw{font-family:var(--hand);font-weight:700;font-size:clamp(19px,4.6vw,25px);color:var(--orange);transform:rotate(-3deg);display:inline-block;margin-top:12px;text-shadow:0 0 12px rgba(246,75,12,.18);animation:afWobble 4s ease-in-out infinite;}
@keyframes afWobble{0%,100%{transform:rotate(-3deg) translateY(0);}50%{transform:rotate(-2deg) translateY(-2px);}}

.stars-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:14px;margin-top:18px;}
.stars-line .st{color:var(--orange);letter-spacing:.12em;}
.stars-line b{color:var(--ink);font-weight:600;}

/* HERO (page 01) */
.hero{position:relative;z-index:2;padding:14px 0 70px;min-height:78vh;display:flex;align-items:center;}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(28px,5vw,72px);align-items:center;width:100%;}
.hero-copy .af-badge{margin-bottom:18px;}
.hero-copy h1{margin-bottom:18px;}
.hero-copy .lead{margin-bottom:6px;max-width:32ch;}
.cta-wrap{display:flex;flex-direction:column;align-items:flex-start;margin-top:22px;}
.hero-photo{position:relative;}
.hero-photo .frame{position:relative;border-radius:230px 230px 18px 18px;overflow:hidden;aspect-ratio:3/3.7;box-shadow:0 44px 90px -42px rgba(70,40,15,.5);}
.hero-photo .frame img{width:100%;height:100%;object-fit:cover;}
.hero-photo .pill{position:absolute;left:-14px;bottom:36px;background:var(--card);border-radius:100px;padding:12px 20px;box-shadow:0 18px 40px -16px rgba(70,40,15,.45);display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:500;}
.hero-photo .pill .dot{width:9px;height:9px;border-radius:50%;background:var(--orange);box-shadow:0 0 0 4px rgba(246,75,12,.15);}

/* PAGE HERO (centre) */
.phero{position:relative;z-index:2;padding:30px 0 8px;text-align:center;}
.phero .af-badge{margin-bottom:14px;}
.phero h1{margin-bottom:14px;}
.phero p.lead{margin:0 auto 6px;max-width:48ch;}

/* FORM systeme.io */
.sio-form input:not([type=submit]):not([type=checkbox]):not([type=radio]){width:100%;font-family:var(--sans);font-size:16px;padding:15px 16px;margin-bottom:10px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);}
.sio-form input:focus{outline:none;border-color:var(--orange);box-shadow:0 0 0 3px rgba(246,75,12,.12);}
.sio-form button,.sio-form input[type=submit]{width:100%;background:linear-gradient(135deg,var(--orange-br),var(--orange));color:#fff;border:none;font-family:var(--sans);font-weight:600;font-size:15.5px;padding:16px;border-radius:100px;cursor:pointer;transition:filter .18s;}
.sio-form button:hover,.sio-form input[type=submit]:hover{filter:brightness(1.05);}

/* MODALE */
.af-modal-overlay{position:fixed;inset:0;background:rgba(34,26,20,.55);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;z-index:9999;padding:20px;}
.af-modal-overlay.open{display:flex;animation:afFade .3s ease;}
.af-modal{background:linear-gradient(180deg,#fff,#FFFaf4);border:1px solid var(--line);border-radius:24px;padding:clamp(28px,6vw,42px) clamp(24px,5vw,38px);max-width:460px;width:100%;position:relative;max-height:90vh;overflow-y:auto;box-shadow:0 30px 90px -28px rgba(70,40,15,.55);animation:afSlideUp .4s cubic-bezier(.16,1,.3,1);}
.af-modal-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:#fff;color:var(--ink);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .2s,background .2s;}
.af-modal-close:hover{transform:rotate(90deg);background:#FAF1E7;}
.af-modal-head{text-align:center;margin-bottom:14px;}
.af-modal-head .af-badge{margin-bottom:14px;}
.af-modal-head h3{font-size:clamp(1.5rem,5vw,1.9rem);margin-bottom:8px;}
.af-modal-head p{font-size:14.5px;color:var(--muted);}
.af-modal-foot{margin-top:14px;text-align:center;font-size:12px;color:var(--muted);}
@keyframes afFade{from{opacity:0;}to{opacity:1;}}
@keyframes afSlideUp{from{opacity:0;transform:translateY(40px) scale(.96);}to{opacity:1;transform:none;}}

/* TRUST */
.trust{position:relative;z-index:2;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(255,255,255,.45);}
.trust .wrap{display:flex;align-items:center;justify-content:center;gap:10px 26px;flex-wrap:wrap;padding:18px 22px;text-align:center;}
.trust span{font-size:13.5px;color:var(--muted);letter-spacing:.04em;}
.trust b{color:var(--ink);font-weight:600;}
.trust .sep{color:var(--orange);}
@media(max-width:640px){.trust .sep{display:none;}.trust .wrap{gap:8px 18px;}}

/* SECTIONS */
section.block{position:relative;z-index:2;padding:clamp(54px,9vw,104px) 0;}
.block.tight{padding-top:0;}
.sec-head{max-width:680px;margin:0 auto clamp(34px,5vw,56px);text-align:center;}
.sec-head .af-badge,.sec-head .eyebrow{margin-bottom:14px;}
.sec-head p{color:var(--muted);margin-top:14px;}

.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.bcard{background:rgba(255,255,255,.85);border:1px solid var(--line);border-radius:18px;padding:30px 26px;transition:transform .2s,box-shadow .2s;}
.bcard:hover{transform:translateY(-4px);box-shadow:0 26px 50px -30px rgba(70,40,15,.4);}
.bnum{font-family:var(--serif);font-size:2.4rem;color:var(--orange);line-height:1;margin-bottom:14px;}
.bcard h3{margin-bottom:8px;}
.bcard p{color:var(--muted);font-size:15.5px;}

.founder{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(28px,5vw,64px);align-items:center;}
.founder-photo{border-radius:18px;overflow:hidden;aspect-ratio:4/4.6;box-shadow:0 36px 70px -40px rgba(70,40,15,.5);}
.founder-photo img{width:100%;height:100%;object-fit:cover;}
.founder-copy .af-badge{margin-bottom:14px;}
.founder-copy h2{margin-bottom:18px;}
.founder-copy p{color:var(--muted);margin-bottom:16px;}
.founder-copy .quote{font-family:var(--serif);font-style:italic;font-size:clamp(1.3rem,2.6vw,1.7rem);color:var(--ink);line-height:1.3;border-left:3px solid var(--orange);padding-left:18px;margin:22px 0;}
.founder-copy .sign{font-family:var(--hand);font-size:1.6rem;color:var(--orange);}

.gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
.gallery figure{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:4/5;}
.gallery img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease;}
.gallery figure:hover img{transform:scale(1.06);}

.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;text-align:center;}
.stat .n{font-family:var(--serif);font-size:clamp(1.9rem,4vw,2.8rem);color:var(--orange);line-height:1;}
.stat .l{font-size:14px;color:var(--muted);margin-top:8px;}

/* VIDEO */
.video-embed{position:relative;margin:0 auto;border-radius:18px;overflow:hidden;aspect-ratio:16/9;background:#1a1410;box-shadow:0 30px 70px -36px rgba(70,40,15,.55);max-width:900px;}
.video-embed iframe,.video-embed video{position:absolute;inset:0;width:100%;height:100%;border:0;}
.video-embed .poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.6;}
.video-embed .play{position:absolute;inset:0;margin:auto;width:74px;height:74px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;box-shadow:0 14px 36px -10px var(--glow);cursor:pointer;animation:afGlow 3.2s ease-in-out infinite;}
.video-embed .play::before{content:"";border-left:20px solid #fff;border-top:13px solid transparent;border-bottom:13px solid transparent;margin-left:5px;}
.video-embed .ph-label{position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#fff;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.78;}
.phero .video-embed{max-width:760px;margin:16px auto 0;}

/* THUMB MOBILE (page opt-in + explication/call) */
.hero-thumb,.phero-thumb-photo{display:none;}
@media(max-width:900px){
  .hero-thumb,.phero-thumb-photo{display:block;width:min(190px,50vw);aspect-ratio:3/3.4;margin:12px auto;border-radius:110px 110px 12px 12px;overflow:hidden;box-shadow:0 18px 40px -22px rgba(70,40,15,.5);}
  .hero-thumb img,.phero-thumb-photo img{width:100%;height:100%;object-fit:cover;display:block;}
}

/* EMBED SLOT (calendrier) */
.embed-slot{max-width:820px;margin:0 auto;border:1px dashed var(--line);border-radius:20px;background:rgba(255,255,255,.7);min-height:520px;display:flex;align-items:center;justify-content:center;text-align:center;padding:30px;}
.embed-slot .inner{max-width:420px;}
.embed-slot .ic{font-size:2.4rem;}
.embed-slot p{color:var(--muted);margin-top:10px;font-size:15px;}
.embed-slot code{background:#fff;border:1px solid var(--line);border-radius:6px;padding:2px 7px;font-size:13px;}

/* STEPS */
.steps{counter-reset:s;display:grid;gap:14px;max-width:720px;margin:0 auto;}
.step{display:flex;gap:18px;background:rgba(255,255,255,.85);border:1px solid var(--line);border-radius:16px;padding:20px 22px;text-align:left;}
.step .num{counter-increment:s;flex:0 0 auto;width:40px;height:40px;border-radius:50%;background:rgba(246,75,12,.1);color:var(--orange);font-family:var(--serif);font-size:1.25rem;display:flex;align-items:center;justify-content:center;}
.step .num::before{content:counter(s);}
.step h3{font-size:1.15rem;margin-bottom:4px;}
.step p{color:var(--muted);font-size:15px;}

/* CHECKLIST */
.checklist{list-style:none;max-width:620px;margin:0 auto;display:grid;gap:10px;text-align:left;}
.checklist li{position:relative;padding:14px 16px 14px 48px;background:rgba(255,255,255,.85);border:1px solid var(--line);border-radius:12px;font-size:15.5px;}
.checklist li::before{content:"\2713";position:absolute;left:16px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:50%;background:var(--orange);color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;}

/* TESTI */
.testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.testi-card{background:rgba(255,255,255,.88);border:1px solid var(--line);border-radius:18px;padding:26px 24px;text-align:left;}
.testi-card .st{color:var(--orange);letter-spacing:.15em;font-size:14px;margin-bottom:12px;}
.testi-card p{font-size:15.5px;color:var(--ink);margin-bottom:16px;}
.testi-card .who{display:flex;align-items:center;gap:12px;}
.testi-card .who .av{width:42px;height:42px;border-radius:50%;background:rgba(246,75,12,.12);color:var(--orange);font-family:var(--serif);font-size:1.1rem;display:flex;align-items:center;justify-content:center;}
.testi-card .who b{display:block;font-size:14.5px;}
.testi-card .who span{font-size:12.5px;color:var(--muted);}

/* DIFF */
.diff{display:grid;gap:14px;max-width:820px;margin:0 auto;text-align:left;}
.diff-row{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card);}
.diff-row>div{padding:18px 20px;}
.diff-row .old{background:#FAF3EA;color:var(--muted);}
.diff-row .new{border-left:3px solid var(--orange);}
.diff-row .lab{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px;}
.diff-row .old .lab{color:#B6A695;}
.diff-row .new .lab{color:var(--orange);font-weight:600;}
@media(max-width:640px){.diff-row{grid-template-columns:1fr;}.diff-row .new{border-left:none;border-top:3px solid var(--orange);}}

/* CTA FINAL */
.cta-box{background:var(--ink);color:#fff;border-radius:26px;padding:clamp(40px,6vw,72px) clamp(26px,5vw,64px);text-align:center;overflow:hidden;position:relative;}
.cta-box::before{content:"";position:absolute;width:60%;height:160%;right:-10%;top:-30%;background:radial-gradient(circle,rgba(246,75,12,.55),transparent 60%);filter:blur(40px);}
.cta-box>*{position:relative;z-index:1;}
.cta-box h2{color:#fff;margin-bottom:16px;}
.cta-box p{color:rgba(255,255,255,.8);max-width:50ch;margin:0 auto 28px;}

/* PANEL */
.panel{background:rgba(255,255,255,.9);border:1px solid var(--line);border-radius:22px;padding:clamp(30px,5vw,52px);box-shadow:0 30px 60px -34px rgba(70,40,15,.4);text-align:center;}
.panel .big-ic{width:74px;height:74px;border-radius:50%;background:rgba(246,75,12,.12);color:var(--orange);font-size:2rem;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;}
.panel p{color:var(--muted);margin:12px auto 0;max-width:52ch;}

/* FOOTER */
footer{position:relative;z-index:2;background:rgba(255,255,255,.7);border-top:1px solid var(--line);padding:36px 0;}
.foot-inner{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;}
.foot-logo img{height:38px;}
.foot-links{display:flex;gap:22px;flex-wrap:wrap;}
.foot-links a{font-size:13.5px;color:var(--muted);}
.foot-links a:hover{color:var(--orange);}
.foot-legal{font-size:11.5px;color:#A99E92;margin-top:16px;max-width:74ch;}

.reveal{opacity:0;transform:translateY(24px);transition:opacity .7s ease,transform .7s ease;}
.reveal.in{opacity:1;transform:none;}
@media (prefers-reduced-motion: reduce){.reveal{opacity:1;transform:none;}}

/* ============ RESPONSIVE ============ */
@media(max-width:900px){
  /* HERO opt-in : NO SCROLL */
  .hero{min-height:calc(100svh - 80px);display:flex;align-items:center;padding:4px 0 22px;}
  .hero-grid{grid-template-columns:1fr;gap:0;}
  .hero-photo{display:none;}
  .hero-copy{text-align:center;width:100%;}
  .hero-copy .lead{margin-left:auto;margin-right:auto;}
  .cta-wrap{align-items:center;width:100%;}
  /* PHERO : video/photo + CTA dans le 1er ecran */
  .phero{min-height:calc(100svh - 80px);display:flex;flex-direction:column;justify-content:center;padding:14px 0 22px;}
  .phero .panel{width:100%;}
  .founder{grid-template-columns:1fr;}
  .founder-photo{order:-1;max-width:420px;margin:0 auto;width:100%;}
  .founder-copy{text-align:center;}
  .founder-copy .quote{text-align:left;}
  .grid3{grid-template-columns:1fr;max-width:480px;margin:0 auto;}
  .testi-grid{grid-template-columns:1fr;max-width:480px;margin:0 auto;}
  .stats{grid-template-columns:repeat(2,1fr);gap:28px 18px;}
}
@media(max-width:560px){
  body{font-size:16px;}
  .gallery{grid-template-columns:repeat(2,1fr);}
  .stars-line{justify-content:center;font-size:12.5px;margin-top:14px;}
  .hero-copy h1{font-size:clamp(1.85rem,8.4vw,2.35rem);line-height:1.08;margin-bottom:12px;}
  .hero-copy .lead{font-size:.97rem;line-height:1.5;margin-bottom:4px;max-width:36ch;}
  .phero h1{font-size:clamp(1.85rem,8.4vw,2.35rem);line-height:1.08;margin-bottom:10px;}
  .phero p.lead{font-size:.96rem;line-height:1.45;margin-bottom:6px;}
  .af-badge{padding:6px 14px;font-size:10.5px;margin-bottom:10px;}
  .af-hw{font-size:19px;margin-top:8px;}
  .nav-inner{padding:12px 0;}
  .nav-logo img{height:34px;}
  .video-embed .play{width:58px;height:58px;}
  .video-embed .play::before{border-left-width:16px;border-top-width:10px;border-bottom-width:10px;}
  .phero .video-embed{margin-top:12px;}
  .panel{padding:24px 20px;}
  .panel .big-ic{width:58px;height:58px;font-size:1.5rem;margin-bottom:12px;}
  section.block{padding:46px 0;}
}
"""

# =================================================== JS
JS = r"""
(function(){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.14});
  document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});
})();
function afOpenModal(){var m=document.getElementById('afModal');if(m){m.classList.add('open');document.body.style.overflow='hidden';}}
function afCloseModal(){var m=document.getElementById('afModal');if(m){m.classList.remove('open');document.body.style.overflow='';}}
function afOverlay(e){if(e.target.classList.contains('af-modal-overlay'))afCloseModal();}
document.addEventListener('keydown',function(e){if(e.key==='Escape')afCloseModal();});
"""

# =================================================== SHELL
HEAD = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{{TITLE}}</title>
<meta name="description" content="{{DESC}}">
<link rel="icon" type="image/png" href="/assets/img/logo-orange.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Jost:wght@300;400;500;600&family=Caveat:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>
<div class="af-bg" aria-hidden="true"></div>
<div class="af-bg-fx" aria-hidden="true"></div>
<div class="af-spot" aria-hidden="true"></div>
<div class="af-orb af-orb1" aria-hidden="true"></div>
<div class="af-orb af-orb2" aria-hidden="true"></div>
<div class="af-orb af-orb3" aria-hidden="true"></div>
<div class="af-grain" aria-hidden="true"></div>
<header class="nav"><div class="wrap"><div class="nav-inner">
  <a class="nav-logo" href="/pages/01-inscription.html" aria-label="Academie Florale"><img src="/assets/img/logo-orange.png" alt="Academie Florale"></a>
  <span class="nav-tag">Deviens fleuriste independante</span>
</div></div></header>
"""
FOOTER = """
<footer><div class="wrap">
  <div class="foot-inner">
    <a class="foot-logo" href="/pages/01-inscription.html" aria-label="Academie Florale"><img src="/assets/img/logo-orange.png" alt="Academie Florale"></a>
    <nav class="foot-links"><a href="#">CGV</a><a href="#">Mentions legales</a><a href="#">Confidentialite</a></nav>
  </div>
  <p class="foot-legal">Ce site n'est pas affilie a Facebook ni a Meta Platforms, Inc. &laquo;&nbsp;FACEBOOK&nbsp;&raquo; est une marque deposee de Meta Platforms, Inc. &copy; Academie Florale.</p>
</div></footer>
<script src="/assets/js/site.js"></script>
"""
MODAL = """
<div class="af-modal-overlay" id="afModal" onclick="afOverlay(event)">
  <div class="af-modal">
    <button class="af-modal-close" onclick="afCloseModal()" aria-label="Fermer">&times;</button>
    <div class="af-modal-head">
      <span class="af-badge"><span class="dot"></span> Acces immediat</span>
      <h3>Ou envoyer ta video&#8239;?</h3>
      <p>Entre ton prenom et ton email. Tu recois la video offerte dans la foulee.</p>
    </div>
    <div class="sio-form">
      <script id="form-script-tag-24192340" src="https://lecambredaze.systeme.io/public/remote/page/412887527ae62b3197170ce8a1d6a5772e605018.js"></script>
    </div>
    <p class="af-modal-foot">&#128274; Aucun spam. Desinscription en 1 clic.</p>
  </div>
</div>
"""
def page(title, desc, body):
    return HEAD.replace("{{TITLE}}",title).replace("{{DESC}}",desc) + body + FOOTER + "</body></html>"

# Helpers
def video_block(poster, note='Emplacement video'):
    return ('  <div class="video-embed reveal">\n'
            '    <!-- COLLE ICI l\'embed video (iframe) en remplacement du poster -->\n'
            '    <img class="poster" src="'+poster+'" alt="">\n'
            '    <div class="play" role="button" aria-label="Lire la video"></div>\n'
            '    <div class="ph-label">'+note+'</div>\n'
            '  </div>\n')
def cta(href,label):
    return ('  <div style="text-align:center;margin-top:22px"><a class="btn" href="'+href+'">'
            '<span>'+label+'</span><span class="arrow">&rarr;</span></a></div>\n')

TRUST = """
<div class="trust"><div class="wrap">
  <span><b>Opera de Montpellier</b></span><span class="sep">&#10022;</span>
  <span><b>Rolex</b></span><span class="sep">&#10022;</span>
  <span><b>Domaine de Verchant</b></span><span class="sep">&#10022;</span>
  <span><b>Richer de Belleval</b></span><span class="sep">&#10022;</span>
  <span>Directrice d'un magasin a <b>800&#8239;000&#8239;&euro; de CA</b></span>
</div></div>
"""
FOUNDER = """
<section class="block tight"><div class="wrap"><div class="founder">
  <div class="founder-photo reveal"><img src="/assets/img/sybile-atelier.jpg" alt="Sybile Loppe"></div>
  <div class="founder-copy reveal">
    <span class="af-badge"><span class="dot"></span> Ta formatrice</span>
    <h2>Sybile Loppe</h2>
    <p>J'ai passe 8 ans en boutique, a collaborer avec des marques prestigieuses autour de Montpellier &mdash; l'Opera, Rolex, le Domaine de Verchant, Richer de Belleval &mdash; avant de me lancer a mon compte.</p>
    <p>CAP, Brevet Professionnel, jury d'examen, directrice d'un des plus gros magasins de fleurs de la ville&hellip; et pourtant, en devenant independante, j'ai compris qu'il me manquait toute la partie qu'on n'apprend pas a l'ecole&nbsp;: chiffrer, vendre, defendre un devis, se rendre visible.</p>
    <p class="quote">&laquo;&nbsp;La creativite, ce n'est pas un don reserve a quelques chanceuses. C'est une competence qui se developpe.&nbsp;&raquo;</p>
    <p class="sign">Sybile</p>
  </div>
</div></div></section>
"""
TESTI = """
<section class="block tight"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> Elles l'ont fait</span><h2>Des femmes comme toi</h2></div>
  <div class="testi-grid reveal">
    <div class="testi-card"><div class="st">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
      <p>&laquo;&nbsp;Apres plusieurs annees en banque et en assurance, je me suis enfin lancee dans l'aventure florale.&nbsp;&raquo;</p>
      <div class="who"><span class="av">A</span><span><b>Alexane V.</b><span>Reconversion &mdash; ex banque/assurance</span></span></div></div>
    <div class="testi-card"><div class="st">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
      <p>&laquo;&nbsp;Ca faisait des annees que je voulais devenir fleuriste. Cette formation, c'est enfin l'occasion.&nbsp;&raquo;</p>
      <div class="who"><span class="av">E</span><span><b>Elisabeth B.</b><span>En reconversion vers la fleuristerie</span></span></div></div>
    <div class="testi-card"><div class="st">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
      <p>&laquo;&nbsp;Apres 6 ans de pause, j'ai realise que la fleur etait toujours ma vraie passion.&nbsp;&raquo;</p>
      <div class="who"><span class="av">M</span><span><b>Magalie R.</b><span>Ancienne fleuriste &mdash; relance d'activite</span></span></div></div>
  </div>
</div></section>
"""
def cta_final(href,eb,title,text,btn):
    return ('<section class="block tight"><div class="wrap"><div class="cta-box reveal">'
        '<span class="eyebrow" style="color:#FFB68C">'+eb+'</span>'
        '<h2 style="margin-top:14px">'+title+'</h2><p>'+text+'</p>'
        '<a class="btn" href="'+href+'"><span>'+btn+'</span><span class="arrow">&rarr;</span></a></div></div></section>')

# =================================================== PAGES
PAGES = {}

# 01 INSCRIPTION
PAGES["01-inscription.html"] = page(
 "Academie Florale &mdash; Deviens fleuriste independante",
 "Vis de ta passion des fleurs : deviens fleuriste independante depuis chez toi, meme en partant de zero. Video offerte par Sybile Loppe.",
 """
<section class="hero"><div class="wrap"><div class="hero-grid">
  <div class="hero-copy">
    <span class="af-badge"><span class="dot"></span> Reconversion &middot; Fleuristerie &middot; 2026</span>
    <h1>Et si tu vivais enfin de ta <em>passion des fleurs</em>&#8239;?</h1>
    <p class="lead">Decouvre comment devenir fleuriste independante depuis chez toi &mdash; meme en partant de zero, meme sans CAP.</p>
    <div class="hero-thumb"><img src="/assets/img/hero-sybile.jpg" alt=""></div>
    <div class="cta-wrap">
      <button class="btn" onclick="afOpenModal()"><span>Recevoir la video offerte</span><span class="arrow">&rarr;</span></button>
      <div class="af-hw">c'est offert &#127873;</div>
    </div>
    <div class="stars-line"><span class="st">&#9733;&#9733;&#9733;&#9733;&#9733;</span> <b>Des dizaines de femmes</b> accompagnees partout en France</div>
  </div>
  <div class="hero-photo reveal">
    <div class="frame"><img src="/assets/img/hero-sybile.jpg" alt="Sybile Loppe avec un bouquet" fetchpriority="high"></div>
    <div class="pill"><span class="dot"></span> Par Sybile Loppe &middot; 8 ans en boutique</div>
  </div>
</div></div></section>
""" + TRUST + """
<section class="block"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> La video offerte</span><h2>Ce que tu vas decouvrir</h2>
    <p>45 minutes pour comprendre comment des femmes comme toi en font leur metier &mdash; sereinement.</p></div>
  <div class="grid3">
    <div class="bcard reveal"><div class="bnum">01</div><h3>Composer avec methode</h3><p>Les regles d'or et les bons gestes pour creer de belles compositions. Une competence qui s'apprend.</p></div>
    <div class="bcard reveal"><div class="bnum">02</div><h3>Trouver des clients sans boutique</h3><p>Mariages, evenements, sur-mesure : comment te rendre visible et decrocher tes premiers projets.</p></div>
    <div class="bcard reveal"><div class="bnum">03</div><h3>Fixer tes prix et te payer</h3><p>Chiffrer un devis, defendre ton prix, calculer ta vraie marge. La moitie business que personne ne t'apprend ailleurs.</p></div>
  </div>
</div></section>
""" + FOUNDER + """
<section class="block tight"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> Le metier que tu vas apprendre</span><h2>Du bouquet a l'evenement</h2></div>
  <div class="gallery reveal">
    <figure><img src="/assets/img/compo-1.jpg" alt="" loading="lazy"></figure>
    <figure><img src="/assets/img/compo-2.jpg" alt="" loading="lazy"></figure>
    <figure><img src="/assets/img/compo-3.jpg" alt="" loading="lazy"></figure>
    <figure><img src="/assets/img/compo-4.jpg" alt="" loading="lazy"></figure>
  </div>
</div></section>
<section class="block tight"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> Pourquoi maintenant</span><h2>Un vrai boulevard t'attend</h2></div>
  <div class="stats reveal">
    <div class="stat"><div class="n">247&#8239;000</div><div class="l">mariages celebres en France l'an dernier</div></div>
    <div class="stat"><div class="n">1&#8239;000&ndash;5&#8239;000&#8239;&euro;</div><div class="l">de decoration florale par mariage</div></div>
    <div class="stat"><div class="n">75&#8239;%</div><div class="l">des Francais achetent des fleurs chaque annee</div></div>
    <div class="stat"><div class="n">19&#8239;900&#8239;&euro;</div><div class="l">budget moyen d'un mariage</div></div>
  </div>
</div></section>
<section class="block tight"><div class="wrap"><div class="cta-box reveal">
  <span class="eyebrow" style="color:#FFB68C">Le meilleur moment, c'est maintenant</span>
  <h2 style="margin-top:14px">Fais de 2026 l'annee ou tu choisis ta liberte</h2>
  <p>Tu n'as pas besoin de tout quitter pour te lancer. Commence par la video offerte.</p>
  <button class="btn" onclick="afOpenModal()"><span>Acceder a la video offerte</span><span class="arrow">&rarr;</span></button>
</div></div></section>
""" + MODAL)

# 02 VIDEO (VSL) — video DANS le phero
PAGES["02-video.html"] = page(
 "Academie Florale &mdash; La video de presentation",
 "Regarde la presentation du modele Fleuriste Independante Rentable, puis reserve ton appel offert.",
 """
<section class="phero"><div class="wrap narrow">
  <span class="af-badge"><span class="dot"></span> Video de presentation</span>
  <h1>Le modele <em>Fleuriste Independante Rentable</em></h1>
  <p class="lead">Comment vivre de l'art floral &mdash; composer, trouver des clients, chiffrer tes projets, te payer vraiment.</p>
"""+video_block('/assets/img/compo-2.jpg','Emplacement video &mdash; inserer l\'embed VSL')+cta('/pages/03-call.html','Reserver mon appel offert')+"""</div></section>
<section class="block tight"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> L'accompagnement</span><h2>Trois piliers, une transformation</h2></div>
  <div class="grid3">
    <div class="bcard reveal"><div class="bnum">01</div><h3>La formation</h3><p>6 modules, de la botanique a l'art floral jusqu'a la vente. 100% en ligne, acces a vie, replays et templates prets a l'emploi.</p></div>
    <div class="bcard reveal"><div class="bnum">02</div><h3>L'accompagnement</h3><p>Coaching collectif chaque semaine, journees en presentiel, et un suivi individuel <b>2 ans en illimite</b>&nbsp;: verification de tes devis avant envoi.</p></div>
    <div class="bcard reveal"><div class="bnum">03</div><h3>La communaute</h3><p>Un cercle de fleuristes partout en France qui s'entraident et se redistribuent les vrais projets.</p></div>
  </div>
</div></section>
"""+TESTI+cta_final('/pages/03-call.html',"La prochaine etape","On en parle&#8239;? C'est offert.",
   "Un appel de 20 minutes pour voir si l'accompagnement est fait pour toi, et tracer ton plan sur 90 jours.","Reserver mon appel offert"))

# 03 CALL — phero avec petite photo (mobile) + CTA vers calendrier
PAGES["03-call.html"] = page(
 "Academie Florale &mdash; Reserve ton appel offert",
 "Reserve ton appel decouverte offert avec l'equipe de l'Academie Florale.",
 """
<section class="phero"><div class="wrap narrow">
  <span class="af-badge"><span class="dot"></span> Appel decouverte &middot; Offert</span>
  <h1>Reserve ton <em>appel offert</em></h1>
  <p class="lead">20 minutes pour faire le point sur ta situation, repondre a tes questions, et tracer ensemble ton plan d'action sur 90 jours. Sans engagement.</p>
  <div class="phero-thumb-photo"><img src="/assets/img/sybile-portrait.jpg" alt=""></div>
"""+cta('#cal','Choisir mon creneau')+"""</div></section>
<section class="block tight" style="padding-top:30px"><div class="wrap">
  <div class="embed-slot reveal" id="cal"><div class="inner">
    <div class="ic">&#128197;</div>
    <h3 style="margin-top:8px">Choisis ton creneau</h3>
    <p>Emplacement du calendrier. Colle ici l'embed de ton outil (Calendly, systeme.io&hellip;) &mdash; remplace ce bloc par&nbsp;: <code>&lt;iframe src="..."&gt;</code></p>
  </div></div>
</div></section>
<section class="block tight"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> Comment ca se passe</span><h2>Ce qui t'attend pendant l'appel</h2></div>
  <div class="steps reveal">
    <div class="step"><span class="num"></span><div><h3>On ecoute ta situation</h3><p>Ton point de depart, tes envies, tes blocages. Aucun jugement.</p></div></div>
    <div class="step"><span class="num"></span><div><h3>On trace ton plan 90 jours</h3><p>Les etapes concretes pour aller de la ou tu es a tes premiers projets factures.</p></div></div>
    <div class="step"><span class="num"></span><div><h3>On repond a tout</h3><p>Le programme, l'accompagnement, les solutions de financement. Tu decides ensuite, librement.</p></div></div>
  </div>
</div></section>
""")

# 04 CONFIRMATION — panel + CTA
PAGES["04-confirmation.html"] = page(
 "Academie Florale &mdash; C'est reserve&#8239;!",
 "Ton appel est reserve. Voici les prochaines etapes.",
 """
<section class="phero"><div class="wrap narrow">
  <div class="panel reveal">
    <div class="big-ic">&#10003;</div>
    <span class="af-badge"><span class="dot"></span> C'est confirme</span>
    <h1 style="margin:14px 0">Felicitations, c'est reserve&#8239;!</h1>
    <p>On t'a envoye un e-mail avec la date et l'heure de ton appel. Pense a le <b>confirmer</b> en repondant simplement a cet e-mail.</p>
"""+cta('/pages/05-preparation-entretien.html','Preparer mon entretien')+"""  </div>
</div></section>
<section class="block tight"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> Avant l'appel</span><h2>2 choses a prevoir</h2></div>
  <div class="steps reveal">
    <div class="step"><span class="num"></span><div><h3>Sois dans un endroit calme</h3><p>L'appel se fait via WhatsApp a l'heure convenue. Sans distractions.</p></div></div>
    <div class="step"><span class="num"></span><div><h3>Regarde la preparation</h3><p>Quelques minutes pour arriver avec les bonnes questions.</p></div></div>
  </div>
</div></section>
"""+TESTI)

# 05 PREPARATION — video DANS le phero
PAGES["05-preparation-entretien.html"] = page(
 "Academie Florale &mdash; Prepare ton entretien",
 "Tout pour bien preparer ton appel decouverte.",
 """
<section class="phero"><div class="wrap narrow">
  <span class="af-badge"><span class="dot"></span> Avant ton appel</span>
  <h1>Prepare ton <em>entretien</em></h1>
  <p class="lead">Decouvre la plateforme, l'accompagnement, et arrive avec les bonnes questions.</p>
"""+video_block('/assets/img/atelier-serre.jpg','Emplacement video &mdash; presentation plateforme')+cta('/pages/03-call.html','Voir les creneaux')+"""</div></section>
<section class="block tight"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> Check-list</span><h2>Pour profiter a fond de l'echange</h2></div>
  <ul class="checklist reveal">
    <li>Note ou tu en es aujourd'hui (salariee, en reconversion, deja installee&hellip;).</li>
    <li>Ecris ta vraie question&nbsp;: qu'est-ce qui te bloque le plus&#8239;?</li>
    <li>Prevois un endroit calme, avec WhatsApp pret.</li>
    <li>Garde en tete ton objectif&nbsp;: ou veux-tu en etre dans 90 jours&#8239;?</li>
  </ul>
</div></section>
"""+FOUNDER+cta_final('/pages/03-call.html','On y est presque','Prete pour ton appel&#8239;?',
   "Si tu n'as pas encore choisi ton creneau, c'est par ici.",'Voir les creneaux'))

# 06 TEMOIGNAGES (1/2/3) — video DANS le phero
def testimonial_page(name, initial, role, quote, poster):
    return page(
     "Academie Florale &mdash; Temoignage "+name,
     "Retour d'experience d'une eleve de l'Academie Florale.",
     """
<section class="phero"><div class="wrap narrow">
  <span class="af-badge"><span class="dot"></span> Temoignage</span>
  <h1>L'histoire d'<em>"""+name+"""</em></h1>
"""+video_block(poster,'Emplacement video temoignage')+cta('/pages/03-call.html','Decouvrir la strategie')+"""</div></section>
<section class="block tight"><div class="wrap">
  <div class="testi-grid reveal" style="grid-template-columns:1fr;max-width:680px;margin:0 auto">
    <div class="testi-card"><div class="st">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
      <p style="font-size:1.15rem">&laquo;&nbsp;"""+quote+"""&nbsp;&raquo;</p>
      <div class="who"><span class="av">"""+initial+"""</span><span><b>"""+name+"""</b><span>"""+role+"""</span></span></div></div>
  </div>
</div></section>
""")

PAGES["06-temoignage.html"]   = testimonial_page("Alexane V.","A","Reconversion &mdash; ex banque/assurance",
  "Apres plusieurs annees en banque et en assurance, je me suis enfin lancee dans l'aventure florale. Aujourd'hui je cree, et ca a tout change.","/assets/img/sybile-portrait.jpg")
PAGES["06-temoignage-2.html"] = testimonial_page("Elisabeth B.","E","En reconversion vers la fleuristerie",
  "Ca faisait des annees que je voulais devenir fleuriste. Cette formation, c'est enfin l'occasion de passer a l'action avec une vraie methode.","/assets/img/atelier-echelle.jpg")
PAGES["06-temoignage-3.html"] = testimonial_page("Magalie R.","M","Ancienne fleuriste &mdash; relance d'activite",
  "Apres 6 ans de pause, j'ai realise que la fleur etait toujours ma vraie passion. J'ai retrouve le bon cadre pour relancer mon activite.","/assets/img/sybile-compo.jpg")

# 07 EXPLICATION — photo entre lead et CTA
PAGES["07-explication.html"] = page(
 "Academie Florale &mdash; Pourquoi c'est different",
 "Ce qui rend l'Academie Florale differente des autres formations.",
 """
<section class="phero"><div class="wrap narrow">
  <span class="af-badge"><span class="dot"></span> La difference</span>
  <h1>Pourquoi l'Academie Florale <em>n'est pas une formation comme les autres</em></h1>
  <p class="lead">Ailleurs, on t'apprend a reproduire. Ici, on te donne les regles d'or &mdash; puis on t'accompagne jusqu'a ce que ca marche.</p>
  <div class="phero-thumb-photo"><img src="/assets/img/sybile-portrait.jpg" alt=""></div>
"""+cta('/pages/03-call.html','Decouvrir la strategie')+"""</div></section>
<section class="block tight" style="padding-top:30px"><div class="wrap">
  <div class="diff reveal">
    <div class="diff-row"><div class="old"><div class="lab">Ailleurs</div>Un accompagnement qui s'arrete au bout de quelques mois.</div>
      <div class="new"><div class="lab">Academie Florale</div><b>Un suivi individuel 2 ans, en illimite.</b> On verifie tes vrais devis avant que tu les envoies.</div></div>
    <div class="diff-row"><div class="old"><div class="lab">Ailleurs</div>On te montre un bouquet, tu dois le copier a l'identique.</div>
      <div class="new"><div class="lab">Academie Florale</div>Les techniques de base et les <b>regles d'or</b>, puis tu developpes <b>ton style</b>.</div></div>
    <div class="diff-row"><div class="old"><div class="lab">Ailleurs</div>On ne parle jamais d'argent.</div>
      <div class="new"><div class="lab">Academie Florale</div>Sybile te montre <b>ses vrais devis (1&#8239;372&#8239;&euro; et 4&#8239;545&#8239;&euro;)</b> et t'apprend a chiffrer les tiens.</div></div>
    <div class="diff-row"><div class="old"><div class="lab">Ailleurs</div>Tu es seule une fois la formation finie.</div>
      <div class="new"><div class="lab">Academie Florale</div>Une <b>communaute partout en France</b> qui s'entraide et se redistribue les projets.</div></div>
  </div>
</div></section>
"""+cta_final('/pages/03-call.html',"Envie d'en savoir plus&#8239;?","Voyons si c'est fait pour toi",
   "Un appel offert, sans engagement, pour repondre a toutes tes questions.","Decouvrir la strategie"))

# 08 COACHING — video DANS le phero
PAGES["08-coaching.html"] = page(
 "Academie Florale &mdash; Extrait de coaching",
 "Un apercu des coachings de l'Academie Florale.",
 """
<section class="phero"><div class="wrap narrow">
  <span class="af-badge"><span class="dot"></span> Extrait de coaching</span>
  <h1>Dans les coulisses d'un <em>coaching</em></h1>
  <p class="lead">Chaque semaine on bosse ensemble &mdash; composition en direct, feedback geste par geste, cas pratiques business.</p>
"""+video_block('/assets/img/atelier-moody.jpg','Emplacement video &mdash; extrait de coaching')+cta('/pages/03-call.html','Decouvrir la strategie')+"""</div></section>
<section class="block tight"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> Deux coachings, chaque semaine</span><h2>Technique &amp; business</h2></div>
  <div class="grid3" style="grid-template-columns:repeat(2,1fr);max-width:820px;margin:0 auto">
    <div class="bcard reveal"><h3>Coaching technique</h3><p>On compose en direct. Sybile corrige tes gestes un par un &mdash; comme la regle d'or du PCS&nbsp;: principal, complementaire, secondaire.</p></div>
    <div class="bcard reveal"><h3>Coaching business</h3><p>Cas pratiques reels&nbsp;: &laquo;&nbsp;un mariage 500 invites, 48 tables, tel budget &mdash; comment tu chiffres&#8239;?&nbsp;&raquo;</p></div>
  </div>
</div></section>
""")

# 09 PRO — video DANS le phero
PAGES["09-pro.html"] = page(
 "Academie Florale &mdash; Pour les pros",
 "Deja diplomee ou installee&#8239;? Ajoute l'art floral evenementiel a tes prestations.",
 """
<section class="phero"><div class="wrap narrow">
  <span class="af-badge"><span class="dot"></span> Deja diplomee ou installee</span>
  <h1>Tu sais composer. <em>Personne ne t'a appris a vendre.</em></h1>
  <p class="lead">Le CAP/BP t'a appris la technique. Ici, on travaille l'autre moitie &mdash; chiffrer, defendre, demarcher.</p>
"""+video_block('/assets/img/compo-3.jpg','Emplacement video &mdash; pour les pros')+cta('/pages/03-call.html','Decouvrir la strategie')+"""</div></section>
<section class="block tight"><div class="wrap">
  <div class="sec-head reveal"><span class="af-badge"><span class="dot"></span> Pour qui</span><h2>Tu te reconnais&#8239;?</h2></div>
  <div class="grid3" style="grid-template-columns:repeat(2,1fr);max-width:820px;margin:0 auto">
    <div class="bcard reveal"><h3>Diplomee CAP/BP</h3><p>Tu n'oses pas te lancer seule. On calibre l'accompagnement sur ton niveau &mdash; tu peux sauter la technique de base et te concentrer 100% business.</p></div>
    <div class="bcard reveal"><h3>Deja installee</h3><p>Ton activite ne decolle pas&#8239;? Ce n'est pas un probleme de talent, c'est un probleme de tarification. On audite tes derniers devis.</p></div>
  </div>
</div></section>
""")

# 07f1496a AVIS
PAGES["07f1496a.html"] = page(
 "Academie Florale &mdash; Avis",
 "Aide-nous a faire grandir l'Academie Florale.",
 """
<section class="phero"><div class="wrap narrow">
  <div class="panel reveal">
    <div class="big-ic">&#9733;</div>
    <span class="af-badge"><span class="dot"></span> Ton avis compte</span>
    <h1 style="margin:14px 0">Aide-nous a faire grandir l'Academie Florale</h1>
    <p>L'Academie est jeune et chaque retour nous aide enormement. Si l'aventure t'a apporte quelque chose, partage ton experience.</p>
    <div style="margin-top:22px"><a class="btn" href="https://fr.trustpilot.com/review/academie-florale.fr" target="_blank" rel="noopener"><span>Laisser un avis sur Trustpilot</span><span class="arrow">&rarr;</span></a></div>
  </div>
</div></section>
""")

# =================================================== INDEX
INDEX_ROWS = [
 ("01-inscription.html","01","Inscription","Opt-in video offerte"),
 ("02-video.html","02","Video / VSL","Presentation + reservation"),
 ("03-call.html","03","Call","Reservation de l'appel"),
 ("04-confirmation.html","04","Confirmation","Rendez-vous confirme"),
 ("05-preparation-entretien.html","05","Preparation entretien","Avant l'appel"),
 ("06-temoignage.html","06","Temoignage &mdash; Alexane","Retour d'experience"),
 ("06-temoignage-2.html","07","Temoignage &mdash; Elisabeth","Retour d'experience"),
 ("06-temoignage-3.html","08","Temoignage &mdash; Magalie","Retour d'experience"),
 ("07-explication.html","09","Explication","Pourquoi c'est different"),
 ("08-coaching.html","10","Coaching","Extrait de coaching"),
 ("09-pro.html","11","Pour les pros","Diplomees &amp; installees"),
 ("07f1496a.html","12","Avis","Trustpilot"),
]
rows_html = ""
for fn,n,t,sub in INDEX_ROWS:
    rows_html += ('<a class="row" href="/pages/'+fn+'"><span class="n">'+n+'</span>'
      '<span class="t"><b>'+t+'</b><span>'+sub+'</span></span><span class="badge2">Voir &rarr;</span></a>')

INDEX = page(
 "Academie Florale &mdash; Funnel (preversion)",
 "Preversion du funnel refondu.",
 """
<section class="phero"><div class="wrap narrow">
  <span class="af-badge"><span class="dot"></span> Preversion privee</span>
  <h1>Refonte du <em>funnel</em></h1>
  <p class="lead">Toutes les pages du funnel refondu, responsive et dans la nouvelle identite.</p>
</div></section>
<section class="block tight" style="padding-top:30px"><div class="wrap narrow">
  <div class="index-list reveal">"""+rows_html+"""</div>
</div></section>
<style>
.index-list{display:grid;gap:10px;}
.index-list .row{display:flex;align-items:center;gap:18px;background:rgba(255,255,255,.85);border:1px solid var(--line);border-radius:14px;padding:18px 22px;transition:transform .15s,box-shadow .15s;}
.index-list .row:hover{transform:translateY(-2px);box-shadow:0 18px 40px -26px rgba(70,40,15,.4);}
.index-list .n{font-family:var(--serif);font-size:1.3rem;color:var(--orange);width:34px;}
.index-list .t{flex:1;}.index-list .t b{display:block;font-size:1.05rem;}
.index-list .t span{font-size:13.5px;color:var(--muted);}
.index-list .badge2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--orange);font-weight:600;}
</style>
""")

# =================================================== ECRITURE
def w(path, content):
    full=os.path.join(ROOT,path)
    with open(full,"w",encoding="utf-8") as f: f.write(content)
    print("ecrit", path, len(content),"o")
w("assets/css/site.css", CSS)
w("assets/js/site.js", JS)
for fn, html in PAGES.items():
    w(os.path.join("pages",fn), html)
w("index.html", INDEX)
print("OK -", len(PAGES)+1, "pages generees")
