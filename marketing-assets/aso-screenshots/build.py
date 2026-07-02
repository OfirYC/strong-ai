#!/usr/bin/env python3
"""Build App Store screenshots for Stronger AI as faithful HTML/CSS, one HTML per benefit.
Render each with headless Chrome at 1290x2796 (iPhone 6.7")."""
import os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "src")
os.makedirs(SRC, exist_ok=True)

BG = "#0B5FFF"

# ───────────────────────── shared template ─────────────────────────
TEMPLATE = """<!doctype html><html><head><meta charset="utf-8">
<style>
@font-face {{ font-family:'SFBlack'; src:url('file:///Library/Fonts/SF-Pro-Display-Black.otf'); }}
* {{ margin:0; padding:0; box-sizing:border-box; -webkit-font-smoothing:antialiased; }}
html,body {{ width:1290px; height:2796px; overflow:hidden; }}
body {{ position:relative; background:{bg}; font-family:system-ui,-apple-system,"Helvetica Neue",sans-serif; }}

/* headline */
.headline {{ position:absolute; top:150px; left:0; width:1290px; text-align:center; padding:0 150px; z-index:5; }}
.verb {{ font-family:'SFBlack'; font-size:170px; line-height:0.92; color:#fff; text-transform:uppercase; letter-spacing:-4px; }}
.desc {{ font-family:'SFBlack'; font-size:74px; line-height:1.0; color:#fff; text-transform:uppercase; letter-spacing:-2px; margin-top:22px; opacity:.96; }}

/* phone */
.phone {{ position:absolute; top:768px; left:185px; width:920px; height:2049px;
  background:linear-gradient(135deg,#5a5b62 0%,#17181c 15%,#0c0c0e 50%,#17181c 85%,#5a5b62 100%);
  border-radius:84px; box-shadow:0 50px 110px rgba(0,0,40,.40), 0 8px 24px rgba(0,0,30,.25);
  border:1px solid #3a3a40; }}
.bezelhi {{ position:absolute; inset:0; border-radius:84px; box-shadow:inset 0 2px 3px rgba(255,255,255,.18), inset 0 -2px 6px rgba(0,0,0,.5); pointer-events:none; z-index:30; }}
.screen {{ position:absolute; top:16px; left:16px; width:888px; height:2033px; border-radius:68px; overflow:hidden; background:#fff; }}
.island {{ position:absolute; top:34px; left:50%; transform:translateX(-50%); width:118px; height:35px; background:#000; border-radius:20px; z-index:20; }}

/* scaled app canvas: 393pt wide -> 888px screen => scale 2.2595; height 900pt -> 2033px */
.app {{ position:absolute; top:0; left:0; width:393px; height:900px; transform:scale(2.2595); transform-origin:top left;
  font-family:system-ui,-apple-system,"Helvetica Neue",sans-serif; color:#1C1C1E; background:#fff; }}
.col {{ height:100%; display:flex; flex-direction:column; }}

/* status bar */
.sb {{ height:54px; display:flex; align-items:flex-end; justify-content:space-between; padding:0 30px 8px; }}
.sb .t {{ font-size:16px; font-weight:700; letter-spacing:.3px; }}
.sb .r {{ display:flex; align-items:center; gap:6px; }}
.sb ion-icon {{ font-size:17px; }}

ion-icon {{ color:inherit; }}
</style></head>
<body>
  <div class="headline"><div class="verb">{verb}</div><div class="desc">{desc}</div></div>
  <div class="phone">
    <div class="screen"><div class="app">{app}</div></div>
    <div class="island"></div>
    <div class="bezelhi"></div>
  </div>
  <script type="module" src="https://cdn.jsdelivr.net/npm/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script>
  <script nomodule src="https://cdn.jsdelivr.net/npm/ionicons@7.1.0/dist/ionicons/ionicons.js"></script>
</body></html>"""

def statusbar(dark=True):
    c = "#1C1C1E" if dark else "#fff"
    return f"""<div class="sb" style="color:{c}"><div class="t">9:41</div>
      <div class="r"><ion-icon name="cellular"></ion-icon><ion-icon name="wifi"></ion-icon><ion-icon name="battery-full"></ion-icon></div></div>"""

# ───────────────────────── screen 1: AI Coach chat ─────────────────────────
SCREEN_CHAT = f"""
<div class="col">
{statusbar()}
<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:6px 16px 14px;border-bottom:1px solid #F2F2F7;">
  <div style="display:flex;align-items:center;gap:12px;">
    <div style="width:22px;display:flex;flex-direction:column;gap:5px;margin-top:4px;">
      <div style="height:2px;width:80%;background:#1C1C1E;border-radius:2px;"></div>
      <div style="height:2px;width:60%;background:#1C1C1E;border-radius:2px;"></div>
      <div style="height:2px;width:100%;background:#1C1C1E;border-radius:2px;"></div>
    </div>
    <div>
      <div style="font-size:18px;font-weight:700;">AI Coach</div>
      <div style="font-size:12px;color:#8E8E93;margin-top:2px;">Your strength &amp; conditioning assistant</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;color:#1C1C1E;">
    <ion-icon name="create-outline" style="font-size:23px;"></ion-icon>
    <ion-icon name="close" style="font-size:26px;"></ion-icon>
  </div>
</div>

<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding:14px 14px 8px;">
  <div style="text-align:center;margin:6px 0 18px;"><span style="font-size:12px;font-weight:600;color:#8E8E93;background:#F2F2F7;border-radius:999px;padding:4px 12px;">Today</span></div>
  <!-- assistant greeting -->
  <div style="max-width:85%;align-self:flex-start;margin-bottom:14px;">
    <div style="font-size:16px;line-height:1.35;color:#1C1C1E;">Hey — what are we training today?</div>
  </div>
  <!-- user -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <div style="max-width:80%;background:#007AFF;color:#fff;border-radius:18px;padding:11px 14px;font-size:16px;line-height:1.35;">
      Got 45 min and a barbell. Push day?</div>
  </div>
  <!-- assistant question -->
  <div style="max-width:85%;align-self:flex-start;margin-bottom:14px;">
    <div style="font-size:16px;line-height:1.35;color:#1C1C1E;">On it. Work around your right shoulder, or load it up today?</div>
  </div>
  <!-- user -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <div style="max-width:80%;background:#007AFF;color:#fff;border-radius:18px;padding:11px 14px;font-size:16px;line-height:1.35;">
      Work around it 🙏</div>
  </div>
  <!-- assistant tool card -->
  <div style="max-width:92%;margin-bottom:14px;">
    <div style="background:#fff;border:1px solid #E5E5EA;border-radius:16px;padding:12px 13px;box-shadow:0 6px 18px rgba(0,0,0,.06);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:24px;height:24px;border-radius:12px;background:#E8F4FF;display:flex;align-items:center;justify-content:center;">
            <ion-icon name="sparkles" style="font-size:14px;color:#007AFF;"></ion-icon></div>
          <div style="font-size:13px;font-weight:700;">Building your plan</div>
        </div>
        <div style="background:#EAF8EF;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;color:#1F8A3B;">Done</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:11px;">
        <div style="display:flex;align-items:center;gap:9px;">
          <ion-icon name="checkmark-circle" style="font-size:18px;color:#34C759;"></ion-icon>
          <div style="font-size:13px;font-weight:600;color:#3A3A3C;flex:1;">Reviewed your profile &amp; bench PR</div></div>
        <div style="display:flex;align-items:center;gap:9px;">
          <ion-icon name="checkmark-circle" style="font-size:18px;color:#34C759;"></ion-icon>
          <div style="font-size:13px;font-weight:600;color:#3A3A3C;flex:1;">Found matching exercises</div></div>
        <div style="display:flex;align-items:center;gap:9px;">
          <ion-icon name="checkmark-circle" style="font-size:18px;color:#34C759;"></ion-icon>
          <div style="font-size:13px;font-weight:600;color:#3A3A3C;flex:1;">Built your 45-min push session</div></div>
        <div style="display:flex;align-items:center;gap:9px;">
          <ion-icon name="checkmark-circle" style="font-size:18px;color:#34C759;"></ion-icon>
          <div style="font-size:13px;font-weight:600;color:#3A3A3C;flex:1;">Scheduled it for today</div></div>
      </div>
    </div>
  </div>
  <!-- assistant text + CTA -->
  <div style="max-width:90%;align-self:flex-start;">
    <div style="font-size:16px;line-height:1.4;color:#1C1C1E;margin-bottom:12px;">
      Done 💪 Built a <b>45-min push day</b> around your <b>100 kg</b> bench — bench, overhead press, weighted dips, triceps to finish.</div>
    <div style="display:inline-flex;align-items:center;gap:8px;background:#007AFF;border-radius:14px;padding:11px 18px;margin-bottom:16px;">
      <ion-icon name="play" style="font-size:17px;color:#fff;"></ion-icon>
      <span style="font-size:15px;font-weight:700;color:#fff;">Start Push Day</span></div>
    <div style="font-size:16px;line-height:1.4;color:#1C1C1E;">Want me to swap anything before you start?</div>
  </div>
</div>

<!-- input bar -->
<div style="background:#fff;border-top:1px solid #E5E5EA;padding:11px 16px 14px;">
  <div style="background:#F2F2F7;border-radius:24px;padding:7px 7px 7px 16px;display:flex;align-items:center;justify-content:space-between;">
    <div style="font-size:16px;color:#999;">Ask me anything…</div>
    <div style="width:36px;height:36px;border-radius:18px;background:#007AFF;display:flex;align-items:center;justify-content:center;">
      <ion-icon name="arrow-up" style="font-size:18px;color:#fff;"></ion-icon></div>
  </div>
</div>
</div>
"""

# ───────────────────────── screen 2: Routine detail ─────────────────────────
def ex_row(sets, name, group, target):
    return f"""<div style="display:flex;align-items:center;padding:14px 16px;border-bottom:1px solid #F2F2F7;">
      <div style="width:54px;height:54px;border-radius:10px;background:#F5F5F7;margin-right:12px;display:flex;align-items:center;justify-content:center;">
        <ion-icon name="barbell" style="font-size:24px;color:#8E8E93;"></ion-icon></div>
      <div style="flex:1;"><div style="font-size:16px;font-weight:600;color:#1C1C1E;">{sets} × {name}</div>
        <div style="font-size:13px;color:#8E8E93;margin-top:3px;">{group}</div>
        <div style="font-size:13px;color:#007AFF;font-weight:500;margin-top:3px;">{target}</div></div>
      <ion-icon name="help-circle" style="font-size:26px;color:#007AFF;"></ion-icon></div>"""

SCREEN_ROUTINE = f"""
<div class="col">
{statusbar()}
<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #E5E5EA;">
  <ion-icon name="close" style="font-size:28px;color:#1C1C1E;width:56px;"></ion-icon>
  <div style="font-size:18px;font-weight:600;">Push Day A</div>
  <div style="font-size:17px;color:#007AFF;font-weight:500;width:56px;text-align:right;">Edit</div>
</div>
<div style="display:flex;align-items:center;gap:7px;padding:12px 16px 4px;">
  <div style="display:inline-flex;align-items:center;gap:6px;background:#EAF2FF;border-radius:999px;padding:5px 11px;">
    <ion-icon name="sparkles" style="font-size:13px;color:#007AFF;"></ion-icon>
    <span style="font-size:12px;font-weight:700;color:#007AFF;">Built by your AI Coach</span></div>
  <span style="font-size:14px;color:#8E8E93;margin-left:auto;">Last done · 3 days ago</span>
</div>
<div style="flex:1;overflow:hidden;">
  {ex_row(4,'Barbell Bench Press','Chest','4 sets · 6–8 reps · 100 kg')}
  {ex_row(3,'Overhead Press','Shoulders','3 sets · 8–10 reps · 55 kg')}
  {ex_row(3,'Incline Dumbbell Press','Upper Chest','3 sets · 10–12 reps · 30 kg')}
  {ex_row(3,'Weighted Dip','Triceps','3 sets · 8–10 reps · +20 kg')}
  {ex_row(3,'Cable Triceps Pushdown','Triceps','3 sets · 12–15 reps')}
  {ex_row(4,'Lateral Raise','Side Delts','4 sets · 15 reps · 12 kg')}
</div>
<div style="display:flex;gap:12px;padding:14px 16px 16px;border-top:1px solid #E5E5EA;">
  <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;border:2px solid #007AFF;border-radius:13px;padding:14px 0;">
    <ion-icon name="calendar-outline" style="font-size:20px;color:#007AFF;"></ion-icon>
    <span style="font-size:17px;font-weight:600;color:#007AFF;">Schedule</span></div>
  <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:#007AFF;border-radius:13px;padding:14px 0;">
    <ion-icon name="play" style="font-size:18px;color:#fff;"></ion-icon>
    <span style="font-size:17px;font-weight:600;color:#fff;">Start Workout</span></div>
</div>
</div>
"""

# ───────────────────────── screen 3: Workout home / weekly plan ─────────────────────────
def plan_card(name, sub, day, primary=False):
    border = "#007AFF" if primary else "#E5E5EA"
    bw = "2px" if primary else "1px"
    return f"""<div style="background:#fff;border:{bw} solid {border};border-radius:13px;padding:15px 16px;margin-bottom:11px;display:flex;align-items:center;justify-content:space-between;">
      <div><div style="font-size:18px;font-weight:600;color:#1C1C1E;">{name}</div>
        <div style="font-size:13px;color:#8E8E93;margin-top:4px;">{sub}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
        <div style="background:#EAF2FF;border-radius:999px;padding:4px 11px;font-size:12px;font-weight:700;color:#007AFF;">{day}</div>
        <ion-icon name="play-circle-outline" style="font-size:30px;color:#007AFF;"></ion-icon></div></div>"""

SCREEN_HOME = f"""
<div class="col">
{statusbar()}
<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 20px 18px;">
  <div style="font-size:32px;font-weight:800;color:#1C1C1E;letter-spacing:-0.5px;">Start Workout</div>
  <div style="display:flex;gap:14px;color:#007AFF;">
    <ion-icon name="document-text-outline" style="font-size:24px;"></ion-icon>
    <ion-icon name="calendar-outline" style="font-size:24px;"></ion-icon></div>
</div>
<div style="flex:1;overflow:hidden;padding:0 20px;">
  <div style="font-size:20px;font-weight:600;color:#1C1C1E;margin-bottom:14px;">Today</div>
  {plan_card('Push Day A','Chest · Shoulders · Triceps · 6 exercises','Today', primary=True)}
  <div style="font-size:20px;font-weight:600;color:#1C1C1E;margin:22px 0 14px;">This Week</div>
  {plan_card('Pull Day A','Back · Biceps · 6 exercises','Tue')}
  {plan_card('Leg Day','Quads · Hamstrings · Glutes','Wed')}
  {plan_card('Long Run · 8 km','Zone 2 conditioning','Thu')}
  {plan_card('Push Day B','Chest · Shoulders · Triceps','Fri')}
  {plan_card('EMOM Conditioning','20 min · full body','Sat')}
  {plan_card('Mobility &amp; Recovery','15 min · active rest','Sun')}
</div>
</div>
"""

# ───────────────────────── screen 4: PR / e1RM progress ─────────────────────────
def pr_row(icon, color, bg, label, value, badge=None):
    b = f'<div style="background:#FFF4D6;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:800;color:#B8860B;margin-left:8px;">{badge}</div>' if badge else ""
    return f"""<div style="display:flex;align-items:center;padding:13px 16px;border-bottom:1px solid #F2F2F7;">
      <div style="width:34px;height:34px;border-radius:9px;background:{bg};display:flex;align-items:center;justify-content:center;margin-right:12px;">
        <ion-icon name="{icon}" style="font-size:19px;color:{color};"></ion-icon></div>
      <div style="flex:1;font-size:15px;font-weight:500;color:#1C1C1E;">{label}</div>
      <div style="display:flex;align-items:center;"><div style="font-size:16px;font-weight:700;color:#1C1C1E;">{value}</div>{b}</div></div>"""

def sess_row(date, sets, delta, up=False):
    d = f'<div style="display:inline-flex;align-items:center;gap:3px;background:#EAF8EF;border-radius:999px;padding:3px 8px;"><ion-icon name="arrow-up" style="font-size:11px;color:#1F8A3B;"></ion-icon><span style="font-size:12px;font-weight:700;color:#1F8A3B;">{delta}</span></div>' if delta else ""
    return f"""<div style="display:flex;align-items:center;padding:13px 16px;border-bottom:1px solid #F2F2F7;">
      <div style="width:54px;font-size:14px;font-weight:600;color:#1C1C1E;">{date}</div>
      <div style="flex:1;font-size:14px;color:#8E8E93;">{sets}</div>{d}</div>"""

SCREEN_PROGRESS = f"""
<div class="col">
{statusbar()}
<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #E5E5EA;">
  <ion-icon name="chevron-back" style="font-size:26px;color:#007AFF;width:40px;"></ion-icon>
  <div style="font-size:17px;font-weight:600;">Barbell Bench Press</div>
  <ion-icon name="ellipsis-horizontal" style="font-size:22px;color:#1C1C1E;width:40px;text-align:right;"></ion-icon>
</div>
<div style="flex:1;overflow:hidden;">
  <div style="padding:18px 20px 6px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#8E8E93;">ESTIMATED 1-REP MAX</div>
    <div style="display:flex;align-items:flex-end;gap:10px;margin-top:4px;">
      <div style="font-size:36px;font-weight:800;color:#1C1C1E;letter-spacing:-1px;">102.5<span style="font-size:20px;font-weight:700;color:#8E8E93;"> kg</span></div>
      <div style="display:inline-flex;align-items:center;gap:3px;background:#EAF8EF;border-radius:999px;padding:4px 9px;margin-bottom:6px;">
        <ion-icon name="trending-up" style="font-size:13px;color:#1F8A3B;"></ion-icon>
        <span style="font-size:12px;font-weight:700;color:#1F8A3B;">+7.5 kg this month</span></div>
    </div>
  </div>
  <div style="padding:6px 14px 4px;">
    <svg viewBox="0 0 366 168" width="100%" style="display:block;">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#007AFF" stop-opacity="0.20"/><stop offset="1" stop-color="#007AFF" stop-opacity="0"/></linearGradient></defs>
      <path d="M10,128 L58,118 L112,122 L165,96 L218,86 L286,58 L348,30 L348,150 L10,150 Z" fill="url(#g)"/>
      <polyline points="10,128 58,118 112,122 165,96 218,86 286,58 348,30" fill="none" stroke="#007AFF" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="58" cy="118" r="3.5" fill="#fff" stroke="#007AFF" stroke-width="2.5"/>
      <circle cx="165" cy="96" r="3.5" fill="#fff" stroke="#007AFF" stroke-width="2.5"/>
      <circle cx="286" cy="58" r="3.5" fill="#fff" stroke="#007AFF" stroke-width="2.5"/>
      <circle cx="348" cy="30" r="6" fill="#FFB800"/>
      <circle cx="348" cy="30" r="11" fill="none" stroke="#FFB800" stroke-width="2" opacity="0.4"/>
      <text x="10" y="164" font-size="11" fill="#C7C7CC" font-family="system-ui">Mar</text>
      <text x="160" y="164" font-size="11" fill="#C7C7CC" font-family="system-ui">Apr</text>
      <text x="300" y="164" font-size="11" fill="#C7C7CC" font-family="system-ui">May</text>
    </svg>
  </div>
  <div style="font-size:13px;font-weight:700;letter-spacing:0.6px;color:#8E8E93;padding:10px 16px 8px;">PERSONAL RECORDS</div>
  {pr_row('barbell','#B8860B','#FFF4D6','Heaviest Weight','100 kg × 1','PR')}
  {pr_row('trending-up','#007AFF','#EAF2FF','Best Estimated 1RM','102.5 kg')}
  {pr_row('flame','#FF9500','#FFF1E0','Best Set Volume','1,840 kg')}
  {pr_row('repeat','#34C759','#E7F8EC','Most Reps @ 80 kg','12 reps')}
  <div style="font-size:13px;font-weight:700;letter-spacing:0.6px;color:#8E8E93;padding:16px 16px 8px;">RECENT SESSIONS</div>
  {sess_row('Jun 24','100 kg × 1 · 95 kg × 3','+2.5 kg', True)}
  {sess_row('Jun 17','95 kg × 2 · 90 kg × 4','+5 kg', True)}
  {sess_row('Jun 10','92.5 kg × 3','')}
</div>
</div>
"""

# ───────────────────────── screen 5: AI memory recall ─────────────────────────
SCREEN_MEMORY = f"""
<div class="col">
{statusbar()}
<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:6px 16px 14px;border-bottom:1px solid #F2F2F7;">
  <div style="display:flex;align-items:center;gap:12px;">
    <div style="width:22px;display:flex;flex-direction:column;gap:5px;margin-top:4px;">
      <div style="height:2px;width:80%;background:#1C1C1E;border-radius:2px;"></div>
      <div style="height:2px;width:60%;background:#1C1C1E;border-radius:2px;"></div>
      <div style="height:2px;width:100%;background:#1C1C1E;border-radius:2px;"></div></div>
    <div><div style="font-size:18px;font-weight:700;">AI Coach</div>
      <div style="font-size:12px;color:#8E8E93;margin-top:2px;">Your strength &amp; conditioning assistant</div></div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;color:#1C1C1E;">
    <ion-icon name="create-outline" style="font-size:23px;"></ion-icon>
    <ion-icon name="close" style="font-size:26px;"></ion-icon></div>
</div>
<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding:14px 14px 8px;">
  <div style="text-align:center;margin:6px 0 18px;"><span style="font-size:12px;font-weight:600;color:#8E8E93;background:#F2F2F7;border-radius:999px;padding:4px 12px;">Today</span></div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <div style="max-width:80%;background:#007AFF;color:#fff;border-radius:18px;padding:11px 14px;font-size:16px;line-height:1.35;">Squats today 🏋️</div></div>
  <div style="max-width:88%;align-self:flex-start;margin-bottom:14px;">
    <div style="font-size:16px;line-height:1.35;color:#1C1C1E;">Before we load up — how's the right knee? You tweaked it on back squats 3 weeks ago.</div></div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <div style="max-width:80%;background:#007AFF;color:#fff;border-radius:18px;padding:11px 14px;font-size:16px;line-height:1.35;">Way better, ~90% now</div></div>
  <div style="max-width:88%;align-self:flex-start;margin-bottom:14px;">
    <div style="font-size:16px;line-height:1.35;color:#1C1C1E;">Good. I'll keep you on box squats and skip deep lunges today, like last time.</div></div>
  <!-- memory card -->
  <div style="max-width:94%;align-self:flex-start;margin-bottom:14px;">
    <div style="background:#fff;border:1px solid #E5E5EA;border-radius:16px;padding:13px;box-shadow:0 6px 18px rgba(0,0,0,.06);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:24px;height:24px;border-radius:12px;background:#E8F4FF;display:flex;align-items:center;justify-content:center;">
            <ion-icon name="bookmark" style="font-size:13px;color:#007AFF;"></ion-icon></div>
          <div style="font-size:13px;font-weight:700;">What I remember about you</div></div>
        <div style="background:#EAF8EF;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;color:#1F8A3B;">Updated</div></div>
      <div style="display:flex;flex-direction:column;gap:10px;font-size:14px;color:#3A3A3C;line-height:1.3;">
        <div>🦵 <b>Right knee</b> — avoid deep flexion while healing</div>
        <div>🎯 <b>Goal</b> — 140 kg squat by August</div>
        <div>💪 <b>Weak point</b> — lockout &amp; triceps</div>
        <div>🏃 <b>Training for</b> — hybrid / military prep</div>
      </div>
    </div>
  </div>
  <div style="max-width:90%;align-self:flex-start;">
    <div style="font-size:16px;line-height:1.4;color:#1C1C1E;">Logged that it's improving 🧠 You're still on track for that <b>140 kg squat</b> by August.</div></div>
</div>
<div style="background:#fff;border-top:1px solid #E5E5EA;padding:11px 16px 14px;">
  <div style="background:#F2F2F7;border-radius:24px;padding:7px 7px 7px 16px;display:flex;align-items:center;justify-content:space-between;">
    <div style="font-size:16px;color:#999;">Ask me anything…</div>
    <div style="width:36px;height:36px;border-radius:18px;background:#007AFF;display:flex;align-items:center;justify-content:center;">
      <ion-icon name="arrow-up" style="font-size:18px;color:#fff;"></ion-icon></div></div>
</div>
</div>
"""

# ───────────────────────── screen 6: Active workout / set logging ─────────────────────────
def set_row(num, prev, kg, reps, completed=False, warm=False):
    bg = "background:#eafbf0;" if completed else ""
    if warm:
        numcell = '<div style="width:30px;height:30px;border-radius:8px;background:rgba(245,158,11,0.15);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#F59E0B;">W</div>'
    else:
        numcell = f'<div style="width:30px;height:30px;border-radius:8px;background:#e9ebea;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:#1C1C1E;">{num}</div>'
    repsbox = f'<div style="width:52px;text-align:center;font-size:16px;font-weight:600;color:#1C1C1E;background:#e9ebea;border-radius:8px;padding:7px 0;">{reps}</div>' if reps else '<div style="width:52px;text-align:center;font-size:16px;color:#C7C7CC;background:#e9ebea;border-radius:8px;padding:7px 0;">0</div>'
    if completed:
        chk = '<div style="width:34px;height:30px;border-radius:8px;background:#28c36a;display:flex;align-items:center;justify-content:center;"><ion-icon name="checkmark" style="font-size:18px;color:#fff;"></ion-icon></div>'
    else:
        chk = '<div style="width:34px;height:30px;border-radius:8px;background:#F2F2F7;display:flex;align-items:center;justify-content:center;"><ion-icon name="checkmark" style="font-size:18px;color:#1C1C1E;"></ion-icon></div>'
    return f"""<div style="display:flex;align-items:center;gap:8px;padding:5px 16px;{bg}">
      {numcell}
      <div style="flex:1;font-size:15px;font-weight:500;color:#8E8E93;">{prev}</div>
      <div style="width:60px;text-align:center;font-size:16px;font-weight:600;color:#1C1C1E;background:#e9ebea;border-radius:8px;padding:7px 0;">{kg}</div>
      {repsbox}
      {chk}</div>"""

def set_header():
    return """<div style="display:flex;align-items:center;gap:8px;padding:2px 16px 6px;">
      <div style="width:30px;text-align:center;font-size:14px;font-weight:600;color:#000;">Set</div>
      <div style="flex:1;font-size:14px;font-weight:600;color:#000;">Previous</div>
      <div style="width:60px;text-align:center;font-size:14px;font-weight:600;color:#000;">+kg</div>
      <div style="width:52px;text-align:center;font-size:14px;font-weight:600;color:#000;">Reps</div>
      <div style="width:34px;"></div></div>"""

def rest_row(t):
    return f"""<div style="display:flex;align-items:center;gap:10px;padding:6px 16px;">
      <div style="flex:1;height:4px;background:#007bff14;border-radius:2px;"></div>
      <div style="display:flex;align-items:center;gap:5px;"><ion-icon name="time" style="font-size:15px;color:#0A84FF;"></ion-icon>
        <span style="font-size:15px;font-weight:600;color:#0A84FF;">Rest {t}</span></div>
      <div style="flex:1;height:4px;background:#007bff14;border-radius:2px;"></div></div>"""

def add_set():
    return """<div style="margin:8px 16px 0;background:#e9ebea;border-radius:8px;padding:9px 0;display:flex;align-items:center;justify-content:center;gap:6px;">
      <ion-icon name="add" style="font-size:18px;color:#1C1C1E;"></ion-icon>
      <span style="font-size:15px;font-weight:600;color:#1C1C1E;">Add Set</span></div>"""

def ex_card(name, rows_html):
    return f"""<div style="background:#fff;border-radius:12px;margin:0 0 16px;padding:12px 0 12px;border:1px solid #F2F2F7;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px 8px;">
        <div style="font-size:16px;font-weight:600;color:#007AFF;">{name}</div>
        <ion-icon name="ellipsis-horizontal" style="font-size:20px;color:#8E8E93;"></ion-icon></div>
      {set_header()}{rows_html}{add_set()}</div>"""

SCREEN_LOG = f"""
<div class="col">
{statusbar()}
<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px 6px;">
  <div style="display:flex;align-items:center;gap:9px;">
    <ion-icon name="barbell" style="font-size:24px;color:#007AFF;"></ion-icon>
    <div style="font-size:24px;font-weight:700;color:#1C1C1E;letter-spacing:-0.5px;">Push Day A</div></div>
  <div style="background:#007AFF;border-radius:8px;padding:8px 18px;font-size:16px;font-weight:600;color:#fff;">Finish</div>
</div>
<div style="display:flex;align-items:center;gap:14px;padding:0 16px 12px;border-bottom:1px solid #E5E5EA;">
  <div style="display:inline-flex;align-items:center;gap:5px;background:#F5F5F7;border-radius:16px;padding:5px 12px;">
    <ion-icon name="time" style="font-size:15px;color:#007AFF;"></ion-icon>
    <span style="font-size:15px;font-weight:600;color:#007AFF;">24:18</span></div>
  <span style="font-size:14px;color:#8E8E93;">3 of 6 exercises</span>
  <div style="margin-left:auto;display:flex;align-items:center;gap:5px;"><ion-icon name="calendar-outline" style="font-size:15px;color:#8E8E93;"></ion-icon><span style="font-size:14px;color:#8E8E93;">Today</span></div>
</div>
<div style="flex:1;overflow:hidden;padding:14px 14px 0;">
  {ex_card('Barbell Bench Press', set_row('','Warm-up','60','8',completed=True,warm=True)+set_row(1,'92.5 kg × 5','95','5',completed=True)+set_row(2,'95 kg × 5','95','5',completed=True)+rest_row('1:32')+set_row(3,'95 kg × 5','95','',completed=False))}
  {ex_card('Overhead Press', set_row(1,'52.5 kg × 8','55','8',completed=True)+set_row(2,'55 kg × 8','55','',completed=False)+set_row(3,'55 kg × 8','55','',completed=False))}
  {ex_card('Incline Dumbbell Press', set_row(1,'28 kg × 10','30','',completed=False))}
</div>
</div>
"""

# ───────────────────────── screen 7: iOS Live Activity (Lock Screen) ─────────────────────────
SCREEN_LIVE = """
<div style="position:relative;height:100%;overflow:hidden;background:linear-gradient(165deg,#0a1430 0%,#122a52 52%,#0a1430 100%);">
  <!-- status icons -->
  <div style="position:absolute;top:16px;right:28px;display:flex;align-items:center;gap:6px;color:#fff;">
    <ion-icon name="cellular" style="font-size:16px;"></ion-icon>
    <ion-icon name="wifi" style="font-size:16px;"></ion-icon>
    <ion-icon name="battery-full" style="font-size:17px;"></ion-icon></div>
  <div style="display:flex;flex-direction:column;align-items:center;height:100%;padding-top:64px;">
    <ion-icon name="lock-closed" style="font-size:17px;color:rgba(255,255,255,0.92);"></ion-icon>
    <div style="margin-top:24px;font-size:16px;font-weight:600;color:rgba(255,255,255,0.88);">Tuesday, 24 June</div>
    <div style="margin-top:0;font-size:84px;font-weight:700;color:#fff;letter-spacing:-1px;line-height:1.05;">9:41</div>
    <!-- Live Activity banner -->
    <div style="margin-top:150px;width:100%;padding:0 16px;">
      <div style="background:#E8F7E8;border-radius:18px;border:1px solid rgba(0,0,0,0.05);box-shadow:0 12px 30px rgba(0,0,0,0.28);padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:11px;">
          <ion-icon name="barbell" style="font-size:19px;color:#0A84FF;"></ion-icon>
          <div style="flex:1;">
            <div style="display:flex;align-items:baseline;justify-content:space-between;">
              <span style="font-size:18px;font-weight:700;color:#111111;">Push Day A</span>
              <span style="font-size:16px;font-weight:600;color:rgba(17,17,17,0.45);font-variant-numeric:tabular-nums;">24:51</span></div>
            <div style="font-size:13px;color:rgba(107,114,128,0.95);margin-top:2px;">Rest &bull; 8 / 20 sets</div></div>
        </div>
        <div style="margin-top:12px;position:relative;height:28px;border-radius:8px;background:rgba(0,0,0,0.06);overflow:hidden;">
          <div style="position:absolute;left:0;top:0;bottom:0;width:64%;background:#0A84FF;"></div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums;">0:42</div>
        </div>
      </div>
    </div>
    <div style="margin-top:auto;display:flex;gap:90px;padding-bottom:26px;">
      <div style="width:48px;height:48px;border-radius:24px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;"><ion-icon name="flashlight" style="font-size:22px;color:#fff;"></ion-icon></div>
      <div style="width:48px;height:48px;border-radius:24px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;"><ion-icon name="camera" style="font-size:22px;color:#fff;"></ion-icon></div>
    </div>
  </div>
</div>
"""

SCREENS = {
  "01-train":     dict(verb="TRAIN",     desc="WITH AN AI COACH",     app=SCREEN_CHAT),
  "02-build":     dict(verb="BUILD",     desc="ROUTINES INSTANTLY",   app=SCREEN_ROUTINE),
  "03-plan":      dict(verb="PLAN",      desc="YOUR TRAINING WEEK",   app=SCREEN_HOME),
  "04-track":     dict(verb="TRACK",     desc="EVERY PR &amp; 1-REP MAX", app=SCREEN_PROGRESS),
  "05-remembers": dict(verb="REMEMBERS", desc="EVERY INJURY &amp; GOAL",  app=SCREEN_MEMORY),
  "06-log":       dict(verb="LOG",       desc="SETS IN SECONDS",       app=SCREEN_LOG),
  "07-live":      dict(verb="LIVE",      desc="ON YOUR LOCK SCREEN",   app=SCREEN_LIVE),
}

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for slug, s in SCREENS.items():
        if only and only != slug:
            continue
        html = TEMPLATE.format(bg=BG, verb=s["verb"], desc=s["desc"], app=s["app"])
        p = os.path.join(SRC, slug + ".html")
        with open(p, "w") as f:
            f.write(html)
        print("wrote", p)

if __name__ == "__main__":
    main()
