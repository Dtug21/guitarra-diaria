/* Guitarra acústica de cuerdas de acero. Lo usan index.html y studio.html.
   Suena con grabaciones reales (sonidos/, Meta Steel Guitar, licencia CC0): cada cuerda, cada traste
   hasta el 20-21 y tres intensidades. Si una grabación no se puede cargar, usa una cuerda modelada. */
(function (raiz) {
  'use strict';
  // Número de versión que se muestra en la app. Debe ser igual a VERSION de sw.js
  raiz.APP_VERSION = 'gd-v20';

  // Ruido repetible: la misma nota suena igual cada vez
  function azar(semilla) {
    let a = semilla >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* Genera las muestras de una cuerda pulsada.
     o.apagada: golpe con las cuerdas tapadas · o.variante: otra pulsación de la misma nota */
  function cuerda(sr, freq, o) {
    o = o || {};
    const periodo = sr / freq;
    const cola = o.apagada ? 0.09 : Math.max(1.4, Math.min(4.5, 4.2 * Math.pow(110 / freq, 0.35))); // segundos hasta -60 dB
    const total = Math.ceil(sr * (o.apagada ? 0.14 : Math.min(cola, 3.6)));
    // filtro de pérdida: los agudos mueren antes que el grave (S = retardo que agrega)
    const S = o.apagada ? 0.5 : Math.max(0.08, Math.min(0.34, 0.34 * Math.pow(110 / freq, 0.45)));
    // afinación exacta: parte entera en la línea de retardo y fracción en un filtro pasa-todo
    let N = Math.floor(periodo - S - 0.1);
    const frac = periodo - S - N, C = (1 - frac) / (1 + frac);
    const g = Math.pow(10, -3 / (freq * cola));

    // excitación: ruido suavizado (yema/púa) y filtrado según dónde se pulsa la cuerda
    const rnd = azar(Math.round(freq * 100) + 7919 * (o.variante || 0) + (o.apagada ? 5 : 0));
    const L = Math.max(2, Math.round(periodo));
    const ruido = new Float32Array(L);
    const suave = Math.max(0.25, Math.min(0.75, 0.62 - freq / 2400));
    let y = 0;
    for (let i = 0; i < L * 2; i++) { y += (1 - suave) * ((rnd() * 2 - 1) - y); if (i >= L) ruido[i - L] = y; }
    const puas = Math.max(1, Math.round(L * 0.14));
    const exc = new Float32Array(L);
    let media = 0;
    for (let i = 0; i < L; i++) { exc[i] = ruido[i] - ruido[(i - puas + L) % L]; media += exc[i]; }
    media /= L;

    const linea = new Float32Array(N);
    for (let i = 0; i < N; i++) linea[i] = exc[i % L] - media;

    const sal = new Float32Array(total);
    let p = 0, previo = 0, apX = 0, apY = 0, pico = 0;
    for (let n = 0; n < total; n++) {
      const x = linea[p];
      const filtrado = g * ((1 - S) * x + S * previo);
      previo = x;
      const afinado = C * filtrado + apX - C * apY;
      apX = filtrado; apY = afinado;
      linea[p] = afinado;
      if (++p === N) p = 0;
      sal[n] = x;
      const v = x < 0 ? -x : x; if (v > pico) pico = v;
    }
    // volumen parejo y sin chasquidos al empezar ni al terminar
    const k = pico ? 0.9 / pico : 0, sube = Math.round(sr * 0.0015), baja = Math.round(sr * (o.apagada ? 0.02 : 0.15));
    for (let n = 0; n < total; n++) {
      let e = k;
      if (n < sube) e *= n / sube;
      if (n > total - baja) e *= (total - n) / baja;
      sal[n] *= e;
    }
    return sal;
  }

  const memoria = new Map(); // notas ya calculadas
  function bufer(ctx, freq, o) {
    const clave = [ctx.sampleRate, freq.toFixed(2), o.apagada ? 1 : 0, o.variante || 0].join('|');
    let b = memoria.get(clave);
    if (b) { memoria.delete(clave); memoria.set(clave, b); return b; }
    const datos = cuerda(ctx.sampleRate, freq, o);
    b = ctx.createBuffer(1, datos.length, ctx.sampleRate);
    b.getChannelData(0).set(datos);
    memoria.set(clave, b);
    if (memoria.size > 72) memoria.delete(memoria.keys().next().value);
    return b;
  }

  // Resonancia corta de una pieza pequeña
  function sala(ctx) {
    const largo = Math.floor(ctx.sampleRate * 0.7), b = ctx.createBuffer(2, largo, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c), rnd = azar(101 + c);
      let y = 0;
      for (let i = Math.floor(ctx.sampleRate * 0.008); i < largo; i++) { y += 0.45 * ((rnd() * 2 - 1) - y); d[i] = y * Math.pow(1 - i / largo, 3); }
    }
    return b;
  }

  /* ---------- grabaciones ---------- */
  const RUTA = 'sonidos/', CACHE = 'gd-sonidos';
  const AL_AIRE = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };
  const banco = () => raiz.BANCO_GUITARRA || {};
  const rangos = () => {
    if (rangos.v) return rangos.v;
    const r = {};
    Object.keys(banco()).forEach(k => { const [s, m] = k.split('-').map(Number); (r[s] = r[s] || []).push(m); });
    Object.values(r).forEach(a => a.sort((x, y) => x - y));
    if (Object.keys(r).length) rangos.v = r;
    return r;
  };

  /* Qué grabación usar para una frecuencia. cuerda 6 (Mi grave) a 1; si no se indica,
     la que usaría un guitarrista en primera posición. */
  function elegir(freq, cuerda, vel) {
    const r = rangos(), midi = Math.round(69 + 12 * Math.log2(freq / 440));
    let s = r[cuerda] ? Number(cuerda) : 0;
    if (s && midi > r[s][r[s].length - 1] + 2) s = 0;
    if (!s) {
      const tiene = [6, 5, 4, 3, 2, 1].filter(c => r[c] && r[c].includes(midi));
      s = tiene.find(c => midi - AL_AIRE[c] <= 4) || tiene[tiene.length - 1] || (midi < 52 ? 6 : 1);
    }
    if (!r[s]) return null;
    const m = r[s].reduce((a, b) => Math.abs(b - midi) < Math.abs(a - midi) ? b : a);
    const capa = vel < 0.23 ? 1 : vel < 0.65 ? 2 : 3;
    const dato = banco()[s + '-' + m][capa - 1];
    if (!dato) return null;
    const [cents, ganancia] = dato;
    return { url: RUTA + s + '-' + m + '-' + capa + '.m4a', ganancia, midi: m, cuerda: s,
      // afina la grabación y, si hace falta (otras afinaciones), la transpone
      rate: freq / (440 * Math.pow(2, (m - 69) / 12)) * Math.pow(2, -(Math.abs(cents) > 2 ? cents : 0) / 1200) };
  }

  const crudos = new Map(), listos = new Map(), cargando = new Map();
  function bajar(url) {
    let p = crudos.get(url);
    if (!p) {
      p = fetch(url).then(r => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.arrayBuffer(); });
      p.catch(() => crudos.delete(url));
      crudos.set(url, p);
      if (crudos.size > 200) crudos.delete(crudos.keys().next().value);
    }
    return p;
  }
  function decodificar(ctx, url) {
    const ya = listos.get(url);
    if (ya) { listos.delete(url); listos.set(url, ya); return Promise.resolve(ya); }
    let p = cargando.get(url);
    if (!p) {
      p = bajar(url).then(a => new Promise((ok, ko) => ctx.decodeAudioData(a.slice(0), ok, ko))).then(b => {
        // salta el silencio inicial que agrega la compresión
        const d = b.getChannelData(0), tope = Math.min(d.length, Math.floor(b.sampleRate * 0.12));
        let pico = 0; for (let i = 0; i < Math.min(d.length, b.sampleRate); i++) pico = Math.max(pico, Math.abs(d[i]));
        let i = 0; while (i < tope && Math.abs(d[i]) < pico * 0.03) i++;
        const dato = { b, desde: Math.max(0, i / b.sampleRate - 0.003) };
        listos.set(url, dato);
        if (listos.size > 80) listos.delete(listos.keys().next().value); // ~200 MB como máximo
        return dato;
      }).finally(() => cargando.delete(url));
      cargando.set(url, p);
    }
    return p;
  }
  // Adelanta la descarga de las notas que se van a tocar: [{freq, cuerda, vel}]
  function preparar(notas) {
    const urls = new Set();
    notas.forEach(n => { const e = elegir(n.freq, n.cuerda, n.vel === undefined ? 0.4 : n.vel); if (e) urls.add(e.url); });
    urls.forEach(u => bajar(u).catch(() => {}));
    return urls.size;
  }
  const todas = () => Object.keys(banco()).flatMap(k => [1, 2, 3].map(v => RUTA + k + '-' + v + '.m4a'));
  async function guardadas() {
    if (!raiz.caches) return 0;
    const c = await raiz.caches.open(CACHE);
    return (await c.keys()).length;
  }
  // Guarda todas las grabaciones para usar la app sin internet
  async function descargarTodo(avance) {
    const c = await raiz.caches.open(CACHE), lista = todas();
    let hechas = 0, i = 0, fallas = 0;
    const uno = async () => {
      while (i < lista.length) {
        const u = lista[i++];
        try { if (!await c.match(u)) { const r = await fetch(u); if (!r.ok) throw 0; await c.put(u, r); } } catch (e) { fallas++; }
        if (avance) avance(++hechas, lista.length);
      }
    };
    await Promise.all([uno(), uno(), uno(), uno()]);
    return { total: lista.length, fallas };
  }

  /* Una guitarra conectada a "destino". */
  function crear(ctx, destino) {
    const filtro = (type, frequency, Q, gain) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = Q; if (gain !== undefined) f.gain.value = gain; return f; };
    const tope = ctx.createDynamicsCompressor(); // evita saturar en los rasgueos
    tope.threshold.value = -8; tope.knee.value = 8; tope.ratio.value = 4; tope.attack.value = 0.005; tope.release.value = 0.2;
    tope.connect(destino);
    const eco = ctx.createConvolver(); eco.buffer = sala(ctx); eco.connect(tope);
    const envio = (desde, cuanto) => { const g = ctx.createGain(); g.gain.value = cuanto; desde.connect(g); g.connect(eco); };
    // las grabaciones ya traen la caja: solo un poco de sala
    const real = ctx.createGain(); real.connect(tope); envio(real, 0.09);
    // la cuerda modelada necesita su caja de resonancia
    const modelada = ctx.createGain();
    const caja = [filtro('highpass', 62, 0.7), filtro('peaking', 105, 3, 5), filtro('peaking', 215, 2.5, 3.5), filtro('peaking', 430, 2, 1.5), filtro('peaking', 2800, 0.9, 2.5), filtro('lowpass', 7200, 0.6)];
    const finCaja = caja.reduce((a, f) => { a.connect(f); return f; }, modelada);
    finCaja.connect(tope); envio(finCaja, 0.16);

    const sonando = new Set(), porCuerda = {};
    let vez = 0, tanda = 0;
    function apagar(voz, cuando, rapidez) {
      const t = Math.max(cuando, ctx.currentTime);
      if (voz.hasta <= t) return;
      voz.g.gain.setTargetAtTime(0, t, rapidez);
      voz.hasta = t + rapidez * 7;
      try { voz.src.stop(voz.hasta); } catch (e) {}
    }
    function lanzar(o, grabacion, dato) {
      const t = Math.max(o.t || 0, ctx.currentTime), dur = o.dur || 2;
      const vel = o.vel === undefined ? 0.4 : o.vel;
      const src = ctx.createBufferSource(), g = ctx.createGain(), f = filtro('lowpass', 18000, 0.5);
      let largo;
      if (grabacion) {
        src.buffer = dato.b;
        const rate = grabacion.rate * Math.pow(2, (Math.random() - 0.5) * 3 / 1200);
        src.playbackRate.value = rate;
        largo = (dato.b.duration - dato.desde) / rate;
        g.gain.value = grabacion.ganancia * (0.9 + 1.4 * vel) * (0.94 + Math.random() * 0.12);
        if (o.apagada) f.frequency.value = 1700; else if (o.suave) f.frequency.value = 2600;
      } else {
        src.buffer = bufer(ctx, o.freq, { apagada: o.apagada, variante: vez++ % 2 });
        largo = src.buffer.duration;
        g.gain.value = vel;
        f.frequency.value = o.suave ? 1800 : 2600 + Math.min(1, vel * 2.5) * 5200;
      }
      src.connect(f); f.connect(g); g.connect(grabacion ? real : modelada);
      const voz = { src, g, desde: t, hasta: t + largo, real: !!grabacion };
      src.onended = () => { sonando.delete(voz); g.disconnect(); f.disconnect(); };
      src.start(t, grabacion ? dato.desde : 0);
      sonando.add(voz);
      if (o.apagada) apagar(voz, t + 0.05, 0.012);
      else if (t + dur < voz.hasta) apagar(voz, t + dur, o.corta ? 0.015 : 0.09);
      if (o.cuerda !== undefined) {
        // una cuerda solo suena una nota a la vez
        const antes = porCuerda[o.cuerda];
        if (antes && antes.desde > t) apagar(voz, antes.desde, 0.012);
        else { if (antes) apagar(antes, t, 0.012); porCuerda[o.cuerda] = voz; }
      }
      return voz;
    }
    return {
      /* freq en Hz · t instante · dur segundos antes de apagarla · vel intensidad 0-1
         cuerda 6 a 1 · suave: ligado (hammer/pull-off) · apagada: golpe tapado · corta: staccato */
      tocar(o) {
        const g = elegir(o.freq, o.cuerda, o.apagada ? 0.7 : (o.vel === undefined ? 0.4 : o.vel));
        if (!g) return lanzar(o);
        const ya = listos.get(g.url);
        if (ya) return lanzar(o, g, ya);
        // primera vez: espera un instante por la grabación; si tarda, suena la modelada
        const mia = tanda;
        let resuelta = false;
        const t = Math.max(o.t || 0, ctx.currentTime);
        const usar = dato => { if (resuelta || mia !== tanda) return; resuelta = true; clearTimeout(plazo); lanzar(Object.assign({}, o, { t }), dato && g, dato); };
        const plazo = setTimeout(() => usar(null), Math.max(0, t - ctx.currentTime) * 1000 + 450);
        decodificar(ctx, g.url).then(usar, () => usar(null));
      },
      // deja las notas listas en memoria antes de tocarlas
      listo(notas) {
        return Promise.all(notas.map(n => { const g = elegir(n.freq, n.cuerda, n.vel === undefined ? 0.4 : n.vel); return g ? decodificar(ctx, g.url) : null; }));
      },
      voces: () => [...sonando],
      // silencia todo (al parar la reproducción)
      cortar() { tanda++; sonando.forEach(v => { v.hasta = Infinity; apagar(v, ctx.currentTime, 0.02); }); }
    };
  }

  raiz.Guitarra = { crear, cuerda, elegir, preparar, todas, guardadas, descargarTodo };
})(typeof window !== 'undefined' ? window : globalThis);
