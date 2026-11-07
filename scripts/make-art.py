# Erzeugt die Szenen-Illustrationen (SVG) in public/img/. Aufruf: python3 scripts/make-art.py public/img
import sys, os
OUT = sys.argv[1]

STYLE = """
<style>
  .ink { fill: none; stroke: #3d2f24; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; filter: url(#wob); }
  .thin { stroke-width: 1.7; }
  .solid { fill: #3d2f24; stroke: none; filter: url(#wob); }
  .eye { fill: #f1d898; }
  .w { filter: url(#wc); opacity: .95; }
  .sage { fill: #c9d8b0; } .leaf { fill: #9dbb86; } .leaf2 { fill: #b7cf9c; }
  .peach { fill: #f2c4ae; } .mustard { fill: #f1d898; } .blue { fill: #bcd3dc; }
  .rose { fill: #e8c3cc; } .clay { fill: #dcc6ad; } .terra { fill: #dc967c; }
  .paper { fill: #fffaf0; } .glass { fill: #dfeaee; }
  .night { display: none; } .day { display: inline; }
  .steam, .smoke { animation: rise 4.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center bottom; }
  .steam.b, .smoke.b { animation-delay: -2.2s; }
  .sway { animation: sway 6s ease-in-out infinite; transform-box: fill-box; transform-origin: center bottom; }
  .tail { animation: tail 5s ease-in-out infinite; transform-box: fill-box; transform-origin: left bottom; }
  .flame { animation: flicker 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center bottom; }
  @keyframes rise { 0% { opacity: 0; transform: translateY(6px) scaleY(.85); } 30% { opacity: .9; } 100% { opacity: 0; transform: translateY(-10px) scaleY(1.1); } }
  @keyframes sway { 0%,100% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } }
  @keyframes tail { 0%,100% { transform: rotate(0); } 50% { transform: rotate(-7deg); } }
  @keyframes flicker { 0%,100% { transform: scale(1,1); } 40% { transform: scale(.92,1.06); } 70% { transform: scale(1.05,.95); } }
  @media (prefers-reduced-motion: reduce) { .steam, .smoke, .sway, .tail, .flame { animation: none; } }
  @media (prefers-color-scheme: dark) {
    .ink { stroke: #f1e3cf; } .solid { fill: #f1e3cf; } .eye { fill: #3a2f26; }
    .sage { fill: #5d7350; } .leaf { fill: #6f8a5b; } .leaf2 { fill: #56704a; }
    .peach { fill: #8a5644; } .mustard { fill: #8a7038; } .blue { fill: #4c6672; }
    .rose { fill: #7b4f5a; } .clay { fill: #6e5a45; } .terra { fill: #9a5a45; }
    .paper { fill: #2d241d; } .glass { fill: #26304a; }
    .night { display: inline; } .day { display: none; }
  }
</style>
<defs>
  <filter id="wob" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="wc" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="11" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</defs>
"""

def svg(vb, body, extra_style=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{STYLE}{extra_style}{body}</svg>\n'

def g(x, y, s=1, body='', rot=0, cls=''):
    c = f' class="{cls}"' if cls else ''
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({s})"{c}>{body}</g>'

# ---------- Bausteine (Ursprung jeweils unten Mitte) ----------
def cat_sitting(eyes=True):
    """Sitzende Katze von vorn, ca. 44 breit, 62 hoch."""
    body = ('<path class="solid" d="M-15 0c-2-11 1-21 7-26-4-4-6-9-5-15l-2-11 8 6c3-1.6 9-1.6 12 0l8-6-2 11'
            'c1 6-1 11-5 15 6 5 9 15 7 26z"/>')
    tail = '<path class="ink tail" d="M14 -2c9 1 15-3 13-10-1-4-5-5-7-2" style="stroke-width:5"/>'
    e = ('<ellipse class="eye" cx="-4.6" cy="-35" rx="1.8" ry="2.3"/><ellipse class="eye" cx="4.6" cy="-35" rx="1.8" ry="2.3"/>'
         if eyes else '')
    return tail + body + e

def cat_sleeping():
    """Zusammengerollte, schlafende Katze, ca. 70 breit, 30 hoch."""
    return ('<path class="solid" d="M-34 0c-2-14 10-25 28-25 10 0 18 3 23 9l3-9 3 10c5 2 8 7 8 12 0 2-1 3-2 3z"/>'
            '<path class="ink" d="M-30 -2c4 4 16 4 26 1" style="stroke-width:5"/>'
                        '<path class="ink thin" d="M28 -36h7l-7 8h7M40 -46h5l-5 6h5"/>')

def pot(w=28, h=24, cls='terra'):
    hw = w / 2
    return (f'<path class="w {cls}" d="M{-hw+2} {-h+2}h{w-2}l-3 {h-3}c0 1.6-1.4 2.6-3 2.6H{-hw+8}c-1.6 0-3-1-3-2.6z"/>'
            f'<path class="ink" d="M{-hw} {-h}h{w}l-3.6 {h-2}c-.2 1.4-1.4 2-2.8 2H{-hw+6.4}c-1.4 0-2.6-.6-2.8-2z"/>'
            f'<path class="ink thin" d="M{-hw-1.6} {-h}h{w+3.2}v-5H{-hw-1.6}z"/>')

def monstera():
    leaves = ''
    for x, y, r, s in [(-4, -62, -28, 1.05), (10, -44, 32, .95), (-14, -36, -58, .85), (4, -78, 6, .8)]:
        leaves += g(x, y, s, (
            '<path class="w leaf" d="M0 0c-14-4-20-18-12-30 6-8 18-10 24-2 8 10 4 26-12 32z"/>'
            '<path class="ink" d="M0 0c-14-4-20-18-12-30 6-8 18-10 24-2 8 10 4 26-12 32z"/>'
            '<path class="ink thin" d="M0 0c0-10 0-20 2-28M-8 -22l5 4M10 -20l-6 5M-9 -12l7 3M12 -10l-9 4"/>'), rot=r)
    stems = '<path class="ink thin" d="M0 -26c-2-12-3-24-4-36M0 -26c4-6 8-12 10-18M0 -26c-6-4-10-6-14-10M1 -26c1-18 2-34 3-52"/>'
    return f'<g class="sway">{stems}{leaves}</g>' + pot(34, 28, 'terra')

def trailing(length=70):
    """Hängepflanze (Efeutute) – Ursprung oben."""
    vine = f'<path class="ink thin" d="M0 0c4 14-6 26 0 40s-4 22 2 {length}"/>'
    leaves = ''
    for i, (x, y, r) in enumerate([(2, 8, 30), (-3, 20, -40), (3, 32, 40), (-2, 44, -30), (2, 56, 35), (0, length - 2, 0)]):
        if y > length: break
        cls = 'leaf' if i % 2 else 'leaf2'
        leaves += g(x, y, 1, f'<path class="w {cls}" d="M0 0c-6-1-9-6-7-10 2-3 5-2 7 1 2-3 5-4 7-1 2 4-1 9-7 10z"/>'
                               '<path class="ink thin" d="M0 0c-6-1-9-6-7-10 2-3 5-2 7 1 2-3 5-4 7-1 2 4-1 9-7 10z"/>', rot=r + 180)
    return f'<g class="sway">{vine}{leaves}</g>'

def snake_plant():
    leaves = ''
    for x, h, r, cls in [(-8, 48, -10, 'leaf'), (0, 62, 2, 'leaf2'), (8, 44, 12, 'leaf')]:
        leaves += g(x, -20, 1, f'<path class="w {cls}" d="M-4 0c-1-{h*0.6} 1-{h*0.9} 4-{h} 3 {h*0.1} 5 {h*0.4} 4 {h}z"/>'
                                f'<path class="ink" d="M-4 0c-1-{h*0.6} 1-{h*0.9} 4-{h} 3 {h*0.1} 5 {h*0.4} 4 {h}"/>'
                                f'<path class="ink thin" d="M-1 -{h*0.3}l3 -2M-1 -{h*0.55}l3 -2"/>', rot=r)
    return leaves + pot(26, 20, 'clay')

def cactus():
    return ('<path class="w sage" d="M-7 -18c-1-14 0-26 7-26s8 12 7 26z"/>'
            '<path class="ink" d="M-7 -18c-1-14 0-26 7-26s8 12 7 26M-7 -30c-6 0-8-4-8-9M7 -26c6 0 7-5 7-9"/>'
            '<path class="ink thin" d="M-2 -38l-2-1M3 -32l2-1M-3 -26l-2-1M2 -22l2-1"/>'
            '<circle class="rose" cx="0" cy="-46" r="3"/>') + pot(20, 18, 'peach')

def teacup(steam=True):
    s = ''
    if steam:
        s = ('<path class="ink thin steam" d="M-8 -34c-4-5 4-8 0-14s4-8 0-13"/>'
             '<path class="ink thin steam b" d="M4 -34c-4-5 4-8 0-14s4-8 0-13"/>')
    return (s + '<path class="w peach" d="M-20 -30h40c-1 14-8 26-20 26S-19 -16-20 -30z"/>'
            '<path class="ink" d="M-22 -32h42c-1 16-9 28-21 28S-21 -16-22 -32z"/>'
            '<path class="ink" d="M20 -26c10-3 13 6 6 11-3 2-7 3-10 2"/>'
            '<path class="ink" d="M-30 0c18 2 40 2 58 0"/>'
            '<path class="terra" d="M-4 -20c-3-4 2-7 4-3 2-4 7-1 4 3l-4 4z"/>')

def book_stack():
    return ('<path class="w blue" d="M-24 -10h46v10h-46z"/><path class="w mustard" d="M-20 -20h38v10h-38z"/>'
            '<path class="ink" d="M-24 0h46v-10h-46zM-20 -10h38v-10h-38zM16 -10v-10M18 0v-10"/>')

def candle():
    return ('<path class="w mustard flame" d="M0 -46c-5-6 0-12 0-16 4 6 6 10 0 16z"/>'
            '<path class="ink thin flame" d="M0 -46c-5-6 0-12 0-16 4 6 6 10 0 16z"/>'
            '<path class="w paper" d="M-6 -40h12v38h-12z"/><path class="ink" d="M-6 -40h12v38M-6 -40v38M0 -40v-6"/>'
            '<path class="ink" d="M-14 0h28"/>')

def moon_stars():
    return ('<path class="mustard" d="M14 -2c-8 0-14-6-14-14 0-6 3-10 8-13-2 9 5 18 15 17-2 6-5 10-9 10z"/>'
            '<path class="ink thin" d="M14 -2c-8 0-14-6-14-14 0-6 3-10 8-13-2 9 5 18 15 17-2 6-5 10-9 10z"/>'
            '<path class="ink thin" d="M-26 -22v6M-29 -19h6M30 -36v5M27.5 -33.5h5M-10 -40v4M-12 -38h4"/>')

def sun():
    return ('<circle class="w mustard" cx="0" cy="0" r="12"/>'
            '<path class="ink thin" d="M0 -18v-5M0 18v5M-18 0h-5M18 0h5M-13 -13l-3-3M13 13l3 3M13 -13l3-3M-13 13l-3 3"/>')

# ---------- Szene 1: Haus mit Katze im Fenster (Logo + App-Icon) ----------
def house(with_ground=True):
    b = ''
    if with_ground:
        b += '<path class="w sage" d="M14 176c30-14 140-16 172 0-30 10-142 10-172 0z"/>'
    # Schornstein + Rauch
    b += '<path class="w clay" d="M130 44h14v30h-14z"/><path class="ink" d="M128 72V42h16v30M126 42h20"/>'
    b += '<path class="ink thin smoke" d="M136 34c-6-6 4-10-1-16s5-9 1-14"/><path class="ink thin smoke b" d="M144 30c-5-5 4-9 0-14"/>'
    # Haus
    b += '<path class="w peach" d="M52 92h98v76H52z"/>'
    b += '<path class="w terra" d="M40 96L101 38l63 58c-40-6-84-6-124 0z"/>'
    b += '<path class="ink" d="M36 96c22-20 44-40 65-60 22 20 43 40 65 60"/>'
    b += '<path class="ink" d="M50 88v82h101V88"/>'
    b += '<path class="ink thin" d="M70 66c8 4 22 4 30 0M88 52c6 3 18 3 24 0M118 74c8 3 20 3 28 0"/>'
    # rundes Fenster mit Katze
    b += '<circle class="glass" cx="100" cy="118" r="25"/>'
    b += '<g class="day">' + g(86, 104, .45, sun()) + '</g>'
    b += '<g class="night">' + g(90, 112, .5, moon_stars()) + '</g>'
    b += g(100, 141, .78, cat_sitting())
    b += '<circle class="ink" cx="100" cy="118" r="25"/><path class="ink thin" d="M100 93v50M75 118h50" style="opacity:.0"/>'
    b += '<path class="ink" d="M72 145h56"/>'
    # Blumenkasten
    b += '<path class="w mustard" d="M76 148h50l-3 10h-44z"/><path class="ink" d="M74 146h52l-4 12h-44z"/>'
    for x, c in [(84, 'rose'), (98, 'peach'), (112, 'rose')]:
        b += f'<path class="ink thin" d="M{x} 146v-6"/><circle class="w {c}" cx="{x}" cy="138" r="4.4"/><circle class="ink thin" cx="{x}" cy="138" r="4"/>'
    # Tür
    b += '<path class="w sage" d="M126 170v-26c0-6 14-6 14 0v26z"/><path class="ink" d="M124 170v-26c0-8 18-8 18 0v26"/><circle class="solid" cx="137" cy="158" r="1.4"/>'
    # Pflanzen links/rechts + Hängepflanze am Dach
    b += g(30, 172, .72, monstera())
    b += g(172, 172, .62, snake_plant())
    b += g(56, 92, .55, trailing(60))
    return b

def write(name, content):
    with open(os.path.join(OUT, name), 'w') as f: f.write(content)

write('haus-katze.svg', svg('0 0 200 190', house()))

# App-Icon: Hintergrund + Haus (füllt die Fläche, mittig mit Rand für runde Masken)
icon_bg = ('<rect width="200" height="200" fill="#f3e8d4"/>'
           '<path class="w sage" d="M100 22c46 0 80 30 80 76s-30 84-80 84-82-36-82-82 36-78 82-78z" style="opacity:.75"/>'
           '<path class="w mustard" d="M160 26c14 0 22 10 20 21s-14 15-24 10-11-31 4-31z" style="opacity:.7"/>')
icon_style = '<style>@media (prefers-color-scheme: dark){rect{fill:#f3e8d4}}</style>'
# fürs Icon immer helle Farben -> eigene Kopie ohne Dunkelmodus und ohne Animation
light_only = STYLE.split('@media (prefers-color-scheme: dark)')[0] + '</style>' + STYLE.split('</style>')[1]
light_only = light_only.replace('animation:', 'animation-name: none; --x:')
write('../icons/icon.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">{light_only}{icon_bg}'
      + g(100, 104, .9, f'<g transform="translate(-100 -100)">{house(False)}</g>') + '</svg>\n')

# App-Icon „Nacht“ (Kaits Wunsch): blauer Nachthimmel, großer Mond, Sterne, Fenster leuchtet warm,
# Katze als dunkle Silhouette im Fenster. Auswahl in der App unter „Mehr → Dieses Gerät“.
dark_rules = STYLE.split('@media (prefers-color-scheme: dark) {')[1].split('}\n</style>')[0]
night_style = (light_only.replace('</style>', dark_rules.replace('    .night { display: inline; } .day { display: none; }', '')
               + '.night, .day { display: none; } .glass { fill: #f7d98a; } .solid { fill: #2a2440; }'
               + ' .moon { fill: #f8e7aa; } .star { fill: #f8e7aa; } .glow { fill: #f7d98a; opacity: .14; } </style>', 1))
night_bg = ('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2c52"/>'
            '<stop offset="1" stop-color="#3d5a8c"/></linearGradient></defs>'
            '<rect width="200" height="200" fill="url(#sky)"/>'
            '<path class="w" fill="#4a6aa0" d="M100 30c46 0 80 28 80 72s-30 80-80 80-82-34-80-78 34-74 80-74z" style="opacity:.45"/>'
            # großer Mond oben links + Sterne
            '<circle class="glow" cx="44" cy="44" r="26"/>'
            '<path class="moon w" d="M52 22c-14 2-24 14-22 28s16 23 30 20c-11-3-19-13-18-25 0-10 5-18 10-23z"/>'
            '<path class="ink thin" d="M52 22c-14 2-24 14-22 28s16 23 30 20c-11-3-19-13-18-25 0-10 5-18 10-23z"/>'
            + ''.join(f'<path class="star" d="M{x} {y-r}l{r*.3:.1f} {r*.7:.1f} {r*.7:.1f} {r*.3:.1f}-{r*.7:.1f} {r*.3:.1f}-{r*.3:.1f} {r*.7:.1f}-{r*.3:.1f}-{r*.7:.1f}-{r*.7:.1f}-{r*.3:.1f} {r*.7:.1f}-{r*.3:.1f}z"/>'
                      for x, y, r in [(160, 30, 5), (182, 58, 3.5), (122, 22, 3), (20, 88, 3), (176, 104, 2.6), (88, 18, 2.4)]))
write('../icons/icon-nacht.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">{night_style}{night_bg}'
      + '<circle class="glow" cx="100" cy="122" r="34"/>'
      + g(100, 104, .9, f'<g transform="translate(-100 -100)">{house(False)}</g>') + '</svg>\n')

# ---------- Szene 2: Einkaufsliste leer – Tee, Katze schläft, Pflanze ----------
empty = ('<path class="w sage" d="M10 120c40-12 160-12 200 0-40 8-160 8-200 0z"/>'
         + g(64, 118, 1, teacup())
         + g(140, 118, .9, cat_sleeping())
         + g(196, 118, .5, cactus())
         + g(26, 118, .55, book_stack()))
write('leer-tee.svg', svg('0 0 220 130', empty))

# ---------- Szene 3: Anmeldung – Haustür mit Pflanzen und Katze auf der Fußmatte ----------
door = ('<path class="w clay" d="M20 150c40-8 140-8 180 0-40 6-140 6-180 0z"/>'
        '<path class="w sage" d="M82 146V62c0-22 56-22 56 0v84z"/>'
        '<path class="ink" d="M78 146V60c0-26 64-26 64 0v86"/>'
        '<path class="ink thin" d="M88 140V66c0-16 44-16 44 0v74"/>'
        '<circle class="glass" cx="110" cy="64" r="11"/><circle class="ink thin" cx="110" cy="64" r="11"/>'
        '<circle class="solid" cx="128" cy="104" r="2.2"/>'
        '<path class="w terra" d="M86 150h50l4 6H82z"/><path class="ink" d="M84 148h52l5 8H79z"/>'
        + g(110, 150, .62, cat_sitting())
        + g(50, 152, .78, monstera())
        + g(172, 152, .7, snake_plant())
        + g(110, 24, .6, trailing(46)) + '<path class="ink thin" d="M96 22h28"/>'
        )
write('tuer.svg', svg('0 0 220 162', door))

# ---------- Szene 4: Fensterbank (PC-Seitenleiste) ----------
sill = ('<path class="glass" d="M24 20h152v108H24z"/>'
        '<g class="day">' + g(140, 50, .9, sun()) + '<path class="w blue" d="M40 60c10-8 26-8 32 0-8 4-24 4-32 0z"/></g>'
        '<g class="night">' + g(136, 64, 1.1, moon_stars()) + '</g>'
        '<path class="ink" d="M24 128V20h152v108M100 20v108M24 74h152"/>'
        '<path class="w clay" d="M10 128h180v10H10z"/><path class="ink" d="M8 126h184v12H8z"/>'
        + g(46, 126, .8, monstera())
        + g(100, 126, .78, cat_sitting())
        + g(150, 126, .6, cactus())
        + '<g class="night">' + g(178, 126, .7, candle()) + '</g>'
        + '<g class="day">' + g(178, 126, .55, teacup(steam=True)) + '</g>'
        + g(30, 22, .6, trailing(60)) + g(170, 22, .5, trailing(44)))
write('fensterbank.svg', svg('0 0 200 142', sill))
print('ok')
