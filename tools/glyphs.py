"""Minimaler TrueType-Leser: wandelt Text in SVG-Pfade um (ohne Abhängigkeiten).

Unterstützt glyf-Schriften (einfache und zusammengesetzte Glyphen), cmap Format 4/12.
Variable Schriften werden in ihrer Standardinstanz gelesen. Kerning wird ignoriert.
"""
import struct


class Font:
    def __init__(self, path):
        d = open(path, "rb").read()
        self.d = d
        n = struct.unpack(">H", d[4:6])[0]
        self.t = {}
        for i in range(n):
            tag, _, off, ln = struct.unpack(">4sIII", d[12 + 16 * i: 28 + 16 * i])
            self.t[tag.decode("latin-1")] = (off, ln)
        h = self.t["head"][0]
        self.upm = struct.unpack(">H", d[h + 18: h + 20])[0]
        locfmt = struct.unpack(">h", d[h + 50: h + 52])[0]
        m = self.t["maxp"][0]
        self.n = struct.unpack(">H", d[m + 4: m + 6])[0]
        hh = self.t["hhea"][0]
        nh = struct.unpack(">H", d[hh + 34: hh + 36])[0]
        hm = self.t["hmtx"][0]
        self.adv = [struct.unpack(">H", d[hm + 4 * i: hm + 4 * i + 2])[0] for i in range(nh)]
        lo = self.t["loca"][0]
        if locfmt == 0:
            self.loca = [struct.unpack(">H", d[lo + 2 * i: lo + 2 * i + 2])[0] * 2 for i in range(self.n + 1)]
        else:
            self.loca = [struct.unpack(">I", d[lo + 4 * i: lo + 4 * i + 4])[0] for i in range(self.n + 1)]
        self.cmap = self._cmap()
        os2 = self.t.get("OS/2")
        self.cap = struct.unpack(">h", d[os2[0] + 88: os2[0] + 90])[0] if os2 and os2[1] >= 90 else int(self.upm * 0.7)

    def _cmap(self):
        d = self.d
        c = self.t["cmap"][0]
        n = struct.unpack(">H", d[c + 2: c + 4])[0]
        subs = {}
        for i in range(n):
            pid, eid, off = struct.unpack(">HHI", d[c + 4 + 8 * i: c + 12 + 8 * i])
            subs[(pid, eid)] = c + off
        res = {}
        for key in [(3, 10), (0, 4), (3, 1), (0, 3)]:
            if key not in subs:
                continue
            o = subs[key]
            fmt = struct.unpack(">H", d[o: o + 2])[0]
            if fmt == 4:
                seg = struct.unpack(">H", d[o + 6: o + 8])[0] // 2
                ends = struct.unpack(f">{seg}H", d[o + 14: o + 14 + 2 * seg])
                starts = struct.unpack(f">{seg}H", d[o + 16 + 2 * seg: o + 16 + 4 * seg])
                deltas = struct.unpack(f">{seg}h", d[o + 16 + 4 * seg: o + 16 + 6 * seg])
                ro_pos = o + 16 + 6 * seg
                ros = struct.unpack(f">{seg}H", d[ro_pos: ro_pos + 2 * seg])
                for s in range(seg):
                    for ch in range(starts[s], ends[s] + 1):
                        if ch == 0xFFFF:
                            continue
                        if ros[s] == 0:
                            g = (ch + deltas[s]) & 0xFFFF
                        else:
                            a = ro_pos + 2 * s + ros[s] + 2 * (ch - starts[s])
                            g = struct.unpack(">H", d[a: a + 2])[0]
                            if g:
                                g = (g + deltas[s]) & 0xFFFF
                        res.setdefault(ch, g)
            elif fmt == 12:
                ng = struct.unpack(">I", d[o + 12: o + 16])[0]
                for k in range(ng):
                    s, e, g0 = struct.unpack(">III", d[o + 16 + 12 * k: o + 28 + 12 * k])
                    for ch in range(s, e + 1):
                        res.setdefault(ch, g0 + ch - s)
        return res

    def advance(self, gid):
        return self.adv[gid] if gid < len(self.adv) else self.adv[-1]

    def contours(self, gid, depth=0):
        """Liste von Konturen; jede Kontur = Liste (x, y, on_curve)."""
        d = self.d
        g0 = self.t["glyf"][0]
        a, b = self.loca[gid], self.loca[gid + 1]
        if a == b:
            return []
        o = g0 + a
        nc = struct.unpack(">h", d[o: o + 2])[0]
        if nc >= 0:
            ends = struct.unpack(f">{nc}H", d[o + 10: o + 10 + 2 * nc])
            npts = ends[-1] + 1 if nc else 0
            p = o + 10 + 2 * nc
            il = struct.unpack(">H", d[p: p + 2])[0]
            p += 2 + il
            flags = []
            while len(flags) < npts:
                f = d[p]; p += 1
                flags.append(f)
                if f & 8:
                    r = d[p]; p += 1
                    flags.extend([f] * r)
            xs, ys = [], []
            v = 0
            for f in flags:
                if f & 2:
                    dx = d[p]; p += 1
                    v += dx if f & 16 else -dx
                elif not f & 16:
                    v += struct.unpack(">h", d[p: p + 2])[0]; p += 2
                xs.append(v)
            v = 0
            for f in flags:
                if f & 4:
                    dy = d[p]; p += 1
                    v += dy if f & 32 else -dy
                elif not f & 32:
                    v += struct.unpack(">h", d[p: p + 2])[0]; p += 2
                ys.append(v)
            out, s = [], 0
            for e in ends:
                out.append([(xs[i], ys[i], bool(flags[i] & 1)) for i in range(s, e + 1)])
                s = e + 1
            return out
        # zusammengesetzte Glyphe
        p = o + 10
        out = []
        while True:
            fl, gi = struct.unpack(">HH", d[p: p + 4]); p += 4
            if fl & 1:
                a1, a2 = struct.unpack(">hh", d[p: p + 4]); p += 4
            else:
                a1, a2 = struct.unpack(">bb", d[p: p + 2]); p += 2
            sx, sy, s01, s10 = 1.0, 1.0, 0.0, 0.0
            if fl & 8:
                sx = sy = struct.unpack(">h", d[p: p + 2])[0] / 16384; p += 2
            elif fl & 0x40:
                sx, sy = [v / 16384 for v in struct.unpack(">hh", d[p: p + 4])]; p += 4
            elif fl & 0x80:
                sx, s01, s10, sy = [v / 16384 for v in struct.unpack(">hhhh", d[p: p + 8])]; p += 8
            dx, dy = (a1, a2) if fl & 2 else (0, 0)
            for c in self.contours(gi, depth + 1):
                out.append([(x * sx + y * s10 + dx, x * s01 + y * sy + dy, on) for x, y, on in c])
            if not fl & 0x20:
                break
        return out

    def glyph(self, ch):
        return self.cmap.get(ord(ch), 0)


def contour_path(c, tf):
    """Quadratische TrueType-Kontur -> SVG-Pfad (tf: (x, y) -> (X, Y))."""
    n = len(c)
    if not n:
        return ""
    start = next((i for i in range(n) if c[i][2]), None)
    if start is None:
        x0 = (c[0][0] + c[1][0]) / 2; y0 = (c[0][1] + c[1][1]) / 2
        pts = c[:] ; first = (x0, y0, True); pts = pts[1:] + pts[:1]
    else:
        pts = c[start + 1:] + c[: start + 1]
        first = c[start]
    f = lambda x, y: "%s %s" % tuple(fmt(v) for v in tf(x, y))
    s = ["M" + f(first[0], first[1])]
    prev_off = None
    for x, y, on in pts:
        if on:
            if prev_off:
                s.append("Q" + f(*prev_off) + " " + f(x, y))
                prev_off = None
            else:
                s.append("L" + f(x, y))
        else:
            if prev_off:
                mx, my = (prev_off[0] + x) / 2, (prev_off[1] + y) / 2
                s.append("Q" + f(*prev_off) + " " + f(mx, my))
            prev_off = (x, y)
    if prev_off:
        s.append("Q" + f(*prev_off) + " " + f(first[0], first[1]))
    return "".join(s) + "Z"


def fmt(v):
    r = round(v, 1)
    return str(int(r)) if r == int(r) else str(r)


def text_width(font, text, size, tracking=0.0):
    sc = size / font.upm
    return sum(font.advance(font.glyph(ch)) * sc for ch in text) + tracking * size * max(len(text) - 1, 0)


def text_path(font, text, x, y, size, tracking=0.0):
    """Pfad-Daten für Text mit Grundlinie bei (x, y)."""
    sc = size / font.upm
    out = []
    cx = x
    for ch in text:
        gid = font.glyph(ch)
        for c in font.contours(gid):
            out.append(contour_path(c, lambda gx, gy, cx=cx: (cx + gx * sc, y - gy * sc)))
        cx += font.advance(gid) * sc + tracking * size
    return "".join(out)


def glyph_path(font, ch, size, tf):
    """Einzelne Glyphe (Ursprung Grundlinie links), tf erhält Koordinaten in px (y nach unten)."""
    sc = size / font.upm
    gid = font.glyph(ch)
    return "".join(contour_path(c, lambda gx, gy: tf(gx * sc, -gy * sc)) for c in font.contours(gid)), font.advance(gid) * sc
