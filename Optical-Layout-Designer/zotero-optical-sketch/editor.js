(() => {
  "use strict";
  const HTML = "http://www.w3.org/1999/xhtml";
  const SVG = "http://www.w3.org/2000/svg";
  // The keys and prefixes match optolayout.model.SCH_KINDS.
  const symbols = {
    laser: ["激光源", "LAS", "M-14 -8H7V8H-14Z M7 0H17 M14 -3L17 0L14 3"],
    mirror: ["反射镜", "M", "M-10 10L10 -10 M-7 12L12 -7 M-4 9L-4 13 M1 4V8 M6 -1V3"],
    lens: ["透镜", "L", "M0 -14Q12 0 0 14Q-12 0 0 -14Z"],
    bs: ["分束器", "BS", "M-10 -10H10V10H-10Z M-10 10L10 -10"],
    pbs: ["偏振分束器", "PBS", "M-10 -10H10V10H-10Z M-10 10L10 -10 M-7 -1L-2 -6 M1 7L7 1"],
    hwp: ["半波片", "HWP", "M-4 -13H4V13H-4Z M-4 6L4 -6"],
    qwp: ["四分之一波片", "QWP", "M-4 -13H4V13H-4Z M-4 4L4 -8 M-4 10L4 -2"],
    aom: ["声光调制器", "AOM", "M-12 -9H12V9H-12Z M-9 1Q-6 -6 -3 1T3 1T9 1"],
    shutter: ["快门", "SH", "M-9 -10H9V10H-9Z M-7 8L7 -8"],
    fiber: ["光纤耦合器", "FC", "M-10 -9L1 0L-10 9Z M1 0Q7 -10 15 0"],
    iris: ["光阑", "IR", "M0 -12V-3 M0 3V12 M-5 -12H5 M-5 12H5"],
    photodiode: ["光电探测器", "PD", "M-11 -9H10V9H-11Z M-6 -5L2 0L-6 5Z M3 -5V5"],
    dump: ["光束终止器", "BD", "M-11 -10H11V10H-11Z M-7 5L-2 -5 M-2 5L3 -5 M3 5L8 -5"]
  };
  Object.assign(symbols, globalThis.OpticalCatalog || {});
  const clone = value => JSON.parse(JSON.stringify(value));
  let serial = 0;

  function mount(root, schematic, onChange, options = {}) {
    const doc = root.ownerDocument;
    const uid = "optical-" + Date.now().toString(36) + "-" + (++serial);
    const freshID = () => uid + "-" + (++serial);
    const create = (ns, name, attrs = {}, value) => {
      const element = doc.createElementNS(ns, name);
      for (const [key, val] of Object.entries(attrs)) element.setAttribute(key, String(val));
      if (value !== undefined) element.textContent = value;
      return element;
    };
    const html = (name, attrs, value) => create(HTML, name, attrs, value);
    const svg = (name, attrs, value) => create(SVG, name, attrs, value);

    let data = clone(schematic || {});
    data.elements ??= [];
    data.links ??= [];
    let mode = "select", selected = null, source = null, drag = null;
    let view = {x: 0, y: 0, w: 360, h: 320};
    const undoStack = [], redoStack = [];
    const prefs = globalThis.Zotero?.Prefs;
    const prefKey = "extensions.optical-sketch.grid.";
    const readPref = (key, fallback) => prefs?.get(prefKey + key, true) ?? fallback;
    const steps = [5, 10, 20, 40];
    let spacing = readPref("step", 10);
    if (!steps.includes(spacing)) spacing = 10;
    let showGrid = readPref("show", true);
    let snap = readPref("snap", true);
    const shell = html("div", {class: "optical-canvas"});
    const toolbar = html("div", {class: "oc-tools"});
    const palette = html("select", {"aria-label": "元件类型", title: "选择后点击画布放置"});
    palette.append(html("option", {value: ""}, "＋ 放置元件"));
    const categories = {
      "光源与探测": ["laser", "photodiode", "camera", "spectrometer"],
      "反射、分束与色散": ["mirror", "bs", "pbs", "dichroic", "grating", "prism"],
      "成像与耦合": ["lens", "objective", "fiber"],
      "偏振与调制": ["hwp", "qwp", "polarizer", "isolator", "aom", "eom"],
      "滤光": ["longpass", "shortpass", "bandpass", "notch", "nd_filter"],
      "光束控制与样品": ["iris", "shutter", "dump", "sample"]
    };
    const grouped = new Set(Object.values(categories).flat());
    categories["其他"] = Object.keys(symbols).filter(kind => !grouped.has(kind));
    for (const [label, kinds] of Object.entries(categories)) {
      const group = html("optgroup", {label});
      for (const kind of kinds) {
        if (symbols[kind]) group.append(html("option", {value: kind}, symbols[kind][0]));
      }
      if (group.childElementCount) palette.append(group);
    }
    palette.addEventListener("change", () => setMode(palette.value || "select"));
    const button = (label, title, handler) => {
      const node = html("button", {type: "button", title, "aria-label": title}, label);
      node.addEventListener("click", handler);
      return node;
    };
    const select = button("选择", "选择、拖动元件或平移画布", () => setMode("select"));
    const connect = button("连线", "依次点击光束的起点和终点", () => setMode(mode === "beam" ? "select" : "beam"));
    const undo = button("撤销", "撤销上次修改", () => stepHistory(undoStack, redoStack));
    const redo = button("重做", "重做上次撤销", () => stepHistory(redoStack, undoStack));
    const remove = button("删除", "删除选中元件或光束", removeSelection);
    const duplicate = button("复制", "复制选中元件（Ctrl+D）", duplicateSelection);
    duplicate.dataset.action = "duplicate";
    toolbar.append(palette, select, connect, duplicate, undo, redo, remove);
    const status = html("div", {class: "oc-status", "aria-live": "polite"});
    const board = svg("svg", {class: "oc-board", tabindex: 0, role: "application", "aria-label": "手绘光路画布"});
    const defs = svg("defs");
    const gridID = uid + "-grid";
    const pattern = svg("pattern", {id: gridID, patternUnits: "userSpaceOnUse"});
    for (let corner = 0; corner < 4; corner++) pattern.append(svg("circle", {fill: "#9aaeb6"}));
    defs.append(pattern);
    const gridRect = svg("rect", {fill: "url(#" + gridID + ")", "pointer-events": "none"});
    const guide = svg("line", {stroke: "#087b84", "stroke-width": 1.2,
      "stroke-dasharray": "4 3", "pointer-events": "none", visibility: "hidden"});
    const glyphs = svg("g");
    board.append(defs, gridRect, guide, glyphs);
    const gridBar = html("div", {class: "oc-tools oc-grid"});
    function checkbox(label, key, initial, apply) {
      const wrap = html("label", {class: "oc-check"});
      const box = html("input", {type: "checkbox", "aria-label": label});
      box.checked = initial;
      box.addEventListener("change", () => {
        apply(box.checked);
        prefs?.set(prefKey + key, box.checked, true);
        updateView();
      });
      wrap.append(box, html("span", {}, label));
      return wrap;
    }
    const spacingMenu = html("select", {"aria-label": "网格间距", title: "原理图坐标的网格间距"});
    for (const step of steps) spacingMenu.append(html("option", {value: step}, "间距 " + step));
    spacingMenu.value = String(spacing);
    spacingMenu.addEventListener("change", () => {
      spacing = Number(spacingMenu.value);
      prefs?.set(prefKey + "step", spacing, true);
      updateView();
    });
    gridBar.append(checkbox("网格", "show", showGrid, on => { showGrid = on; }),
      checkbox("吸附", "snap", snap, on => { snap = on; }), spacingMenu);
    const viewbar = html("div", {class: "oc-tools oc-view"});
    viewbar.append(button("−", "缩小画布", () => zoom(1.25)),
      button("＋", "放大画布", () => zoom(0.8)), button("适应", "显示全部元件", fit));
    const inspector = html("div", {class: "oc-inspector"});
    shell.append(toolbar, gridBar, status, board, viewbar, inspector);
    root.append(shell);

    function updateView() {
      board.setAttribute("viewBox", [view.x, view.y, view.w, view.h].join(" "));
      // xMidYMid meet leaves extra world space visible on wide or tall panels.
      const scale = Math.min(board.clientWidth / view.w, board.clientHeight / view.h);
      const w = scale > 0 ? board.clientWidth / scale : view.w;
      const h = scale > 0 ? board.clientHeight / scale : view.h;
      gridRect.setAttribute("x", view.x + (view.w - w) / 2);
      gridRect.setAttribute("y", view.y + (view.h - h) / 2);
      gridRect.setAttribute("width", w);
      gridRect.setAttribute("height", h);
      gridRect.setAttribute("visibility", showGrid ? "visible" : "hidden");
      // Keep intersections legible at wide zoom levels. Every shown dot is on a snap point.
      let displayStep = spacing;
      while (scale > 0 && displayStep * scale < 6) displayStep *= 2;
      pattern.setAttribute("width", displayStep);
      pattern.setAttribute("height", displayStep);
      Array.from(pattern.children).forEach((dot, i) => {
        dot.setAttribute("cx", i % 2 === 0 ? 0 : displayStep);
        dot.setAttribute("cy", i < 2 ? 0 : displayStep);
        dot.setAttribute("r", scale > 0 ? 0.9 / scale : 0.9);
      });
    }
    function fit() {
      if (!data.elements.length) {
        view = {x: 0, y: 0, w: 360, h: 320};
      } else {
        const xs = data.elements.map(e => e.x), ys = data.elements.map(e => e.y);
        const left = Math.min(...xs), right = Math.max(...xs);
        const top = Math.min(...ys), bottom = Math.max(...ys);
        const w = Math.max(240, right-left+95), h = Math.max(210, bottom-top+90);
        view = {x: (left+right-w)/2, y: (top+bottom-h)/2, w, h};
      }
      updateView();
    }
    function zoom(factor) {
      if (view.w * factor < 85 || view.w * factor > 50000) return;
      view.x += view.w * (1-factor)/2;
      view.y += view.h * (1-factor)/2;
      view.w *= factor;
      view.h *= factor;
      updateView();
    }
    function current(id = selected) {
      if (!id) return null;
      return data.elements.find(item => item.id === id) || data.links.find(item => item.id === id);
    }
    function checkpoint(state) {
      undoStack.push(state);
      if (undoStack.length > 80) undoStack.shift();
      redoStack.length = 0;
    }
    function publish() {
      onChange?.(clone(data));
    }
    function change(fn) {
      checkpoint(clone(data));
      fn();
      sync();
      publish();
    }
    function stepHistory(from, to) {
      if (!from.length) return;
      to.push(data);
      data = from.pop();
      // Never mutate stored history objects through the live editor.
      selected = null;
      setMode("select");
      publish();
    }
    function removeSelection() {
      if (!current()) return;
      change(() => {
        data.elements = data.elements.filter(e => e.id !== selected);
        data.links = data.links.filter(e => e.id !== selected && e.source !== selected && e.target !== selected);
        selected = source = null;
      });
    }
    function setMode(value) {
      mode = value;
      source = null;
      palette.value = symbols[mode] ? mode : "";
      sync();
    }
    function coordinate(value, bypass) {
      return snap && !bypass ? Math.round(value / spacing) * spacing : Math.round(value * 100) / 100;
    }
    function nextLabel(kind) {
      const prefix = symbols[kind]?.[1] || "E";
      const labels = new Set(data.elements.map(e => e.label));
      let n = 1;
      while (labels.has(prefix+n)) ++n;
      return prefix + n;
    }
    function addPart(point, ev, linkID) {
      const kind = mode;
      change(() => {
        selected = freshID();
        data.elements.push({id: selected, kind, x: coordinate(point.x, ev.altKey),
          y: coordinate(point.y, ev.altKey), label: nextLabel(kind), angle: 0,
          notes: "", part: "", part_number: "", auto_angle: true});
        const link = linkID && data.links.find(edge => edge.id === linkID);
        if (link) {
          data.links.push({...link, id: freshID(), source: selected});
          link.target = selected;
        }
        if (!ev.shiftKey) {
          mode = "select";
          palette.value = "";
        }
      });
    }
    function duplicateSelection() {
      const part = current();
      if (!part?.kind) return;
      change(() => {
        const offset = snap ? Math.ceil(40 / spacing) * spacing : 40;
        const copy = {...clone(part), id: freshID(), label: nextLabel(part.kind),
          x: coordinate(part.x + offset, false), y: coordinate(part.y + offset, false)};
        delete copy.sourcePage;
        data.elements.push(copy);
        selected = copy.id;
      });
    }
    function addLink(target, restart) {
      if (restart || !source || source === target) {
        source = restart || !source ? target : null;
        selected = source;
        sync();
        return;
      }
      if (data.links.some(l => l.source === source && l.target === target)) {
        status.textContent = "这条光束已存在。按 Esc 结束连线。";
        return;
      }
      change(() => {
        selected = freshID();
        data.links.push({id: selected, source, target, color: "#9874b3", wavelength_nm: null, label: ""});
        source = target;
      });
    }

    function draw() {
      const items = new Map(data.elements.map(e => [e.id, e]));
      const fragment = doc.createDocumentFragment();
      for (const link of data.links) {
        const a = items.get(link.source), b = items.get(link.target);
        if (!a || !b) continue;
        const dx = b.x-a.x, dy = b.y-a.y, d = Math.hypot(dx, dy) || 1;
        const ux = dx/d, uy = dy/d, mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
        const paint = /^#[a-f0-9]{6}$/i.test(link.color) ? link.color : "#9874b3";
        const g = svg("g", {"data-link": link.id});
        const ends = {x1: a.x, y1: a.y, x2: b.x, y2: b.y};
        if (selected === link.id) g.append(svg("line", {...ends, stroke: "#87c6c8", "stroke-width": 7}));
        g.append(svg("line", {...ends, stroke: "transparent", "stroke-width": 13}),
          svg("line", {...ends, stroke: paint, "stroke-width": selected === link.id ? 3 : 2}),
          svg("polygon", {points: [[mx+ux*5,my+uy*5],[mx-ux*4-uy*3,my-uy*4+ux*3],
            [mx-ux*4+uy*3,my-uy*4-ux*3]].map(p => p.join(",")).join(" "), fill: paint}));
        fragment.append(g);
      }
      for (const e of data.elements) {
        const g = svg("g", {transform: "translate("+e.x+" "+e.y+")", "data-element": e.id});
        g.append(svg("title", {}, (e.label || "")+" · "+(symbols[e.kind]?.[0] || e.kind)),
          svg("rect", {x:-17,y:-16,width:34,height:32,rx:5,
            fill: source === e.id ? "#d1efe9" : "#fff",
            stroke: e.id === selected || source === e.id ? "#087b84" : "#bacbd1"}),
          svg("path", {d: symbols[e.kind]?.[2] || "M-8 -8H8V8H-8Z", stroke: "#253a47",
            fill: "none", "stroke-width": 1.7, transform: "rotate("+(Number(e.angle)||0)+")"}),
          svg("text", {x:0,y:28,"text-anchor":"middle","font-size":10,fill:"#263e49"}, e.label || e.kind));
        fragment.append(g);
      }
      glyphs.replaceChildren(fragment);
    }
    function field(label, value, apply, type = "text") {
      const wrap = html("label", {class:"oc-field"});
      const input = html("input", {type, "aria-label":label});
      if (type === "number") { input.min = "0.000001"; input.step = "any"; }
      input.value = value ?? "";
      input.addEventListener("change", () => {
        if (!input.reportValidity()) return;
        const v = type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value.trim();
        if (v !== value) change(() => apply(v));
      });
      wrap.append(html("span", {}, label), input);
      return wrap;
    }
    function beamColorField(link) {
      const colors = new Map([
        ["#9874b3", "紫"], ["#cf4350", "红"], ["#e28624", "橙"], ["#27813e", "绿"],
        ["#268b92", "青"], ["#3479c5", "蓝"], ["#556371", "灰"]
      ]);
      const saved = link.color?.toLowerCase() || "#9874b3";
      if (!colors.has(saved)) colors.set(saved, "原有色 " + saved);
      const field = html("label", {class: "oc-field"});
      const menu = html("select", {"aria-label": "光束颜色"});
      for (const [hex, name] of colors) menu.append(html("option", {value: hex}, name));
      menu.value = saved;
      menu.addEventListener("change", () => change(() => { link.color = menu.value; }));
      field.append(html("span", {}, "光束颜色"), menu);
      return field;
    }
    function sync() {
      draw();
      const item = current();
      remove.disabled = !item;
      duplicate.disabled = !item?.kind;
      guide.setAttribute("visibility", "hidden");
      undo.disabled = !undoStack.length;
      redo.disabled = !redoStack.length;
      select.setAttribute("aria-pressed", String(mode === "select"));
      connect.setAttribute("aria-pressed", String(mode === "beam"));
      board.style.cursor = mode === "select" ? "default" : "crosshair";
      status.textContent = mode === "beam"
        ? (source ? "点击下一元件续接 · Shift 点击另选起点 · Esc 退出" : "依次点击元件连接光束 · Esc 退出")
        : symbols[mode] ? "点击放置" + symbols[mode][0] + "，点光束可插入 · Shift 连放 · Alt 自由定位"
        : item?.kind ? "方向键移动 · Alt + 方向键微调 · R 旋转 · Ctrl+D 复制"
        : "拖动空白处平移 · Alt 拖动自由定位 · B 连线";
      inspector.replaceChildren();
      if (!item) return;
      if ("kind" in item) {
        inspector.append(field("名称", item.label, v => { item.label = v; }),
          field("型号", item.part_number || "", v => { item.part_number = v; }),
          field("备注", item.notes || "", v => { item.notes = v; }),
          button("旋转 45°", "手动旋转选中元件", () => change(() => {
            item.angle = ((item.angle || 0)+45)%360; item.auto_angle = false;
          })));
      } else {
        inspector.append(field("光束名称", item.label || "", v => { item.label = v; }), beamColorField(item),
          field("波长 (nm)", item.wavelength_nm ?? null, v => { item.wavelength_nm = v; }, "number"));
      }
      options.renderSource?.(inspector, item, mutator => change(() => mutator(item)));
    }

    function pos(ev, inverse = board.getScreenCTM()?.inverse()) {
      if (!inverse) return null;
      const pt = board.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      return pt.matrixTransform(inverse);
    }
    board.addEventListener("pointerdown", ev => {
      if (ev.button !== 0 || drag) return;
      const inverse = board.getScreenCTM()?.inverse();
      const p = pos(ev, inverse);
      if (!p) return;
      board.focus();
      const eid = ev.target.closest("[data-element]")?.getAttribute("data-element");
      const lid = ev.target.closest("[data-link]")?.getAttribute("data-link");
      if (symbols[mode]) {
        if (!eid) addPart(p, ev, lid);
        return;
      }
      if (mode === "beam") {
        if (eid) addLink(eid, ev.shiftKey);
        return;
      }
      selected = eid || lid || null;
      const el = eid && current(eid);
      if (!lid) {
        drag = {id:ev.pointerId, el, p, inverse, before:el ? clone(data) : null,
          x:el ? el.x : view.x, y:el ? el.y : view.y};
        board.setPointerCapture(ev.pointerId);
      }
      sync();
    });
    board.addEventListener("pointermove", ev => {
      if (!drag && mode === "beam" && source) {
        const start = current(source), end = pos(ev);
        if (start && end) {
          guide.setAttribute("x1", start.x); guide.setAttribute("y1", start.y);
          guide.setAttribute("x2", end.x); guide.setAttribute("y2", end.y);
          guide.setAttribute("visibility", "visible");
        }
      }
      if (drag?.id !== ev.pointerId) return;
      const p = pos(ev, drag.inverse), dx = p.x-drag.p.x, dy = p.y-drag.p.y;
      if (drag.el) {
        if (!dx && !dy && drag.x === drag.el.x && drag.y === drag.el.y) return;
        drag.el.x = coordinate(drag.x+dx, ev.altKey);
        drag.el.y = coordinate(drag.y+dy, ev.altKey);
        draw();
      } else {
        view.x = drag.x-dx; view.y = drag.y-dy; updateView();
      }
    });
    board.addEventListener("pointerleave", () => guide.setAttribute("visibility", "hidden"));
    function finish(ev) {
      if (drag?.id !== ev.pointerId) return;
      const last = drag; drag = null;
      if (!last.el) return;
      if (ev.type === "pointercancel") {
        last.el.x = last.x; last.el.y = last.y; sync(); return;
      }
      if (last.x !== last.el.x || last.y !== last.el.y) {
        checkpoint(last.before); sync(); publish();
      }
    }
    for (const type of ["pointerup","pointercancel","lostpointercapture"]) board.addEventListener(type, finish);
    board.addEventListener("keydown", ev => {
      if (drag) return;
      const key = ev.key.toLowerCase();
      const part = current();
      const mod = ev.ctrlKey || ev.metaKey;
      if (key === "escape") setMode("select");
      else if (key === "delete" || key === "backspace") removeSelection();
      else if (mod && key === "d" && part?.kind) duplicateSelection();
      else if (!mod && key === "r" && part?.kind) change(() => {
        part.angle = ((part.angle || 0) + (ev.shiftKey ? 315 : 45)) % 360;
        part.auto_angle = false;
      });
      else if (!mod && part?.kind && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
        const axis = key === "arrowleft" || key === "arrowright" ? "x" : "y";
        const dir = key === "arrowleft" || key === "arrowup" ? -1 : 1;
        change(() => {
          const currentValue = part[axis];
          part[axis] = snap && !ev.altKey
            ? (dir > 0 ? Math.floor(currentValue / spacing) + 1 : Math.ceil(currentValue / spacing) - 1) * spacing
            : coordinate(currentValue + dir, true);
        });
      }
      else if (mod && key === "z") {
        if (ev.shiftKey) stepHistory(redoStack, undoStack);
        else stepHistory(undoStack, redoStack);
      } else if (key === "b" && !ev.ctrlKey && !ev.metaKey) setMode("beam");
      else return;
      ev.preventDefault(); ev.stopPropagation();
    });
    const Observer = doc.defaultView?.ResizeObserver;
    const observer = Observer ? new Observer(updateView) : null;
    observer?.observe(board);
    fit();
    sync();
    function replaceData(schematic) {
      const pointerId = drag?.id;
      drag = null;
      if (pointerId != null && board.hasPointerCapture(pointerId)) board.releasePointerCapture(pointerId);
      data = clone(schematic);
      if (!current()) selected = null;
      undoStack.length = redoStack.length = 0;
      setMode("select");
    }
    return {getData: () => clone(data), replaceData, destroy: () => {
      observer?.disconnect();
      shell.remove();
    }};
  }
  globalThis.OpticalCanvas = {mount};
})();

