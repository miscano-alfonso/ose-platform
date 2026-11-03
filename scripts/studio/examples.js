window.CHALK_EXAMPLES = [
{ "title": "Studio microphone", "filename": "studio-microphone", "width": 1400, "height": 1200, "floorY": 1075, "parts": [
  { "type": "cable", "points": [[860, 1050], [1000, 1085], [1150, 1095], [1420, 1070]] },
  { "type": "cylinder", "cx": 700, "top": 1005, "bottom": 1045, "r": 220, "ry": 46, "tone": "mid" },
  { "type": "cylinder", "cx": 700, "top": 560, "bottom": 1010, "r": 20, "ry": 6, "tone": "mid" },
  { "type": "rect", "x": 676, "y": 940, "w": 48, "h": 40, "tone": "dark" },
  { "type": "rect", "x": 596, "y": 520, "w": 208, "h": 34, "tone": "dark" },
  { "type": "tube", "from": [610, 530], "to": [610, 360], "width": 24, "tone": "mid" },
  { "type": "tube", "from": [790, 530], "to": [790, 360], "width": 24, "tone": "dark" },
  { "type": "ellipse", "cx": 700, "cy": 330, "rx": 128, "ry": 196, "tone": "mid", "rim": true, "hatch": { "angle": 0, "spacing": 9, "strength": 0.55, "color": "pale", "cross": 90, "lit": false } },
  { "type": "rect", "x": 574, "y": 380, "w": 252, "h": 44, "tone": "dark", "hatch": { "angle": 90, "spacing": 5, "strength": 0.3 } },
  { "type": "ellipse", "cx": 610, "cy": 402, "r": 24, "tone": "light" },
  { "type": "ellipse", "cx": 790, "cy": 402, "r": 24, "tone": "mid" },
  { "type": "glint", "at": [632, 250], "rx": 9, "ry": 46 }
]},
{ "title": "Clapperboard", "filename": "clapperboard", "width": 1400, "height": 1300, "floorY": 1200, "parts": [
  { "type": "group", "rotate": -6, "origin": [700, 760], "parts": [
    { "type": "poly", "points": [[1100, 550], [1116, 562], [1116, 1092], [1100, 1080]], "tone": "deep", "hatch": false },
    { "type": "poly", "points": [[300, 1080], [1100, 1080], [1116, 1092], [316, 1092]], "tone": "deep", "hatch": false },
    { "type": "rect", "x": 300, "y": 550, "w": 800, "h": 530, "tone": "dark", "rim": true, "shade": "diag", "hatch": { "angle": 38, "spacing": 7, "strength": 0.28, "cross": -50 } },
    { "type": "line", "points": [[314, 680], [1086, 680]], "width": 3.2, "tone": "hi", "smooth": false },
    { "type": "line", "points": [[314, 840], [1086, 840]], "width": 3.2, "tone": "hi", "smooth": false },
    { "type": "line", "points": [[314, 970], [1086, 970]], "width": 3.2, "tone": "hi", "smooth": false },
    { "type": "line", "points": [[567, 680], [567, 840]], "width": 3.2, "tone": "hi", "smooth": false },
    { "type": "line", "points": [[834, 680], [834, 840]], "width": 3.2, "tone": "hi", "smooth": false },
    { "type": "line", "points": [[700, 840], [700, 970]], "width": 3.2, "tone": "hi", "smooth": false },
    { "type": "scribble", "x0": 400, "x1": 1060, "y": 630, "size": 20 },
    { "type": "scribble", "x0": 360, "x1": 680, "y": 915, "size": 16 },
    { "type": "scribble", "x0": 760, "x1": 1060, "y": 915, "size": 16 },
    { "type": "scribble", "x0": 360, "x1": 900, "y": 1035, "size": 16 },
    { "type": "rect", "x": 300, "y": 480, "w": 800, "h": 70, "tone": "deep", "stripes": { "width": 92, "slant": 46, "colors": ["pale", "deep"] } },
    { "type": "group", "rotate": -19, "origin": [310, 480], "parts": [
      { "type": "rect", "x": 300, "y": 410, "w": 800, "h": 66, "tone": "deep", "stripes": { "width": 92, "slant": -46, "colors": ["pale", "deep"] } },
      { "type": "highlight", "points": [[304, 413], [1096, 413]] }
    ]},
    { "type": "rect", "x": 292, "y": 446, "w": 54, "h": 64, "tone": "mid" },
    { "type": "ellipse", "cx": 319, "cy": 478, "r": 12, "tone": "pale", "hatch": false }
  ]}
]}
];
