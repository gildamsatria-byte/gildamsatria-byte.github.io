/* Denah sederhana untuk Kalkulator Octonaut.
 * Elemen: dinding (tebal 15 cm), pintu (90 x 210 cm), jendela (lebar bebas).
 * Luas lantai, atap, dan jumlah bukaan dihitung dari elemen yang digambar.
 * Semua berjalan di browser; gambar disimpan di localStorage perangkat ini saja.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const svg = $('dhSvg');
  if (!svg) return;

  const T = 0.15;          // tebal dinding (m)
  const DW = 0.9;          // lebar pintu (m)
  const DH = 2.1;          // tinggi pintu (m)
  const SNAP = 0.05;       // grid snap 5 cm
  const MAXF = 8;
  const KEY = 'octonaut-denah-v1';
  const ACC = '#1F5FD1', INK = '#141922', BAD = '#C0392B';

  const nf2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const rp = n => 'Rp' + nf0.format(Math.round(n));
  function rpShort(n) {
    if (Math.abs(n) >= 1e9) return 'Rp' + nf1.format(n / 1e9) + ' miliar';
    if (Math.abs(n) >= 1e6) return 'Rp' + nf1.format(n / 1e6) + ' juta';
    return rp(n);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function num(v) {
    if (v == null) return NaN;
    v = String(v).trim().replace(/\s/g, '').replace(/^Rp/i, '');
    if (v === '') return NaN;
    const hasComma = v.includes(','), dots = (v.match(/\./g) || []).length;
    if (hasComma) v = v.replace(/\./g, '').replace(',', '.');
    else if (dots > 1 || /^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
    const n = parseFloat(v);
    return isFinite(n) ? n : NaN;
  }
  const r4 = n => Math.round(n * 1e4) / 1e4;
  const snapv = v => r4(Math.round(v / SNAP) * SNAP);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---------- Harga satuan bawaan (contoh kasar, bisa diganti pengguna) ----------
  const ITEMS = [
    { k: 'dinding', n: 'Dinding bata 15 cm, plester-aci & cat dua sisi', f: 'panjang dinding × tinggi − luas pintu & jendela', u: 'm²', p: 450000 },
    { k: 'pintu', n: 'Pintu 90 × 210 cm lengkap kusen & kunci', f: 'jumlah pintu di denah', u: 'unit', p: 3500000 },
    { k: 'jendela', n: 'Jendela aluminium + kaca', f: 'lebar jendela × tinggi jendela', u: 'm²', p: 1500000 },
    { k: 'lantai', n: 'Penutup lantai keramik', f: 'luas bersih di dalam dinding, semua lantai', u: 'm²', p: 350000 },
    { k: 'plat', n: 'Plat lantai beton (lantai 2 ke atas)', f: 'luas lantai bruto lantai 2 ke atas', u: 'm²', p: 1400000 },
    { k: 'atap', n: 'Atap & plafon', f: 'proyeksi gabungan semua lantai + teritis', u: 'm²', p: 650000 },
    { k: 'pondasi', n: 'Pondasi & sloof di bawah dinding lantai 1', f: 'panjang dinding lantai 1', u: 'm′', p: 1100000 },
    { k: 'lain', n: 'Kolom-balok, instalasi listrik-air & persiapan', f: 'luas lantai bruto semua lantai', u: 'm²', p: 1200000 }
  ];
  const SET0 = { h: '3,2', jh: '1,2', jw: '120', ter: '0,6' };

  let S = { v: 1, floors: [], cur: 0, prices: {}, set: Object.assign({}, SET0), nid: 1 };
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (j && j.v === 1 && Array.isArray(j.floors)) {
      S.floors = j.floors; S.cur = j.cur | 0; S.prices = j.prices || {}; S.nid = j.nid || 1;
      S.set = Object.assign({}, SET0, j.set || {});
    }
  } catch (e) { /* abaikan */ }
  let saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify({ v: 1, floors: S.floors, cur: S.cur, prices: S.prices, set: S.set, nid: S.nid })); } catch (e) { /* abaikan */ }
    }, 250);
  }
  const H = () => { const v = num(S.set.h); return v > 0 ? v : 3.2; };
  const JH = () => { const v = num(S.set.jh); return v > 0 ? v : 1.2; };
  const JW = () => { const v = num(S.set.jw); return v >= 20 ? v / 100 : 1.2; };
  const TER = () => { const v = num(S.set.ter); return v >= 0 ? Math.min(v, 3) : 0.6; };
  const price = k => { const v = num(S.prices[k]); return isFinite(v) && v >= 0 ? v : ITEMS.find(i => i.k === k).p; };

  // ---------- Data dari kalkulator di atas ----------
  let K = window.octoKalk || null;
  const nFloors = () => Math.max(1, Math.min(MAXF, (K && K.lt) || 1));
  const lahan = () => (K && K.hasDim ? { L: K.L, P: K.P } : { L: 10, P: 20 });
  function ensureFloors() {
    while (S.floors.length < nFloors()) S.floors.push({ walls: [], ops: [] });
    if (S.cur >= nFloors()) S.cur = nFloors() - 1;
    if (S.cur < 0) S.cur = 0;
  }
  ensureFloors();
  const F = () => S.floors[S.cur];

  // ---------- Geometri ----------
  const wlen = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  function at(w, t) { const L = wlen(w) || 1; return [w.a[0] + (w.b[0] - w.a[0]) * t / L, w.a[1] + (w.b[1] - w.a[1]) * t / L]; }
  function proj(w, p) {
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L2 = dx * dx + dy * dy || 1e-9;
    let u = ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / L2;
    u = Math.max(0, Math.min(1, u));
    const q = [w.a[0] + u * dx, w.a[1] + u * dy];
    const cr = dx * (p[1] - w.a[1]) - dy * (p[0] - w.a[0]);
    return { t: u * Math.sqrt(L2), q, d: Math.hypot(p[0] - q[0], p[1] - q[1]), side: cr >= 0 ? 1 : -1 };
  }
  const wallMap = f => new Map(f.walls.map(w => [w.id, w]));
  const isH = w => Math.abs(w.a[1] - w.b[1]) < 1e-6;
  const isV = w => Math.abs(w.a[0] - w.b[0]) < 1e-6;

  // Gabungkan dinding segaris yang bertumpuk (mis. dinding bersama dua ruang kotak)
  function normalize(f) {
    const wm = wallMap(f);
    const opsAbs = f.ops.map(o => { const w = wm.get(o.w); return w ? { o, p: at(w, o.t), w0: o.w } : null; }).filter(Boolean);
    const walls = f.walls.filter(w => wlen(w) >= 0.049);
    const groups = new Map(), out = [];
    walls.forEach(w => {
      if (isH(w)) { const k = 'h' + w.a[1].toFixed(4); (groups.get(k) || groups.set(k, []).get(k)).push({ lo: Math.min(w.a[0], w.b[0]), hi: Math.max(w.a[0], w.b[0]), w, c: w.a[1], h: 1 }); }
      else if (isV(w)) { const k = 'v' + w.a[0].toFixed(4); (groups.get(k) || groups.set(k, []).get(k)).push({ lo: Math.min(w.a[1], w.b[1]), hi: Math.max(w.a[1], w.b[1]), w, c: w.a[0], h: 0 }); }
      else out.push(w);
    });
    groups.forEach(arr => {
      arr.sort((a, b) => a.lo - b.lo);
      let cur = null;
      const flush = () => {
        if (!cur) return;
        if (cur.n === 1) out.push(cur.w);
        else out.push({ id: cur.w.id, a: cur.h ? [cur.lo, cur.c] : [cur.c, cur.lo], b: cur.h ? [cur.hi, cur.c] : [cur.c, cur.hi] });
      };
      arr.forEach(s => {
        if (cur && s.lo < cur.hi - 1e-6) { cur.hi = Math.max(cur.hi, s.hi); cur.n++; }
        else { flush(); cur = { lo: s.lo, hi: s.hi, w: s.w, c: s.c, h: s.h, n: 1 }; }
      });
      flush();
    });
    f.walls = out;
    const nm = wallMap(f);
    f.ops = opsAbs.map(({ o, p, w0 }) => {
      let w = nm.get(w0);
      if (!w || proj(w, p).d > 1e-3) w = f.walls.find(x => proj(x, p).d < 1e-3);
      if (!w) return null;
      const L = wlen(w);
      if (L < o.len + 0.02) return null;
      o.w = w.id;
      o.t = r4(Math.min(L - o.len / 2, Math.max(o.len / 2, proj(w, p).t)));
      return o;
    }).filter(Boolean);
  }

  // ---------- Hitung luas dari gambar (raster 5 cm) ----------
  let R = null;
  function compute() {
    const n = nFloors(), ter = TER();
    const fl = S.floors.slice(0, n);
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity, any = false;
    fl.forEach(f => f.walls.forEach(w => {
      any = true;
      mnx = Math.min(mnx, w.a[0], w.b[0]); mxx = Math.max(mxx, w.a[0], w.b[0]);
      mny = Math.min(mny, w.a[1], w.b[1]); mxy = Math.max(mxy, w.a[1], w.b[1]);
    }));
    const res = { floors: [], roof: 0, img: null };
    fl.forEach(f => res.floors.push({ net: 0, gross: 0, len: f.walls.reduce((s, w) => s + wlen(w), 0), doors: f.ops.filter(o => o.k === 'd').length, wins: f.ops.filter(o => o.k === 'j').length, winLen: f.ops.filter(o => o.k === 'j').reduce((s, o) => s + o.len, 0), rooms: [] }));
    if (!any) { R = res; return; }
    const mg = ter + T + 0.15;
    let cell = 0.05, i0, j0, nx, ny;
    for (;;) {
      i0 = Math.floor((mnx - mg) / cell); j0 = Math.floor((mny - mg) / cell);
      nx = Math.ceil((mxx + mg) / cell) - i0 + 1; ny = Math.ceil((mxy + mg) / cell) - j0 + 1;
      if (nx * ny <= 3e6 || cell >= 0.2) break;
      cell *= 2;
    }
    const N = nx * ny, A1 = cell * cell, rr = T / 2 + 1e-6;
    const queue = new Int32Array(N);
    const union = new Uint8Array(N);
    fl.forEach((f, fi) => {
      const wall = new Uint8Array(N);
      f.walls.forEach(w => {
        const ax = w.a[0], ay = w.a[1], bx = w.b[0], by = w.b[1];
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
        const ci0 = Math.max(0, Math.floor((Math.min(ax, bx) - rr) / cell) - i0 - 1), ci1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + rr) / cell) - i0 + 1);
        const cj0 = Math.max(0, Math.floor((Math.min(ay, by) - rr) / cell) - j0 - 1), cj1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by) + rr) / cell) - j0 + 1);
        for (let j = cj0; j <= cj1; j++) {
          const cy = (j0 + j) * cell;
          for (let i = ci0; i <= ci1; i++) {
            const cx = (i0 + i) * cell;
            let u = ((cx - ax) * dx + (cy - ay) * dy) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
            const ex = ax + u * dx - cx, ey = ay + u * dy - cy;
            if (ex * ex + ey * ey <= rr * rr) wall[j * nx + i] = 1;
          }
        }
      });
      // isi dari luar
      const st = new Uint8Array(N); // 0 belum, 1 luar, 2 dalam, 3 dinding
      let qh = 0, qt = 0, outC = 0;
      for (let k = 0; k < N; k++) if (wall[k]) st[k] = 3;
      const pushOut = k => { if (!st[k]) { st[k] = 1; queue[qt++] = k; } };
      for (let i = 0; i < nx; i++) { pushOut(i); pushOut((ny - 1) * nx + i); }
      for (let j = 0; j < ny; j++) { pushOut(j * nx); pushOut(j * nx + nx - 1); }
      while (qh < qt) {
        const k = queue[qh++]; outC++;
        const i = k % nx;
        if (i > 0) pushOut(k - 1);
        if (i < nx - 1) pushOut(k + 1);
        if (k >= nx) pushOut(k - nx);
        if (k < N - nx) pushOut(k + nx);
      }
      // ruang tertutup
      let inC = 0;
      const rooms = [];
      for (let s = 0; s < N; s++) {
        if (st[s]) continue;
        qh = 0; qt = 0; st[s] = 2; queue[qt++] = s;
        let sx = 0, sy = 0;
        while (qh < qt) {
          const k = queue[qh++];
          const i = k % nx, j = (k - i) / nx;
          sx += i; sy += j;
          const nb = [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, k >= nx ? k - nx : -1, k < N - nx ? k + nx : -1];
          for (const m of nb) if (m >= 0 && !st[m]) { st[m] = 2; queue[qt++] = m; }
        }
        inC += qt;
        const area = qt * A1;
        if (area >= 0.25) {
          const mxi = sx / qt, myj = sy / qt;
          let best = queue[0], bd = Infinity;
          for (let q = 0; q < qt; q += Math.max(1, (qt / 4000) | 0)) {
            const k = queue[q], i = k % nx, j = (k - i) / nx, d = (i - mxi) * (i - mxi) + (j - myj) * (j - myj);
            if (d < bd) { bd = d; best = k; }
          }
          const bi = best % nx, bj = (best - bi) / nx;
          rooms.push({ a: area, x: (i0 + bi) * cell, y: (j0 + bj) * cell });
        }
      }
      const r = res.floors[fi];
      r.net = inC * A1;
      r.gross = r.net > 0 ? (N - outC) * A1 : 0;
      r.rooms = rooms;
      if (r.net > 0) for (let k = 0; k < N; k++) if (st[k] !== 1) union[k] = 1;
      if (fi === S.cur && r.net > 0) {
        const cv = document.createElement('canvas');
        cv.width = nx; cv.height = ny;
        const ctx = cv.getContext('2d');
        const im = ctx.createImageData(nx, ny);
        for (let k = 0; k < N; k++) if (st[k] === 2) { const o = k * 4; im.data[o] = 232; im.data[o + 1] = 238; im.data[o + 2] = 249; im.data[o + 3] = 255; }
        ctx.putImageData(im, 0, 0);
        res.img = { href: cv.toDataURL('image/png'), x: (i0 - 0.5) * cell, y: (j0 - 0.5) * cell, w: nx * cell, h: ny * cell };
      }
    });
    // atap: proyeksi gabungan + teritis (dilatasi kotak)
    const rc = Math.round(ter / cell);
    let roofMask = union;
    if (rc > 0) {
      const t1 = new Uint8Array(N), t2 = new Uint8Array(N), ps = new Int32Array(Math.max(nx, ny) + 1);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) ps[i + 1] = ps[i] + union[j * nx + i];
        for (let i = 0; i < nx; i++) { const a = Math.max(0, i - rc), b = Math.min(nx, i + rc + 1); t1[j * nx + i] = ps[b] - ps[a] > 0 ? 1 : 0; }
      }
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) ps[j + 1] = ps[j] + t1[j * nx + i];
        for (let j = 0; j < ny; j++) { const a = Math.max(0, j - rc), b = Math.min(ny, j + rc + 1); t2[j * nx + i] = ps[b] - ps[a] > 0 ? 1 : 0; }
      }
      roofMask = t2;
    }
    let rcnt = 0;
    for (let k = 0; k < N; k++) rcnt += roofMask[k];
    res.roof = rcnt * A1;
    R = res;
  }

  function qty() {
    const n = nFloors(), h = H(), jh = JH();
    const q = { dinding: 0, pintu: 0, jendela: 0, lantai: 0, plat: 0, atap: R.roof, pondasi: 0, lain: 0 };
    for (let i = 0; i < n; i++) {
      const r = R.floors[i];
      q.dinding += Math.max(0, r.len * h - r.doors * DW * Math.min(DH, h) - r.winLen * Math.min(jh, h));
      q.pintu += r.doors;
      q.jendela += r.winLen * jh;
      q.lantai += r.net;
      if (i > 0) q.plat += r.gross;
      if (i === 0) q.pondasi = r.len;
      q.lain += r.gross;
    }
    return q;
  }

  // ---------- Riwayat ----------
  let undoS = [], redoS = [];
  const snap = () => JSON.stringify({ floors: S.floors, nid: S.nid });
  function pushHist() { undoS.push(snap()); if (undoS.length > 100) undoS.shift(); redoS = []; }
  function restore(s) { const j = JSON.parse(s); S.floors = j.floors; S.nid = j.nid; ensureFloors(); sel = null; chain = null; rectA = null; changed(); }
  function undo() { if (!undoS.length) return; redoS.push(snap()); restore(undoS.pop()); }
  function redo() { if (!redoS.length) return; undoS.push(snap()); restore(redoS.pop()); }

  // ---------- Tampilan ----------
  const gStatic = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const gDyn = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(gStatic); svg.appendChild(gDyn);
  let vb = { x: -2, y: -2, w: 14, h: 24 };
  const setVB = () => svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].map(v => r4(v)).join(' '));
  function aspect() { const r = svg.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r.width / r.height : 1.5; }
  function pxToW(px) { const m = svg.getScreenCTM(); return m && m.a ? px / m.a : px * vb.w / 800; }
  function toWorld(e) {
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    return [p.x, p.y];
  }
  function fit() {
    const { L, P } = lahan();
    let x0 = -0.6, y0 = -0.8, x1 = L + 0.6, y1 = P + 1.6;
    S.floors.forEach(f => f.walls.forEach(w => { x0 = Math.min(x0, w.a[0], w.b[0]); x1 = Math.max(x1, w.a[0], w.b[0]); y0 = Math.min(y0, w.a[1], w.b[1]); y1 = Math.max(y1, w.a[1], w.b[1]); }));
    const m = 0.8, ar = aspect();
    let w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
    if (w / h < ar) w = h * ar; else h = w / ar;
    vb = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
    setVB(); renderStatic();
  }
  function zoom(f, cx, cy) {
    if (cx == null) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
    const nw = Math.min(300, Math.max(1.5, vb.w * f)), k = nw / vb.w;
    vb = { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w: nw, h: vb.h * k };
    setVB(); renderStatic();
  }
  if (window.ResizeObserver) new ResizeObserver(() => {
    const ar = aspect(), cy = vb.y + vb.h / 2;
    vb.h = vb.w / ar; vb.y = cy - vb.h / 2; setVB(); renderStatic();
  }).observe(svg);

  const NSS = 'vector-effect="non-scaling-stroke"';
  const line = (a, b, col, sw, extra) => '<line x1="' + r4(a[0]) + '" y1="' + r4(a[1]) + '" x2="' + r4(b[0]) + '" y2="' + r4(b[1]) + '" stroke="' + col + '" stroke-width="' + sw + '" ' + (extra || '') + '/>';
  function text(x, y, s, fs, opt) {
    opt = opt || {};
    const halo = pxToW(3.2);
    return '<text x="' + r4(x) + '" y="' + r4(y) + '" font-size="' + r4(fs) + '" font-family="IBM Plex Mono,monospace" text-anchor="middle" dominant-baseline="central" fill="' + (opt.fill || '#4A5261') + '"' + (opt.bold ? ' font-weight="600"' : '') + ' stroke="#fff" stroke-width="' + r4(halo) + '" stroke-linejoin="round" paint-order="stroke"' + (opt.rot ? ' transform="rotate(' + r4(opt.rot) + ' ' + r4(x) + ' ' + r4(y) + ')"' : '') + '>' + esc(s) + '</text>';
  }
  function opSvg(w, o, col, bg) {
    const c = at(w, o.t), ang = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]) * 180 / Math.PI, hw = o.len / 2, ht = T / 2;
    const ln = (x1, y1, x2, y2, sw) => '<line x1="' + r4(x1) + '" y1="' + r4(y1) + '" x2="' + r4(x2) + '" y2="' + r4(y2) + '" stroke="' + col + '" stroke-width="' + (sw || 1.2) + '" ' + NSS + '/>';
    let s = '<g transform="translate(' + r4(c[0]) + ' ' + r4(c[1]) + ') rotate(' + r4(ang) + ')">';
    s += '<rect x="' + r4(-hw) + '" y="' + r4(-ht - 0.006) + '" width="' + r4(o.len) + '" height="' + r4(T + 0.012) + '" fill="' + bg + '"/>';
    s += ln(-hw, -ht, -hw, ht) + ln(hw, -ht, hw, ht);
    if (o.k === 'd') {
      const sy = (o.f & 1) ? 1 : -1, hx = (o.f & 2) ? hw : -hw, ox = -hx, y0 = sy * ht, y1 = sy * (ht + o.len);
      const sweep = (ox - hx) * sy > 0 ? 1 : 0;
      s += ln(hx, y0, hx, y1, 1.8);
      s += '<path d="M' + r4(ox) + ' ' + r4(y0) + ' A' + r4(o.len) + ' ' + r4(o.len) + ' 0 0 ' + sweep + ' ' + r4(hx) + ' ' + r4(y1) + '" fill="none" stroke="' + col + '" stroke-width="1" ' + NSS + ' stroke-dasharray="' + r4(pxToW(4)) + ' ' + r4(pxToW(3)) + '"/>';
    } else {
      s += ln(-hw, -ht, hw, -ht) + ln(-hw, ht, hw, ht) + ln(-hw, 0, hw, 0, 1.6);
    }
    return s + '</g>';
  }

  let sel = null;            // {k:'w'|'o', id}
  let tool = 'dinding';
  let chain = null;          // {origin, last}
  let rectA = null, rectDrag = false, downAt = null;
  let drag = null;
  let ortho = true, shiftKey = false, showDims = true;
  let lastP = null;

  function renderStatic() {
    const fs = pxToW(12), { L, P } = lahan();
    let h = '';
    // grid
    const step = vb.w > 90 ? 5 : 1;
    const gx0 = Math.floor(Math.min(-40, vb.x)), gx1 = Math.ceil(Math.max(L + 40, vb.x + vb.w));
    const gy0 = Math.floor(Math.min(-40, vb.y)), gy1 = Math.ceil(Math.max(P + 40, vb.y + vb.h));
    let g = '';
    for (let x = Math.ceil(gx0 / step) * step; x <= gx1; x += step) g += '<line x1="' + x + '" y1="' + gy0 + '" x2="' + x + '" y2="' + gy1 + '" stroke="' + (x % 5 === 0 ? '#DEE2E7' : '#EEF1F4') + '" stroke-width="1" ' + NSS + '/>';
    for (let y = Math.ceil(gy0 / step) * step; y <= gy1; y += step) g += '<line x1="' + gx0 + '" y1="' + y + '" x2="' + gx1 + '" y2="' + y + '" stroke="' + (y % 5 === 0 ? '#DEE2E7' : '#EEF1F4') + '" stroke-width="1" ' + NSS + '/>';
    h += g;
    // lahan, jalan, sempadan
    h += '<rect x="0" y="0" width="' + r4(L) + '" height="' + r4(P) + '" fill="rgba(207,227,210,.35)" stroke="' + INK + '" stroke-width="1.5" ' + NSS + '/>';
    h += '<rect x="-1" y="' + r4(P + 0.35) + '" width="' + r4(L + 2) + '" height="0.9" fill="#C4C9D1"/>';
    h += text(L / 2, P + 0.8, 'JALAN', fs, {});
    h += text(L / 2, -0.45, 'lebar ' + nf2.format(L) + ' m', fs, {});
    h += text(-0.45, P / 2, 'panjang ' + nf2.format(P) + ' m', fs, { rot: -90 });
    if (K && K.hasDim && K.effW > 0 && K.effD > 0) {
      h += '<rect x="' + r4(K.gS) + '" y="' + r4(K.gB) + '" width="' + r4(K.effW) + '" height="' + r4(K.effD) + '" fill="none" stroke="#C98A12" stroke-width="1.5" ' + NSS + ' stroke-dasharray="' + r4(pxToW(6)) + ' ' + r4(pxToW(4)) + '"/>';
    }
    // isi ruang
    if (R && R.img) h += '<image href="' + R.img.href + '" x="' + r4(R.img.x) + '" y="' + r4(R.img.y) + '" width="' + r4(R.img.w) + '" height="' + r4(R.img.h) + '" preserveAspectRatio="none" style="image-rendering:pixelated"/>';
    // lantai bawah sebagai acuan
    if (S.cur > 0) S.floors[S.cur - 1].walls.forEach(w => { h += line(w.a, w.b, '#AEB5C0', T, 'stroke-linecap="square" opacity=".45"'); });
    const f = F(), wm = wallMap(f);
    f.walls.forEach(w => { h += line(w.a, w.b, sel && sel.k === 'w' && sel.id === w.id ? ACC : INK, T, 'stroke-linecap="square"'); });
    f.ops.forEach(o => { const w = wm.get(o.w); if (w) h += opSvg(w, o, sel && sel.k === 'o' && sel.id === o.id ? ACC : INK, '#fff'); });
    // ukuran dinding
    if (showDims) {
      const minL = pxToW(46);
      f.walls.forEach(w => {
        const Lw = wlen(w); if (Lw < minL) return;
        const dx = (w.b[0] - w.a[0]) / Lw, dy = (w.b[1] - w.a[1]) / Lw;
        let ang = Math.atan2(dy, dx) * 180 / Math.PI;
        let nx = -dy, ny = dx;
        if (ang > 90 || ang <= -90) { ang += ang > 0 ? -180 : 180; }
        if (ny > 0 || (Math.abs(ny) < 1e-9 && nx > 0)) { nx = -nx; ny = -ny; }
        const m = at(w, Lw / 2), off = T / 2 + fs * 0.8;
        h += text(m[0] + nx * off, m[1] + ny * off, nf2.format(Lw), fs * 0.92, { rot: ang });
      });
    }
    // luas ruang
    if (R && R.floors[S.cur]) R.floors[S.cur].rooms.forEach(r => {
      if (r.a >= 1) h += text(r.x, r.y, nf1.format(r.a) + ' m²', fs * 1.05, { fill: '#123B8C', bold: true });
    });
    gStatic.innerHTML = h;
  }

  function marker(q) {
    const r = pxToW(4.5);
    return '<circle cx="' + r4(q[0]) + '" cy="' + r4(q[1]) + '" r="' + r4(r) + '" fill="#fff" stroke="' + ACC + '" stroke-width="1.5" ' + NSS + '/>';
  }
  function renderDyn(p) {
    lastP = p;
    if (!p || drag) { gDyn.innerHTML = ''; return; }
    let h = '';
    const fs = pxToW(12);
    if (tool === 'dinding') {
      const q = snapPt(p, chain ? chain.last : null);
      if (chain) {
        h += line(chain.last, q, ACC, T, 'stroke-linecap="square" opacity=".55"');
        const L = dist(chain.last, q);
        if (L > 0.01) h += text((chain.last[0] + q[0]) / 2, (chain.last[1] + q[1]) / 2 - fs * 1.1, nf2.format(L) + ' m', fs, { fill: ACC, bold: true });
        if (dist(q, chain.origin) < 0.01 && dist(chain.origin, chain.last) > 0.01) h += '<circle cx="' + r4(q[0]) + '" cy="' + r4(q[1]) + '" r="' + r4(pxToW(9)) + '" fill="none" stroke="' + ACC + '" stroke-width="1.5" ' + NSS + '/>';
      }
      h += marker(q);
    } else if (tool === 'ruang') {
      const q = snapPt(p, null);
      if (rectA) {
        const a = rectA, c = [[a[0], a[1]], [q[0], a[1]], [q[0], q[1]], [a[0], q[1]]];
        for (let i = 0; i < 4; i++) h += line(c[i], c[(i + 1) % 4], ACC, T, 'stroke-linecap="square" opacity=".55"');
        const wv = Math.abs(q[0] - a[0]), hv = Math.abs(q[1] - a[1]);
        h += text((a[0] + q[0]) / 2, (a[1] + q[1]) / 2, nf2.format(wv) + ' × ' + nf2.format(hv) + ' m', fs, { fill: ACC, bold: true });
      }
      h += marker(q);
    } else if (tool === 'pintu' || tool === 'jendela') {
      const c = opCandidate(p);
      if (c) h += opSvg(c.w, { t: c.t, len: c.len, k: tool === 'pintu' ? 'd' : 'j', f: c.f }, c.ok ? ACC : BAD, 'rgba(232,238,249,.95)');
    }
    gDyn.innerHTML = h;
  }

  // ---------- Snap ----------
  function snapPt(p, from) {
    const tol = pxToW(10), f = F();
    const pts = [];
    f.walls.forEach(w => { pts.push(w.a, w.b); });
    if (chain) pts.push(chain.origin);
    if (S.cur > 0) S.floors[S.cur - 1].walls.forEach(w => { pts.push(w.a, w.b); });
    let x = p[0], y = p[1];
    const useOrtho = from && (ortho !== shiftKey);
    if (useOrtho) {
      const horiz = Math.abs(x - from[0]) >= Math.abs(y - from[1]);
      const fi = horiz ? 0 : 1;
      let v = horiz ? x : y, best = null, bd = tol;
      pts.forEach(a => { const d = Math.abs(a[fi] - v); if (d < bd) { bd = d; best = a[fi]; } });
      v = best != null ? best : snapv(v);
      return horiz ? [r4(v), from[1]] : [from[0], r4(v)];
    }
    let bp = null, bd = tol;
    pts.forEach(a => { const d = Math.hypot(a[0] - x, a[1] - y); if (d < bd) { bd = d; bp = a; } });
    if (bp) return [bp[0], bp[1]];
    for (const w of f.walls) {
      const pr = proj(w, [x, y]);
      if (pr.d < tol) {
        if (isH(w)) return [snapv(pr.q[0]), w.a[1]];
        if (isV(w)) return [w.a[0], snapv(pr.q[1])];
        return [r4(pr.q[0]), r4(pr.q[1])];
      }
    }
    return [snapv(x), snapv(y)];
  }

  // ---------- Bukaan ----------
  function overlaps(f, wid, t, ol, ex) {
    return f.ops.some(o => o.w === wid && o.id !== ex && Math.abs(o.t - t) < (o.len + ol) / 2 + 0.05 - 1e-6);
  }
  function opCandidate(p) {
    const f = F(), tol = pxToW(10) + T / 2 + 0.25;
    let best = null, bd = Infinity;
    f.walls.forEach(w => { const pr = proj(w, p); if (pr.d <= tol && pr.d < bd) { bd = pr.d; best = { w, pr }; } });
    if (!best) return null;
    const L = wlen(best.w), ol = tool === 'pintu' ? DW : JW();
    const c = { w: best.w, len: ol, t: L / 2, f: best.pr.side > 0 ? 1 : 0, ok: true, msg: '' };
    const mn = ol / 2 + 0.05, mx = L - ol / 2 - 0.05;
    if (mx < mn) { c.ok = false; c.msg = 'Dinding ini terlalu pendek untuk ' + (tool === 'pintu' ? 'pintu 90 cm' : 'jendela ' + nf0.format(ol * 100) + ' cm') + '.'; return c; }
    c.t = r4(Math.min(mx, Math.max(mn, snapv(best.pr.t))));
    if (overlaps(f, best.w.id, c.t, ol, null)) { c.ok = false; c.msg = 'Bertabrakan dengan pintu atau jendela lain di dinding ini.'; }
    return c;
  }
  function hit(p) {
    const f = F(), tol = pxToW(8), wm = wallMap(f);
    for (const o of f.ops) {
      const w = wm.get(o.w); if (!w) continue;
      const pr = proj(w, p);
      if (Math.abs(pr.t - o.t) <= o.len / 2 && pr.d <= T / 2 + tol) return { k: 'o', id: o.id };
    }
    let best = null, bd = Infinity;
    f.walls.forEach(w => { const pr = proj(w, p); if (pr.d <= T / 2 + tol && pr.d < bd) { bd = pr.d; best = w; } });
    return best ? { k: 'w', id: best.id } : null;
  }

  // ---------- Mutasi ----------
  let tracked = false;
  function track() { if (tracked) return; tracked = true; try { if (typeof gtag === 'function') gtag('event', 'denah_gambar'); } catch (e) { /* abaikan */ } }
  function addWalls(list) {
    pushHist();
    const f = F();
    list.forEach(([a, b]) => { if (dist(a, b) >= 0.05) f.walls.push({ id: S.nid++, a: [a[0], a[1]], b: [b[0], b[1]] }); });
    normalize(f);
    changed();
  }
  function finishRect(q) {
    const a = rectA; rectA = null;
    if (Math.abs(q[0] - a[0]) < 0.3 || Math.abs(q[1] - a[1]) < 0.3) { toast('Ruang terlalu kecil, minimal 30 cm tiap sisi.'); return; }
    const c = [[a[0], a[1]], [q[0], a[1]], [q[0], q[1]], [a[0], q[1]]];
    addWalls([[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]]);
  }
  function delSel() {
    if (!sel) return;
    pushHist();
    const f = F();
    if (sel.k === 'w') { f.walls = f.walls.filter(w => w.id !== sel.id); f.ops = f.ops.filter(o => o.w !== sel.id); }
    else f.ops = f.ops.filter(o => o.id !== sel.id);
    sel = null; changed();
  }
  function changed() {
    compute(); renderStatic(); renderDyn(lastP); renderFloors(); renderProps(); renderSum(); renderBoq(); renderAlerts(); updHint(); save();
    if (S.floors.some(f => f.walls.length)) track();
  }

  // ---------- Pointer ----------
  function startPan(e) {
    drag = { type: 'pan', cx: e.clientX, cy: e.clientY, vx: vb.x, vy: vb.y };
    svg.classList.add('panning'); gDyn.innerHTML = '';
  }
  svg.addEventListener('pointerdown', e => {
    active = true;
    shiftKey = e.shiftKey;
    if (e.button === 2) return;
    try { svg.setPointerCapture(e.pointerId); } catch (_) { /* abaikan */ }
    if (e.button === 1) { e.preventDefault(); startPan(e); return; }
    const p = toWorld(e);
    if (tool === 'pilih') {
      const h = hit(p);
      if (h) { sel = h; if (h.k === 'o') { drag = { type: 'op', id: h.id, moved: false, snap: snap() }; } }
      else { sel = null; startPan(e); }
      renderStatic(); renderProps(); return;
    }
    if (tool === 'dinding') {
      const q = snapPt(p, chain ? chain.last : null);
      if (!chain) chain = { origin: q, last: q };
      else {
        if (dist(q, chain.last) < 0.04) return;
        const closing = dist(q, chain.origin) < 0.01;
        const from = chain.last;
        chain.last = q;
        addWalls([[from, q]]);
        if (closing) chain = null;
      }
      updHint(); renderDyn(p); return;
    }
    if (tool === 'ruang') {
      const q = snapPt(p, null);
      if (!rectA) { rectA = q; rectDrag = true; downAt = [e.clientX, e.clientY]; }
      else finishRect(q);
      updHint(); renderDyn(p); return;
    }
    if (tool === 'pintu' || tool === 'jendela') {
      const c = opCandidate(p);
      if (c && c.ok) {
        pushHist();
        F().ops.push({ id: S.nid++, w: c.w.id, t: c.t, len: c.len, k: tool === 'pintu' ? 'd' : 'j', f: c.f });
        changed();
      } else toast(c ? c.msg : 'Klik tepat pada dinding.');
    }
  });
  svg.addEventListener('pointermove', e => {
    shiftKey = e.shiftKey;
    if (drag && drag.type === 'pan') {
      const m = svg.getScreenCTM(); if (!m) return;
      vb.x = drag.vx - (e.clientX - drag.cx) / m.a; vb.y = drag.vy - (e.clientY - drag.cy) / m.d; setVB(); return;
    }
    const p = toWorld(e);
    if (drag && drag.type === 'op') {
      const f = F(), o = f.ops.find(x => x.id === drag.id), w = o && wallMap(f).get(o.w);
      if (!w) return;
      const L = wlen(w), t = r4(Math.min(L - o.len / 2 - 0.05, Math.max(o.len / 2 + 0.05, snapv(proj(w, p).t))));
      if (t !== o.t && !overlaps(f, w.id, t, o.len, o.id)) { o.t = t; drag.moved = true; renderStatic(); }
      return;
    }
    renderDyn(p);
  });
  svg.addEventListener('pointerup', e => {
    if (drag) {
      if (drag.type === 'op' && drag.moved) { undoS.push(drag.snap); redoS = []; changed(); }
      drag = null; svg.classList.remove('panning'); return;
    }
    if (tool === 'ruang' && rectA && rectDrag) {
      rectDrag = false;
      if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) { finishRect(snapPt(toWorld(e), null)); updHint(); renderDyn(toWorld(e)); }
    }
  });
  svg.addEventListener('pointerleave', () => { if (!drag) gDyn.innerHTML = ''; });
  svg.addEventListener('dblclick', e => { e.preventDefault(); if (chain) { chain = null; updHint(); renderDyn(lastP); } });
  svg.addEventListener('contextmenu', e => { if (chain || rectA) { e.preventDefault(); chain = null; rectA = null; updHint(); renderDyn(lastP); } });
  svg.addEventListener('wheel', e => { e.preventDefault(); const p = toWorld(e); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p[0], p[1]); renderDyn(p); }, { passive: false });

  // ---------- Keyboard ----------
  let active = false;
  const sec = $('denah');
  document.addEventListener('pointerdown', e => { if (!sec.contains(e.target)) active = false; else if (!svg.contains(e.target)) active = true; }, true);
  document.addEventListener('keydown', e => {
    if (!active) return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'escape') { if (chain || rectA) { chain = null; rectA = null; } else sel = null; updHint(); renderStatic(); renderProps(); renderDyn(lastP); return; }
    if (k === 'delete' || k === 'backspace') { if (sel) { e.preventDefault(); delSel(); } return; }
    const map = { v: 'pilih', w: 'dinding', r: 'ruang', p: 'pintu', j: 'jendela' };
    if (map[k]) setTool(map[k]);
  });

  // ---------- UI panel ----------
  const HINTS = {
    pilih: 'Klik elemen untuk memilih. Seret pintu atau jendela untuk menggesernya di sepanjang dinding. Seret area kosong untuk menggeser tampilan.',
    dinding: 'Klik titik awal, lalu klik tiap sudut. Selesai: klik titik awal lagi, klik dua kali, atau tekan Esc. Tahan Shift untuk garis miring.',
    ruang: 'Seret dari satu sudut ke sudut seberang (atau klik dua titik) untuk membuat empat dinding sekaligus.',
    pintu: 'Klik pada dinding untuk memasang pintu 90 cm. Daun pintu membuka ke sisi yang Anda klik.',
    jendela: 'Klik pada dinding untuk memasang jendela. Lebarnya diatur di kolom "Lebar jendela".'
  };
  function updHint() {
    let t = HINTS[tool];
    if (tool === 'dinding' && chain) t = 'Klik sudut berikutnya. Klik titik awal untuk menutup, atau tekan Selesai.';
    if (tool === 'ruang' && rectA && !rectDrag) t = 'Klik sudut seberangnya.';
    $('dhHintT').textContent = t;
    $('dhDone').hidden = !(chain || (rectA && !rectDrag));
  }
  function setTool(t) {
    tool = t; chain = null; rectA = null;
    document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    $('dhCanvas').dataset.tool = t;
    updHint(); renderDyn(lastP);
  }
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('dhDone').addEventListener('click', () => { chain = null; rectA = null; updHint(); renderDyn(null); });

  function renderFloors() {
    const n = nFloors();
    let h = '';
    for (let i = 0; i < n; i++) {
      const c = S.floors[i].walls.length;
      h += '<button type="button" role="tab" aria-selected="' + (i === S.cur) + '" data-fl="' + i + '">Lantai ' + (i + 1) + (c ? '' : ' <span class="dh-empty">kosong</span>') + '</button>';
    }
    $('dhFloors').innerHTML = h;
    $('dhCopy').disabled = S.cur === 0;
    $('dhCopy').textContent = S.cur === 0 ? 'Salin dari lantai bawah' : 'Salin dari lantai ' + S.cur;
  }
  $('dhFloors').addEventListener('click', e => {
    const b = e.target.closest('[data-fl]'); if (!b) return;
    S.cur = +b.dataset.fl; sel = null; chain = null; rectA = null;
    compute(); renderStatic(); renderFloors(); renderProps(); renderSum(); updHint(); save();
  });

  function renderProps() {
    const f = F(), el = $('dhProps');
    if (!sel) { el.innerHTML = '<h3>Elemen terpilih</h3><p class="hint" style="margin:0">Pakai alat <b>Pilih</b> lalu klik dinding, pintu, atau jendela untuk melihat dan mengubahnya.</p>'; return; }
    if (sel.k === 'w') {
      const w = f.walls.find(x => x.id === sel.id); if (!w) { sel = null; return renderProps(); }
      const L = wlen(w), ops = f.ops.filter(o => o.w === w.id);
      const open = ops.reduce((s, o) => s + o.len * (o.k === 'd' ? Math.min(DH, H()) : Math.min(JH(), H())), 0);
      el.innerHTML = '<h3>Dinding</h3>' +
        stat('Panjang (as)', nf2.format(L) + ' m') + stat('Tebal', '15 cm') +
        stat('Luas bidang', nf2.format(Math.max(0, L * H() - open)) + ' m²') + stat('Pintu / jendela', ops.filter(o => o.k === 'd').length + ' / ' + ops.filter(o => o.k === 'j').length) +
        '<div class="btns" style="margin-top:10px"><button class="b sm" type="button" data-act="del">Hapus dinding</button></div>';
    } else {
      const o = f.ops.find(x => x.id === sel.id); if (!o) { sel = null; return renderProps(); }
      if (o.k === 'd') {
        el.innerHTML = '<h3>Pintu</h3>' + stat('Ukuran', '90 × 210 cm') +
          '<div class="btns" style="margin-top:10px"><button class="b sm" type="button" data-act="flip">Balik arah buka</button><button class="b sm" type="button" data-act="del">Hapus</button></div>';
      } else {
        el.innerHTML = '<h3>Jendela</h3>' +
          '<label class="mini">Lebar <span class="inp"><input id="dhOpW" inputmode="numeric" value="' + nf0.format(o.len * 100) + '"><span class="unit">cm</span></span></label>' +
          stat('Tinggi', nf2.format(JH()) + ' m') + stat('Luas', nf2.format(o.len * JH()) + ' m²') +
          '<div class="btns" style="margin-top:10px"><button class="b sm" type="button" data-act="del">Hapus</button></div>';
        $('dhOpW').addEventListener('change', ev => {
          const v = num(ev.target.value) / 100, w = wallMap(f).get(o.w);
          if (!(v >= 0.2) || !w) { ev.target.value = nf0.format(o.len * 100); return; }
          const L = wlen(w), t = Math.min(L - v / 2 - 0.05, Math.max(v / 2 + 0.05, o.t));
          if (v > L - 0.1 || overlaps(f, w.id, t, v, o.id)) { toast('Jendela ' + nf0.format(v * 100) + ' cm tidak muat di posisi ini.'); ev.target.value = nf0.format(o.len * 100); return; }
          pushHist(); o.len = r4(v); o.t = r4(t); changed();
        });
      }
    }
  }
  $('dhProps').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'del') delSel();
    if (b.dataset.act === 'flip') { const o = F().ops.find(x => x.id === sel.id); if (o) { pushHist(); o.f = (o.f + 1) % 4; changed(); } }
  });
  const stat = (k, v) => '<div class="stat"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>';

  function renderSum() {
    const r = R.floors[S.cur], n = nFloors();
    let tg = 0; for (let i = 0; i < n; i++) tg += R.floors[i].gross;
    $('dhSum').innerHTML = '<h3>Lantai ' + (S.cur + 1) + '</h3>' +
      stat('Luas bruto (termasuk dinding)', nf2.format(r.gross) + ' m²') +
      stat('Luas bersih ruang', nf2.format(r.net) + ' m²') +
      stat('Jumlah ruang tertutup', String(r.rooms.filter(x => x.a >= 1).length)) +
      stat('Panjang dinding', nf2.format(r.len) + ' m') +
      stat('Pintu', r.doors + ' unit') +
      stat('Jendela', r.wins + ' unit · ' + nf2.format(r.winLen * JH()) + ' m²') +
      '<h3 style="margin-top:14px">Seluruh bangunan</h3>' +
      stat('Total luas lantai (' + n + ' lt)', nf2.format(tg) + ' m²') +
      stat('Atap (proyeksi + teritis)', nf2.format(R.roof) + ' m²');
  }

  // Tabel biaya
  (function buildBoq() {
    $('dhBoqBody').innerHTML = ITEMS.map(it =>
      '<tr><td>' + esc(it.n) + '<div class="f">' + esc(it.f) + '</div></td>' +
      '<td class="n" data-q="' + it.k + '">–</td><td>' + esc(it.u) + '</td>' +
      '<td class="n"><span class="inp"><input data-p="' + it.k + '" inputmode="numeric" aria-label="Harga satuan ' + esc(it.n) + '"></span></td>' +
      '<td class="n" data-j="' + it.k + '">–</td></tr>').join('');
    ITEMS.forEach(it => {
      const inp = document.querySelector('[data-p="' + it.k + '"]');
      inp.value = nf0.format(price(it.k));
      inp.addEventListener('input', () => { const v = num(inp.value); if (isFinite(v) && v >= 0 && v !== it.p) S.prices[it.k] = v; else delete S.prices[it.k]; inp.classList.toggle('mod', it.k in S.prices); renderBoq(); save(); });
      inp.addEventListener('blur', () => { inp.value = nf0.format(price(it.k)); });
      inp.classList.toggle('mod', it.k in S.prices);
    });
  })();
  function renderBoq() {
    const q = qty();
    let tot = 0;
    ITEMS.forEach(it => {
      const v = q[it.k], j = v * price(it.k);
      tot += j;
      document.querySelector('[data-q="' + it.k + '"]').textContent = it.u === 'unit' ? nf0.format(v) : nf2.format(v);
      document.querySelector('[data-j="' + it.k + '"]').textContent = rp(j);
    });
    $('dhTotal').textContent = rp(tot);
    const g = q.lain, hm = K && K.harga > 0 ? K.harga : NaN;
    let cmp = '';
    if (g > 0) {
      cmp = 'Biaya dari elemen: <b>' + rpShort(tot) + '</b>, atau ' + rp(tot / g) + ' per m² luas lantai (' + nf2.format(g) + ' m²).';
      if (isFinite(hm)) {
        const pm = g * hm, d = (tot - pm) / pm * 100;
        cmp += ' Metode harga per m² di atas (' + rp(hm) + '/m²) untuk luas yang sama: ' + rpShort(pm) + ', selisih ' + (d >= 0 ? '+' : '−') + nf1.format(Math.abs(d)) + '%.';
      }
    } else cmp = 'Gambar dinding yang membentuk ruang tertutup untuk mulai menghitung.';
    $('dhCmp').innerHTML = cmp;
  }
  $('dhResetPrice').addEventListener('click', () => {
    S.prices = {};
    ITEMS.forEach(it => { const inp = document.querySelector('[data-p="' + it.k + '"]'); inp.value = nf0.format(it.p); inp.classList.remove('mod'); });
    renderBoq(); save(); toast('Harga satuan dikembalikan ke bawaan');
  });

  function renderAlerts() {
    const n = nFloors(), al = [];
    for (let i = 0; i < n; i++) {
      const f = S.floors[i], r = R.floors[i];
      if (f.walls.length && r.net === 0) al.push(['warn', 'Lantai ' + (i + 1) + ': dinding belum membentuk ruang tertutup, jadi luas lantai belum terhitung.']);
    }
    for (let i = n; i < S.floors.length; i++) if (S.floors[i].walls.length) al.push(['warn', 'Lantai ' + (i + 1) + ' punya gambar tapi tidak dihitung, karena jumlah lantai di atas ' + n + '.']);
    if (K && R.floors[0].gross > 0) {
      if (K.tapak > 0 && R.floors[0].gross > K.tapak + 0.05) al.push(['bad', 'Lantai 1 di denah ' + nf2.format(R.floors[0].gross) + ' m², melebihi lantai dasar maksimal ' + nf2.format(K.tapak) + ' m².']);
      let tg = 0; for (let i = 0; i < n; i++) tg += R.floors[i].gross;
      if (K.aKlb > 0 && tg > K.aKlb + 0.05) al.push(['bad', 'Total luas lantai di denah ' + nf2.format(tg) + ' m², melebihi batas KLB ' + nf2.format(K.aKlb) + ' m².']);
      if (K.hasDim) {
        let outL = false, outS = false;
        S.floors.slice(0, n).forEach(f => f.walls.forEach(w => [w.a, w.b].forEach(p => {
          const x0 = p[0] - T / 2, x1 = p[0] + T / 2, y0 = p[1] - T / 2, y1 = p[1] + T / 2;
          if (x0 < -1e-6 || y0 < -1e-6 || x1 > K.L + 1e-6 || y1 > K.P + 1e-6) outL = true;
          else if (x0 < K.gS - 1e-6 || x1 > K.L - K.gS + 1e-6 || y0 < K.gB - 1e-6 || y1 > K.P - K.gD + 1e-6) outS = true;
        })));
        if (outL) al.push(['bad', 'Ada dinding di luar batas lahan.']);
        else if (outS) al.push(['warn', 'Ada dinding yang melewati garis sempadan (garis putus-putus oranye).']);
      }
      if (!al.length) al.push(['ok', 'Denah masih di dalam batas lantai dasar, KLB, dan garis sempadan.']);
    }
    $('dhAlerts').innerHTML = al.map(a => '<div class="alert ' + a[0] + '">' + esc(a[1]) + '</div>').join('');
  }

  // ---------- Pengaturan ----------
  [['dhH', 'h'], ['dhJH', 'jh'], ['dhJW', 'jw'], ['dhTer', 'ter']].forEach(([id, k]) => {
    const el = $(id); el.value = S.set[k];
    el.addEventListener('input', () => { S.set[k] = el.value; if (k === 'ter') compute(); renderStatic(); renderProps(); renderSum(); renderBoq(); save(); });
  });
  $('dhOrtho').checked = ortho;
  $('dhOrtho').addEventListener('change', e => { ortho = e.target.checked; });
  $('dhDims').checked = showDims;
  $('dhDims').addEventListener('change', e => { showDims = e.target.checked; renderStatic(); });
  $('dhUndo').addEventListener('click', undo);
  $('dhRedo').addEventListener('click', redo);
  $('dhZin').addEventListener('click', () => zoom(1 / 1.3));
  $('dhZout').addEventListener('click', () => zoom(1.3));
  $('dhFit').addEventListener('click', fit);
  $('dhCopy').addEventListener('click', () => {
    if (S.cur === 0) return;
    if (F().walls.length && !confirm('Ganti gambar lantai ' + (S.cur + 1) + ' dengan salinan lantai ' + S.cur + '?')) return;
    pushHist(); S.floors[S.cur] = JSON.parse(JSON.stringify(S.floors[S.cur - 1])); sel = null; changed();
  });
  $('dhClear').addEventListener('click', () => {
    if (!F().walls.length) return;
    if (!confirm('Hapus semua dinding, pintu, dan jendela di lantai ' + (S.cur + 1) + '?')) return;
    pushHist(); S.floors[S.cur] = { walls: [], ops: [] }; sel = null; changed();
  });
  $('dhSample').addEventListener('click', () => {
    if (F().walls.length && !confirm('Ganti gambar lantai ' + (S.cur + 1) + ' dengan contoh denah?')) return;
    pushHist();
    const { L, P } = lahan();
    const gS = K && K.hasDim ? K.gS : 0, gB = K && K.hasDim ? K.gB : 2, gD = K && K.hasDim ? K.gD : 3;
    // rumah 9 × 12 m (as) di depan, tepat di belakang GSB
    let W = Math.min(9, L - 2 * gS - 1), D = Math.min(12, P - gD - gB - 0.5);
    W = Math.max(4, snapv(W)); D = Math.max(6, snapv(D));
    const x0 = snapv(Math.max(gS + 0.1, (L - W) / 2)), y1 = snapv(P - gD - 0.1), y0 = r4(y1 - D), x1 = r4(x0 + W);
    const ym = snapv(y0 + D / 2), xa = snapv(x0 + W / 2), xb = snapv(x0 + W * 0.6), yk = snapv((ym + y1) / 2), yr = snapv((y0 + ym) / 2);
    const f = { walls: [], ops: [] };
    const aw = (a, b) => f.walls.push({ id: S.nid++, a, b });
    aw([x0, y0], [x1, y0]); aw([x1, y0], [x1, y1]); aw([x1, y1], [x0, y1]); aw([x0, y1], [x0, y0]);
    aw([x0, ym], [x1, ym]); aw([xa, ym], [xa, y1]); aw([xa, yk], [x1, yk]); aw([xb, y0], [xb, ym]); aw([xb, yr], [x1, yr]);
    S.floors[S.cur] = f;
    normalize(f);
    const ao = (p, k, len, fl) => {
      const w = f.walls.find(x => proj(x, p).d < 1e-3); if (!w) return;
      const t = proj(w, p).t; if (t < len / 2 + 0.05 || t > wlen(w) - len / 2 - 0.05 || overlaps(f, w.id, t, len, null)) return;
      f.ops.push({ id: S.nid++, w: w.id, t: r4(t), len, k, f: fl });
    };
    const mid = (a, b) => snapv((a + b) / 2);
    ao([mid(x0, xa) - 0.6, y1], 'd', DW, 0);            // pintu utama
    ao([mid(x0, xa) + 0.9, y1], 'j', 1.2, 0);
    ao([mid(xa, x1), y1], 'j', 1.5, 0);                  // kamar depan
    ao([xa, mid(yk, y1)], 'd', DW, 0);
    ao([xa, mid(ym, yk)], 'd', DW, 0);
    ao([x1, mid(ym, yk)], 'j', 1.2, 0);
    ao([mid(x0, xa), ym], 'd', DW, 0);                   // ke ruang belakang
    ao([x0, mid(y0, ym)], 'j', 1.2, 1);
    ao([mid(x0, xb), y0], 'j', 1.5, 1);
    ao([xb, mid(y0, yr)], 'd', DW, 0);
    ao([xb, mid(yr, ym)], 'd', DW, 0);
    ao([mid(xb, x1), y0], 'j', 0.6, 1);
    ao([x1, mid(yr, ym)], 'j', 1.2, 0);
    sel = null; changed(); fit();
  });
  $('dhSvgDl').addEventListener('click', () => {
    const s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + svg.getAttribute('viewBox') + '" width="1600" height="' + Math.round(1600 * vb.h / vb.w) + '"><rect x="' + vb.x + '" y="' + vb.y + '" width="' + vb.w + '" height="' + vb.h + '" fill="#fff"/>' + gStatic.innerHTML + '</svg>';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    a.download = 'denah-lantai-' + (S.cur + 1) + '.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  function toast(t) {
    const el = $('toast'); if (!el) return;
    el.textContent = t; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- Sinkron dengan kalkulator ----------
  document.addEventListener('kalk:update', e => {
    const prev = K; K = e.detail;
    ensureFloors();
    compute(); renderStatic(); renderFloors(); renderSum(); renderBoq(); renderAlerts();
    if (!prev || prev.L !== K.L || prev.P !== K.P) { if (!S.floors.some(f => f.walls.length)) fit(); }
  });

  // ---------- Mulai ----------
  S.floors.forEach(normalize);
  setTool('dinding');
  compute(); fit(); renderFloors(); renderProps(); renderSum(); renderBoq(); renderAlerts();
})();
