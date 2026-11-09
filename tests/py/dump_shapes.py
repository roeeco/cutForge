"""Dump exported contours for exact geometry checks (independent reader).

Usage: python3 dump_shapes.py file.dxf file.svg -> JSON
  dxf: [{layer, closed, pts: [[x, y, bulge], ...]}] for POLYLINE, CIRCLE as {layer, circle: [cx, cy, r]}
  svg: [{stroke, closed, segs: [{t: 'L'|'A', a: [x, y], b: [x, y], r?: [rx, ry]}]}]
"""
import json, sys
import ezdxf
from svgpathtools import svg2paths2

def dxf(path):
    out = []
    for e in ezdxf.readfile(path).modelspace():
        if e.dxftype() == "POLYLINE":
            out.append({"layer": e.dxf.layer, "closed": e.is_closed, "pts": [[v.dxf.location.x, v.dxf.location.y, v.dxf.bulge] for v in e.vertices]})
        elif e.dxftype() == "CIRCLE":
            out.append({"layer": e.dxf.layer, "circle": [e.dxf.center.x, e.dxf.center.y, e.dxf.radius]})
    return out

def svg(path):
    paths, attrs, _ = svg2paths2(path)
    out = []
    for p, a in zip(paths, attrs):
        segs = []
        for s in p:
            k = type(s).__name__
            seg = {"t": "A" if k == "Arc" else "L", "a": [s.start.real, s.start.imag], "b": [s.end.real, s.end.imag]}
            if k == "Arc":
                seg["r"] = [s.radius.real, s.radius.imag]
            segs.append(seg)
        out.append({"stroke": a.get("stroke"), "closed": p.isclosed(), "segs": segs})
    return out

print(json.dumps({"dxf": dxf(sys.argv[1]), "svg": svg(sys.argv[2])}))
