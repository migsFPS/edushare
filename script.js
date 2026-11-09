/* =====================================================================
   EduShare – Smart Quiz Generator  (script.js)
   Works with the existing index.html / generator.css (no HTML changes).
 
   Supports: .pdf  .docx  .pptx  .txt  .png/.jpg/.jpeg (OCR)
   Input modes: By file · By prompt (pasted lesson text) · By scanning
   Question types: Multiple choice · True/False · Mixed
   ===================================================================== */
(function () {
  'use strict';
 
  /* ------------------------------ CONFIG ------------------------------ */
  var CONFIG = {
    // OPTIONAL: URL of YOUR backend that calls a real AI model.
    // It receives POST JSON {text, count, type, difficulty} and must return
    // {questions:[{question, options:[...], answer:<index or text>, explanation}]}
    // Leave empty to use the built-in offline generator.
    AI_ENDPOINT: '',
    MAX_FILE_MB: 25,
    MAX_CHARS: 200000,
    LIBS: {
      pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
      mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
      jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
      tesseract: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.5/tesseract.min.js'
    }
  };
 
  /*__PURE_START__*/
  /* ===================== QUESTION GENERATION ENGINE ===================== */
  var STOP = new Set(('a about above after again against all also am an and any are as at be because been before ' +
    'being below between both but by can could did do does doing down during each few for from further had has have ' +
    'having he her here hers him his how i if in into is it its itself just me more most my no nor not of off on once ' +
    'only or other our out over own same she should so some such than that the their them then there these they this ' +
    'those through to too under until up very was we were what when where which while who whom why will with would ' +
    'you your yours however therefore thus may might must shall used use using called known based given figure table ' +
    'chapter page example examples following').split(' '));
 
  var PRON = new Set(['this', 'that', 'it', 'there', 'these', 'those', 'which', 'what', 'he', 'she', 'they', 'we', 'you', 'one', 'i', 'here']);
 
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
 
  /* Split raw text into clean, quiz-worthy sentences */
  function splitSentences(raw) {
    var t = String(raw || '').replace(/\r/g, '\n').replace(/[\u00a0\t]+/g, ' ').replace(/\u0001/g, ' ');
    t = t.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');                 // 1,200 -> 1200
    t = t.replace(/(\d)\.(?=\d)/g, '$1\u0001');                    // protect decimals
    t = t.replace(/\b(?:e\.g|i\.e|etc|vs|fig|eq|dr|mr|ms|mrs|prof)\./gi, function (m) {
      return m.replace(/\./g, '\u0001');
    });
 
    var lines = t.split(/\n+/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    var segs = [];
    lines.forEach(function (line) {
      var prev = segs[segs.length - 1];
      if (prev && !/[.!?:]$/.test(prev) && (/^[a-z(]/.test(line) || prev.length > 70)) {
        segs[segs.length - 1] = prev + ' ' + line;       // re-join wrapped lines
      } else {
        segs.push(line);
      }
    });
 
    var seen = new Set(), out = [];
    segs.forEach(function (seg) {
      var parts = seg.match(/[^.!?]+(?:[.!?]+|$)/g) || [];
      parts.forEach(function (p) {
        p = p.replace(/\u0001/g, '.').replace(/\s+/g, ' ').trim();
        p = p.replace(/^[\u2022\u25CF\u25AA•*\-–]+\s*/, '');
        if (p.length < 25 || p.length > 260) return;
        if (p.split(' ').length < 4) return;
        if (/\?$/.test(p)) return;
        if (/https?:|www\./i.test(p)) return;
        var letters = (p.match(/[A-Za-z]/g) || []).length;
        if (letters / p.length < 0.6) return;
        var key = p.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(p);
      });
    });
    return out;
  }
 
  function wordFreq(text) {
    var f = {};
    (String(text).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).forEach(function (w) {
      if (!STOP.has(w)) f[w] = (f[w] || 0) + 1;
    });
    return f;
  }
 
  /* Possible "answer" tokens in a sentence, best first */
  function candidatesOf(s, freq) {
    var out = [], re = /[A-Za-z][A-Za-z'-]*|\d+(?:\.\d+)?/g, m;
    while ((m = re.exec(s))) {
      var tok = m[0], idx = m.index;
      var prevCh = s.charAt(idx - 1) || ' ', nextCh = s.charAt(idx + tok.length) || ' ';
      if (/^\d/.test(tok)) {
        if (tok.length > 9) continue;
        if (/[A-Za-z_\-]/.test(prevCh) || /[A-Za-z_]/.test(nextCh)) continue;
        var before = s.slice(Math.max(0, idx - 12), idx);
        if (/(fig(ure)?|table|chapter|page|section|slide|item|part|q|no|step|week|unit|module)\.?\s*$/i.test(before)) continue;
        out.push({ text: tok, lower: tok, idx: idx, numeric: true, acronym: false, proper: false, score: 2 });
        continue;
      }
      var lower = tok.toLowerCase();
      var acronym = /^[A-Z]{2,6}$/.test(tok);
      if (STOP.has(lower) || (tok.length < 4 && !acronym) || tok.length > 25) continue;
      var proper = idx > 0 && /^[A-Z]/.test(tok) && !acronym;
      out.push({
        text: tok, lower: lower, idx: idx, numeric: false, acronym: acronym, proper: proper,
        score: (freq[lower] || 1) + (acronym ? 3 : 0) + (proper ? 1 : 0)
      });
    }
    return out.sort(function (a, b) { return b.score - a.score; });
  }
 
  function sentScore(s, freq) {
    return candidatesOf(s, freq).slice(0, 3).reduce(function (n, c) { return n + c.score; }, 0);
  }
 
  function tokenSet(s) {
    return new Set(s.toLowerCase().match(/[a-z][a-z'-]*/g) || []);
  }
 
  function buildPool(sents, freq) {
    var map = new Map();
    sents.forEach(function (s) {
      candidatesOf(s, freq).filter(function (c) { return !c.numeric; }).slice(0, 4).forEach(function (c) {
        if (!map.has(c.lower)) map.set(c.lower, { lower: c.lower, freq: freq[c.lower] || 1, acronym: c.acronym });
      });
    });
    return Array.from(map.values());
  }
 
  /* Replace every whole-token occurrence of `cand` in sentence `s`. Returns null if not found. */
  function swapToken(s, cand, replacement) {
    var tok = esc(cand.text);
    var re = cand.numeric
      ? new RegExp('(^|[^A-Za-z0-9.])' + tok + '(?![A-Za-z0-9]|\\.\\d)', 'g')
      : new RegExp('(^|[^A-Za-z0-9])' + tok + '(?![A-Za-z0-9])', 'gi');
    var n = 0;
    var res = s.replace(re, function (m, p1) { n++; return p1 + replacement; });
    return n ? res : null;
  }
 
  function pickAnswer(cands, difficulty) {
    if (!cands.length) return null;
    var words = cands.filter(function (c) { return !c.numeric; });
    var nums = cands.filter(function (c) { return c.numeric; });
    if (nums.length && difficulty !== 'Easy' && Math.random() < 0.25) return nums[0];
    var list = words.length ? words : cands;
    if (difficulty === 'Easy') return list[0];
    if (difficulty === 'Hard') {
      var rest = list.slice(1, 5);
      return rest.length ? rest[Math.floor(Math.random() * rest.length)] : list[0];
    }
    var top = list.slice(0, 3);
    return top[Math.floor(Math.random() * top.length)];
  }
 
  function styleFn(ans) {
    if (ans.acronym) return function (w) { return w.toUpperCase(); };
    if (/^[A-Z]/.test(ans.text)) return function (w) { return cap(w); };
    return function (w) { return w; };
  }
 
  function pickDistractors(ans, pool, sentTokens, difficulty, n) {
    var c = pool.filter(function (w) {
      return w.lower !== ans.lower && !sentTokens.has(w.lower) && w.acronym === ans.acronym;
    });
    if (c.length < n) {
      c = pool.filter(function (w) { return w.lower !== ans.lower && !sentTokens.has(w.lower); });
    }
    if (c.length < n) return null;
    if (difficulty === 'Hard') {
      c = c.map(function (w) {
        return { w: w, d: Math.abs(w.lower.length - ans.text.length) + Math.abs(w.freq - (ans.score || 1)) * 0.5 + Math.random() * 2 };
      }).sort(function (a, b) { return a.d - b.d; }).map(function (x) { return x.w; });
    } else {
      c = shuffle(c);
    }
    var style = styleFn(ans), out = [], seen = new Set([ans.text.toLowerCase()]);
    for (var i = 0; i < c.length && out.length < n; i++) {
      var disp = c[i].acronym ? c[i].lower.toUpperCase() : style(c[i].lower);
      if (!seen.has(disp.toLowerCase())) { seen.add(disp.toLowerCase()); out.push(disp); }
    }
    return out.length === n ? out : null;
  }
 
  function numericDistractors(tok) {
    var val = parseFloat(tok);
    if (!isFinite(val)) return null;
    var dec = (tok.split('.')[1] || '').length;
    var mag = val === 0 ? 0 : Math.floor(Math.log10(Math.abs(val)));
    var step = Math.max(dec ? Math.pow(10, -dec) : 1, Math.pow(10, Math.max(mag - 1, 0)));
    var out = [], seen = new Set([tok]), tries = 0;
    while (out.length < 3 && tries < 80) {
      tries++;
      var k = Math.floor(Math.random() * 5) + 1, sign = Math.random() < 0.5 ? -1 : 1;
      var v = val + sign * k * step;
      if (val >= 0 && v < 0) v = val + k * step;
      var s = v.toFixed(dec);
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
    return out.length === 3 ? out : null;
  }
 
  var DEF_RE = /^(?:the |a |an )?([A-Za-z][A-Za-z0-9\-\/'() ]{2,50}?) (?:is defined as|is called|refers to|is known as|means|is|are) (.{20,})$/i;
 
  function parseDefinition(s) {
    var m = DEF_RE.exec(s);
    if (!m) return null;
    var term = m[1].trim(), words = term.split(/\s+/);
    if (words.length > 5) return null;
    if (PRON.has(words[0].toLowerCase())) return null;
    if (words.every(function (w) { return STOP.has(w.toLowerCase()); })) return null;
    var def = m[2].trim().replace(/[.!]+$/, '');
    if (new RegExp('\\b' + esc(term) + '\\b', 'i').test(def)) return null;
    return { term: cap(term), def: def, sentence: s };
  }
 
  function makeDefinition(d, ctx) {
    var others = ctx.termList.filter(function (t) { return t.toLowerCase() !== d.term.toLowerCase(); });
    if (others.length < 3) return null;
    if (ctx.diff === 'Hard') {
      others = others.map(function (t) {
        return { t: t, d: Math.abs(t.split(' ').length - d.term.split(' ').length) * 3 + Math.abs(t.length - d.term.length) * 0.2 + Math.random() };
      }).sort(function (a, b) { return a.d - b.d; }).map(function (x) { return x.t; });
    } else {
      others = shuffle(others);
    }
    var options = shuffle([d.term].concat(others.slice(0, 3)));
    return {
      type: 'mc',
      text: 'Which term is described by the following? \u201C' + d.def + '\u201D',
      options: options,
      correct: options.indexOf(d.term),
      explain: d.sentence
    };
  }
 
  function makeCloze(sent, cands, ctx) {
    var ans = pickAnswer(cands, ctx.diff);
    if (!ans) return null;
    var blanked = swapToken(sent, ans, '_____');
    if (!blanked) return null;
    var d = ans.numeric ? numericDistractors(ans.text) : pickDistractors(ans, ctx.pool, tokenSet(sent), ctx.diff, 3);
    if (!d) return null;
    var options = shuffle([ans.text].concat(d));
    if (new Set(options.map(function (o) { return o.toLowerCase(); })).size !== 4) return null;
    return {
      type: 'mc',
      text: 'Fill in the blank: ' + blanked,
      options: options,
      correct: options.indexOf(ans.text),
      explain: 'Full statement: ' + sent
    };
  }
 
  function makeTF(sent, cands, ctx, wantTrue) {
    if (wantTrue) {
      return { type: 'tf', text: sent, options: ['True', 'False'], correct: 0, explain: 'This statement comes directly from your material.' };
    }
    var ans = pickAnswer(cands, ctx.diff);
    if (!ans) return null;
    var d = ans.numeric ? numericDistractors(ans.text) : pickDistractors(ans, ctx.pool, tokenSet(sent), ctx.diff, 1);
    if (!d) return null;
    var changed = swapToken(sent, ans, d[0]);
    if (!changed || changed === sent) return null;
    return { type: 'tf', text: changed, options: ['True', 'False'], correct: 1, explain: 'The original statement is: \u201C' + sent + '\u201D' };
  }
 
  function generateLocal(opts) {
    var text = opts.text, count = opts.count, type = opts.type, difficulty = opts.difficulty;
    var sents = splitSentences(text);
    if (sents.length < 3) {
      throw new Error('I could not find enough full sentences in this material to build a quiz. Try a file with more explanatory text.');
    }
    var freq = wordFreq(text);
    var pool = buildPool(sents, freq);
    var defs = new Map();
    sents.forEach(function (s) { var d = parseDefinition(s); if (d) defs.set(s, d); });
    var termList = Array.from(new Set(Array.from(defs.values()).map(function (d) { return d.term; })));
    var ctx = { diff: difficulty, pool: pool, termList: termList };
 
    var order = sents.map(function (s) { return { s: s, sc: sentScore(s, freq) }; });
    if (difficulty === 'Easy') {
      order.sort(function (a, b) { return b.sc - a.sc; });
    } else if (difficulty === 'Hard') {
      order.forEach(function (o) { o.sc = o.s.length + Math.random() * 80; });
      order.sort(function (a, b) { return b.sc - a.sc; });
    } else {
      order = shuffle(order);
    }
 
    var plan = [];
    for (var i = 0; i < count; i++) {
      plan.push(type === 'multiple' ? 'mc' : type === 'truefalse' ? 'tf' : (i % 2 === 0 ? 'mc' : 'tf'));
    }
 
    var qs = [], used = new Set(), tfIdx = 0;
    for (var k = 0; k < order.length && qs.length < count; k++) {
      var s = order[k].s;
      var want = plan[qs.length];
      var tryTypes = type === 'mixed' ? [want, want === 'mc' ? 'tf' : 'mc'] : [want];
      var cands = candidatesOf(s, freq);
      for (var t = 0; t < tryTypes.length; t++) {
        var q = null;
        if (tryTypes[t] === 'mc') {
          var def = defs.get(s);
          if (def && termList.length >= 4 && Math.random() < 0.6) q = makeDefinition(def, ctx);
          if (!q) q = makeCloze(s, cands, ctx);
        } else {
          q = makeTF(s, cands, ctx, tfIdx % 2 === 0);
        }
        if (q && !used.has(q.text)) {
          used.add(q.text);
          if (tryTypes[t] === 'tf') tfIdx++;
          qs.push(q);
          break;
        }
      }
    }
    if (!qs.length) throw new Error('I could not turn this material into questions. Try a file with longer, explanatory sentences.');
    return shuffle(qs);
  }
  /*__PURE_END__*/
 
  /* ============================ UI / DOM LAYER ============================ */
  var state = { mode: 'file', file: null, scanFile: null, busy: false, questions: [], graded: false };
  function $(id) { return document.getElementById(id); }
 
  function injectStyles() {
    var css =
      '.hidden{display:none!important}' +
      '.q-card{border:1px solid var(--line,#d9e0ee);border-radius:14px;padding:18px 20px;margin:0 0 16px;background:#fff}' +
      '.q-card.right{border-color:#067647}.q-card.wrong{border-color:#b42318}' +
      '.q-num{font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7a99;margin-bottom:6px}' +
      '.q-text{font-weight:700;margin:0 0 12px;line-height:1.5;color:var(--navy,#0b2559)}' +
      '.q-opts{display:grid;gap:8px}' +
      '.q-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line,#d9e0ee);border-radius:10px;cursor:pointer}' +
      '.q-opt:hover{background:#f4f7fd}.q-opt input{margin-top:3px}' +
      '.q-opt.is-correct{border-color:#067647;background:#ecfdf3}' +
      '.q-opt.is-wrong{border-color:#b42318;background:#fef3f2}' +
      '.q-explain{margin:12px 0 0;font-size:.92rem;line-height:1.5;color:#475467}' +
      '.dropzone.drag-over{background:#eef4ff;border-color:#1d6fd8}' +
      '#generateBtn:disabled{opacity:.7;cursor:wait}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }
 
  function setStatus(msg, kind) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = kind === 'error' ? '#b42318' : kind === 'ok' ? '#067647' : '#1d4f91';
    el.style.fontWeight = '600';
    el.style.margin = msg ? '14px 0 0' : '0';
  }
 
  var loaded = {};
  function loadScript(url) {
    if (!loaded[url]) {
      loaded[url] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = url; s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () {
          delete loaded[url];
          reject(new Error('Could not load a required reading tool. Please check your internet connection and try again.'));
        };
        document.head.appendChild(s);
      });
    }
    return loaded[url];
  }
 
  /* ----------------------------- extractors ----------------------------- */
  function extractPdf(file) {
    return loadScript(CONFIG.LIBS.pdf).then(function () {
      var lib = window.pdfjsLib;
      if (!lib) throw new Error('The PDF reader failed to start. Please refresh the page and try again.');
      lib.GlobalWorkerOptions.workerSrc = CONFIG.LIBS.pdfWorker;
      return file.arrayBuffer().then(function (buf) {
        return lib.getDocument({ data: new Uint8Array(buf) }).promise;
      }).catch(function (e) {
        if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Please remove the password and try again.');
        throw new Error('This PDF could not be read. The file may be damaged.');
      }).then(function (pdf) {
        var pages = Math.min(pdf.numPages, 300), out = '', p = 1;
        function next() {
          if (p > pages || out.length > CONFIG.MAX_CHARS) return Promise.resolve(out);
          setStatus('Reading PDF\u2026 page ' + p + ' of ' + pages, 'info');
          return pdf.getPage(p).then(function (page) { return page.getTextContent(); }).then(function (tc) {
            var line = '';
            tc.items.forEach(function (it) {
              if (typeof it.str === 'string') line += it.str + (it.hasEOL ? '\n' : ' ');
            });
            out += line + '\n';
            p++;
            return next();
          });
        }
        return next();
      });
    });
  }
 
  function extractDocx(file) {
    return loadScript(CONFIG.LIBS.mammoth).then(function () {
      return file.arrayBuffer();
    }).then(function (buf) {
      return window.mammoth.extractRawText({ arrayBuffer: buf });
    }).then(function (r) { return r.value; });
  }
 
  function decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
 
  function extractPptx(file) {
    return loadScript(CONFIG.LIBS.jszip).then(function () {
      return file.arrayBuffer();
    }).then(function (buf) {
      return window.JSZip.loadAsync(buf);
    }).then(function (zip) {
      var names = Object.keys(zip.files).filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
        .sort(function (a, b) { return parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10); });
      if (!names.length) throw new Error('No slides were found in this PowerPoint file.');
      var out = '';
      return names.reduce(function (chain, n) {
        return chain.then(function () {
          return zip.files[n].async('string').then(function (xml) {
            xml.split(/<\/a:p>/).forEach(function (para) {
              var texts = [], re = /<a:t[^>]*>([^<]*)<\/a:t>/g, m;
              while ((m = re.exec(para))) texts.push(decodeXml(m[1]));
              if (texts.length) out += texts.join('') + '\n';
            });
          });
        });
      }, Promise.resolve()).then(function () { return out; });
    });
  }
 
  function ocrImage(file) {
    return loadScript(CONFIG.LIBS.tesseract).then(function () {
      return window.Tesseract.recognize(file, 'eng', {
        logger: function (m) {
          if (m && m.status === 'recognizing text') setStatus('Reading text from image\u2026 ' + Math.round(m.progress * 100) + '%', 'info');
        }
      });
    }).then(function (r) { return r.data.text; });
  }
 
  function extFor(file) { return (file.name.split('.').pop() || '').toLowerCase(); }
 
  function readFile(file) {
    var ext = extFor(file);
    if (ext === 'txt') return file.text();
    if (ext === 'pdf') return extractPdf(file);
    if (ext === 'docx') return extractDocx(file);
    if (ext === 'pptx') return extractPptx(file);
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return ocrImage(file);
    if (ext === 'doc') return Promise.reject(new Error('Old .doc files cannot be read in the browser. Please save it as .docx or PDF and upload it again.'));
    return Promise.reject(new Error('This file type is not supported. Please use PDF, DOCX, PPTX, TXT, PNG, or JPG.'));
  }
 
  function getSource() {
    var minMsg = 'There is not enough readable text to build a quiz.';
    function finish(text, name, ext) {
      text = String(text || '').slice(0, CONFIG.MAX_CHARS);
      if (text.replace(/\s/g, '').length < 150) {
        throw new Error(ext === 'pdf'
          ? 'I could not find enough readable text in this PDF. If it is a scanned or image-only PDF, upload photos of the pages in the \u201CBy scanning\u201D tab, or paste the text there.'
          : minMsg + ' Please provide longer lesson material.');
      }
      return { text: text, name: name };
    }
 
    if (state.mode === 'prompt') {
      var p = ($('promptText').value || '').trim();
      if (!p) return Promise.reject(new Error('Please type or paste your lesson text in the box first.'));
      if (p.length < 150 && !CONFIG.AI_ENDPOINT) {
        return Promise.reject(new Error('This offline version builds questions from text you provide. Paste your lesson notes (at least a few sentences) into the box, or use \u201CBy file\u201D.'));
      }
      return Promise.resolve(finish(p, 'Pasted text', 'txt'));
    }
 
    if (state.mode === 'scan') {
      var typed = ($('scanText').value || '').trim();
      if (typed.length >= 150) return Promise.resolve(finish(typed, 'Pasted notes', 'txt'));
      if (!state.scanFile) {
        return Promise.reject(new Error(typed ? 'The pasted notes are too short. Add more text or choose a scanned image.' : 'Please choose a scanned image or paste the text of your notes.'));
      }
      return ocrImage(state.scanFile).then(function (t) { return finish(t, state.scanFile.name, 'png'); });
    }
 
    if (!state.file) return Promise.reject(new Error('Please choose a file first, then click \u201CGenerate Quiz\u201D.'));
    var ext = extFor(state.file);
    return readFile(state.file).then(function (t) { return finish(t, state.file.name, ext); });
  }
 
  /* --------------------------- optional AI backend --------------------------- */
  function generateWithAI(opts) {
    return fetch(CONFIG.AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts)
    }).then(function (r) {
      if (!r.ok) throw new Error('AI service error ' + r.status);
      return r.json();
    }).then(function (data) {
      var list = (data && data.questions) || [];
      var out = [];
      list.forEach(function (q) {
        if (!q || !q.question || !Array.isArray(q.options) || q.options.length < 2) return;
        var idx = typeof q.answer === 'number' ? q.answer : q.options.indexOf(q.answer);
        if (idx < 0 || idx >= q.options.length) return;
        var low = q.options.map(function (o) { return String(o).toLowerCase(); });
        out.push({
          type: (q.options.length === 2 && low.indexOf('true') > -1 && low.indexOf('false') > -1) ? 'tf' : 'mc',
          text: String(q.question), options: q.options.map(String), correct: idx, explain: String(q.explanation || '')
        });
      });
      if (!out.length) throw new Error('AI returned no usable questions');
      return out.slice(0, opts.count);
    });
  }
 
  /* ------------------------------- rendering ------------------------------- */
  function renderQuiz(qs, metaText) {
    state.questions = qs;
    state.graded = false;
    var box = $('questions');
    box.textContent = '';
    qs.forEach(function (q, i) {
      var card = document.createElement('div');
      card.className = 'q-card';
      card.setAttribute('role', 'group');
      var num = document.createElement('div');
      num.className = 'q-num'; num.id = 'qh' + i;
      num.textContent = 'Question ' + (i + 1) + ' of ' + qs.length;
      card.setAttribute('aria-labelledby', num.id);
      var txt = document.createElement('p');
      txt.className = 'q-text';
      txt.textContent = (q.type === 'tf' ? 'True or False: ' : '') + q.text;
      var opts = document.createElement('div');
      opts.className = 'q-opts';
      q.options.forEach(function (o, j) {
        var lab = document.createElement('label');
        lab.className = 'q-opt';
        var inp = document.createElement('input');
        inp.type = 'radio'; inp.name = 'q' + i; inp.value = String(j);
        var sp = document.createElement('span');
        sp.textContent = o;
        lab.appendChild(inp); lab.appendChild(sp);
        opts.appendChild(lab);
      });
      card.appendChild(num); card.appendChild(txt); card.appendChild(opts);
      box.appendChild(card);
    });
    $('quizMeta').textContent = metaText;
    var sb = $('scoreBox');
    sb.classList.add('hidden'); sb.textContent = '';
    var submit = document.querySelector('#quizForm button[type="submit"]');
    if (submit) submit.disabled = false;
    $('quizResults').classList.remove('hidden');
    $('quizResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
 
  function gradeQuiz(e) {
    e.preventDefault();
    if (!state.questions.length || state.graded) return;
    state.graded = true;
    var cards = $('questions').querySelectorAll('.q-card');
    var score = 0, skipped = 0;
    state.questions.forEach(function (q, i) {
      var card = cards[i];
      var labels = card.querySelectorAll('.q-opt');
      var chosen = card.querySelector('input[name="q' + i + '"]:checked');
      Array.prototype.forEach.call(labels, function (l) { l.querySelector('input').disabled = true; });
      labels[q.correct].classList.add('is-correct');
      var right = chosen && Number(chosen.value) === q.correct;
      if (right) { score++; card.classList.add('right'); }
      else {
        if (chosen) labels[Number(chosen.value)].classList.add('is-wrong'); else skipped++;
        card.classList.add('wrong');
      }
      var fb = document.createElement('p');
      fb.className = 'q-explain';
      fb.textContent = (right ? '\u2713 Correct. ' : '\u2717 Correct answer: ' + q.options[q.correct] + '. ') + (q.explain || '');
      card.appendChild(fb);
    });
    var total = state.questions.length, pct = Math.round((score / total) * 100);
    var msg = pct >= 90 ? 'Excellent work!' : pct >= 75 ? 'Great job!' : pct >= 50 ? 'Good effort \u2014 review the missed items.' : 'Keep practicing \u2014 review the explanations below.';
    var sb = $('scoreBox');
    sb.textContent = 'You scored ' + score + ' out of ' + total + ' (' + pct + '%). ' + msg + (skipped ? ' ' + skipped + ' unanswered.' : '');
    sb.classList.remove('hidden');
    var submit = document.querySelector('#quizForm button[type="submit"]');
    if (submit) submit.disabled = true;
    sb.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
 
  /* ------------------------------ generate flow ------------------------------ */
  function onGenerate() {
    if (state.busy) return;

    // 1. Synchronous input validation before launching tab
    if (state.mode === 'prompt') {
      var p = ($('promptText').value || '').trim();
      if (!p) {
        setStatus('Please type or paste your lesson text in the box first.', 'error');
        return;
      }
      if (p.length < 150 && !CONFIG.AI_ENDPOINT) {
        setStatus('This offline version builds questions from text you provide. Paste your lesson notes (at least a few sentences) into the box, or use \u201CBy file\u201D.', 'error');
        return;
      }
    } else if (state.mode === 'scan') {
      var typed = ($('scanText').value || '').trim();
      if (typed.length < 150 && !state.scanFile) {
        setStatus(typed ? 'The pasted notes are too short. Add more text or choose a scanned image.' : 'Please choose a scanned image or paste the text of your notes.', 'error');
        return;
      }
    } else {
      if (!state.file) {
        setStatus('Please choose a file first, then click \u201CGenerate Quiz\u201D.', 'error');
        return;
      }
    }

    // 2. Custom number of questions input (Constraint: min 1, max 50)
    var countEl = $('questionCount');
    var rawCount = countEl ? parseInt(countEl.value, 10) : 10;
    if (isNaN(rawCount) || rawCount < 1) {
      rawCount = 1;
    } else if (rawCount > 50) {
      rawCount = 50;
    }
    if (countEl) countEl.value = String(rawCount);
    var count = rawCount;

    var btn = $('generateBtn');
    state.busy = true;
    btn.disabled = true;
    btn.textContent = 'Generating\u2026';
    if ($('quizResults')) $('quizResults').classList.add('hidden');
    setStatus('Preparing your material and generating assessment\u2026', 'info');

    // 3. Store pending status in localStorage
    try {
      localStorage.setItem('edushare_quiz_status', 'generating');
      localStorage.removeItem('edushare_active_quiz');
    } catch (e) {}

    var opts = {
      count: count,
      type: $('questionType').value || 'multiple',
      difficulty: $('difficulty').value || 'Medium'
    };
    var sourceName = '';

    getSource().then(function (src) {
      sourceName = src.name;
      opts.text = src.text;
      setStatus('Creating questions\u2026', 'info');
      return new Promise(function (r) { setTimeout(r, 40); });
    }).then(function () {
      if (CONFIG.AI_ENDPOINT) {
        return generateWithAI(opts).catch(function (err) {
          console.warn('AI backend failed, using offline generator:', err);
          return generateLocal(opts);
        });
      }
      return generateLocal(opts);
    }).then(function (qs) {
      var labels = { multiple: 'Multiple choice', truefalse: 'True or false', mixed: 'Mixed questions' };
      var metaText = qs.length + ' questions \u00B7 ' + labels[opts.type] + ' \u00B7 ' + opts.difficulty + ' \u00B7 Source: ' + sourceName;

      var quizPayload = {
        questions: qs,
        meta: metaText,
        count: qs.length,
        type: opts.type,
        difficulty: opts.difficulty,
        sourceName: sourceName,
        generatedAt: Date.now()
      };

      try {
        localStorage.setItem('edushare_active_quiz', JSON.stringify(quizPayload));
        localStorage.setItem('edushare_quiz_status', 'ready');
      } catch (e) {
        console.warn('Could not write to localStorage:', e);
      }

      setStatus('✦ Quiz ready! Loading assessment\u2026', 'ok');

      // Navigate to quiz in the same tab (single-tab workflow)
      window.location.href = 'quiz.html';
    }).catch(function (err) {
      console.error(err);
      var errMsg = (err && err.message) || 'Something went wrong while generating the quiz. Please try again.';
      try {
        localStorage.setItem('edushare_quiz_status', 'error:' + errMsg);
      } catch (e) {}
      setStatus(errMsg, 'error');
    }).then(function () {
      state.busy = false;
      btn.disabled = false;
      btn.textContent = '\u2726 Generate Quiz';
    });
  }
 
  /* ------------------------------ file handling ------------------------------ */
  var FILE_EXT = ['txt', 'pdf', 'doc', 'docx', 'pptx', 'png', 'jpg', 'jpeg'];
  var IMG_EXT = ['png', 'jpg', 'jpeg'];
 
  function formatSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
 
  function acceptFile(file, scan) {
    if (!file) return;
    var ext = extFor(file), nameEl = scan ? $('scanName') : $('fileName');
    var allowed = scan ? IMG_EXT : FILE_EXT;
    if (allowed.indexOf(ext) === -1) {
      nameEl.textContent = 'Unsupported file type';
      setStatus(scan ? 'Please choose a PNG or JPG image.' : 'Unsupported file. Please use PDF, DOCX, PPTX, TXT, PNG, or JPG.', 'error');
      return;
    }
    if (file.size > CONFIG.MAX_FILE_MB * 1048576) {
      nameEl.textContent = 'File too large';
      setStatus('That file is larger than ' + CONFIG.MAX_FILE_MB + ' MB. Please choose a smaller one.', 'error');
      return;
    }
    if (scan) state.scanFile = file; else state.file = file;
    nameEl.textContent = 'Selected: ' + file.name + ' (' + formatSize(file.size) + ')';
    setStatus('', 'info');
  }
 
  function setMode(mode) {
    state.mode = mode;
    var panels = { file: 'fileMode', prompt: 'promptMode', scan: 'scanMode' };
    Object.keys(panels).forEach(function (k) {
      var p = $(panels[k]);
      if (p) p.classList.toggle('hidden', k !== mode);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.mode-tabs .tab'), function (t) {
      var on = t.getAttribute('data-mode') === mode;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    setStatus('', 'info');
  }
 
  /* ---------------------------------- init ---------------------------------- */
  function init() {
    injectStyles();
 
    Array.prototype.forEach.call(document.querySelectorAll('.mode-tabs .tab'), function (t) {
      t.addEventListener('click', function () { setMode(t.getAttribute('data-mode')); });
    });
 
    var lessonInput = $('lessonFile');
    if (lessonInput) lessonInput.addEventListener('change', function () { acceptFile(lessonInput.files[0], false); });
    var scanInput = $('scanFile');
    if (scanInput) scanInput.addEventListener('change', function () { acceptFile(scanInput.files[0], true); });
 
    var dz = $('dropzone');
    if (dz) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag-over'); });
      });
      ['dragleave', 'dragend'].forEach(function (ev) {
        dz.addEventListener(ev, function () { dz.classList.remove('drag-over'); });
      });
      dz.addEventListener('drop', function (e) {
        e.preventDefault();
        dz.classList.remove('drag-over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) acceptFile(f, false);
      });
    }
    // Stop the browser from opening a file that is dropped outside the box
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });
 
    // Custom question count number input constraints (min 1, max 50)
    var countInput = $('questionCount');
    if (countInput) {
      countInput.addEventListener('input', function () {
        if (countInput.value !== '') {
          var val = parseInt(countInput.value, 10);
          if (val > 50) countInput.value = '50';
          else if (val < 1) countInput.value = '1';
        }
      });
      countInput.addEventListener('blur', function () {
        if (!countInput.value || parseInt(countInput.value, 10) < 1) {
          countInput.value = '10';
        }
      });
    }

    var genBtn = $('generateBtn');
    if (genBtn) genBtn.addEventListener('click', onGenerate);

    var qForm = $('quizForm');
    if (qForm) qForm.addEventListener('submit', gradeQuiz);

    var nqBtn = $('newQuizBtn');
    if (nqBtn) {
      nqBtn.addEventListener('click', function () {
        if ($('quizResults')) $('quizResults').classList.add('hidden');
        if ($('questions')) $('questions').textContent = '';
        state.questions = [];
        setStatus('', 'info');
        var b = document.querySelector('.builder');
        if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
 
    setMode('file');
  }
 
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();