"""Independent check of exported files: true size, layers, closure, arcs.

Usage: python3 check_exports.py file.dxf file.svg  -> prints a JSON report.
"""
import json, re, sys
import ezdxf
from ezdxf import bbox as dxfbbox
from svgpathtools import svg2paths2

def dxf_report(path):
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    ents = []
    for e in msp:
        info = {"type": e.dxftype(), "layer": e.dxf.layer}
        if e.dxftype() == "POLYLINE":
            info["closed"] = e.is_closed
            info["bulges"] = sum(1 for v in e.vertices if abs(v.dxf.bulge) > 1e-9)
            info["n"] = len(e.vertices)
        if e.dxftype() == "CIRCLE":
            info["r"] = e.dxf.radius
            info["c"] = [e.dxf.center.x, e.dxf.center.y]
        ents.append(info)
    ext = dxfbbox.extents(msp)
    return {
        "insunits": doc.header.get("$INSUNITS"),
        "layers": sorted(l.dxf.name for l in doc.layers),
        "entities": ents,
        "extents": [ext.extmin.x, ext.extmin.y, ext.extmax.x, ext.extmax.y],
    }

def svg_report(path):
    paths, attrs, svg_attrs = svg2paths2(path)
    out = []
    for p, a in zip(paths, attrs):
        xmin, xmax, ymin, ymax = p.bbox()
        out.append({
            "closed": p.isclosed(),
            "arcs": sum(1 for s in p if type(s).__name__ == "Arc"),
            "bbox": [xmin, ymin, xmax, ymax],
        })
    return {"width": svg_attrs.get("width"), "height": svg_attrs.get("height"), "viewBox": svg_attrs.get("viewBox"), "paths": out,
            "strokes": sorted(set(re.findall(r'stroke="(#[0-9A-Fa-f]{6})"', open(path).read())))}

print(json.dumps({"dxf": dxf_report(sys.argv[1]), "svg": svg_report(sys.argv[2])}))
