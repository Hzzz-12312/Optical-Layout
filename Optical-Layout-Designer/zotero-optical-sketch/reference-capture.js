(() => {
  "use strict";
  const HTML = "http://www.w3.org/1999/xhtml";
  const active = new WeakMap();

  function begin(reader, {onCapture, onCancel, onError}) {
    const internal = reader?._internalReader;
    const view = internal?._lastView || internal?._primaryView;
    const win = view?._iframeWindow;
    const app = win?.PDFViewerApplication;
    if (!app?.pdfViewer || !app.pdfDocument) {
      throw new Error("请在 Zotero 的 PDF 原文视图中打开文献，等页面显示后再框选。");
    }
    const doc = win.document;
    active.get(doc)?.();

    const overlay = doc.createElementNS(HTML, "div");
    overlay.id = "optical-sketch-crop-overlay";
    overlay.tabIndex = 0;
    overlay.setAttribute("aria-label", "在一页 PDF 内拖动框选参考图，按 Esc 取消");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;touch-action:none;user-select:none;outline:none;background:transparent;";
    const box = doc.createElementNS(HTML, "div");
    box.style.cssText = "display:none;position:absolute;pointer-events:none;box-sizing:border-box;border:2px solid #087b84;background:rgba(8,123,132,.16);";
    overlay.append(box);
    const previousFocus = doc.activeElement;
    let drag = null, closed = false, cancelled = false, rendering = false;
    const stop = event => { event.preventDefault(); event.stopPropagation(); };
    const clamp = (value, low, high) => Math.max(low, Math.min(value, high));

    function cancel() {
      if (closed) return;
      cancelled = true;
      close();
      onCancel?.();
    }
    function close() {
      closed = true;
      if (active.get(doc) === cancel) active.delete(doc);
      win.removeEventListener("pagehide", cancel);
      win.removeEventListener("keydown", keydown, true);
      const restore = doc.activeElement === overlay;
      overlay.remove();
      if (restore && previousFocus?.isConnected) previousFocus.focus?.();
    }
    function keydown(event) {
      if (event.key === "Escape") { stop(event); cancel(); }
    }
    function pointerdown(event) {
      if (event.button !== 0 || drag || rendering) return;
      stop(event);
      const pageDiv = doc.elementsFromPoint(event.clientX, event.clientY)
        .map(el => el.closest(".page[data-page-number]")).find(Boolean);
      if (!pageDiv) return;
      const pageIndex = Number(pageDiv.dataset.pageNumber) - 1;
      const page = app.pdfViewer.getPageView(pageIndex);
      const wrapper = page?.div?.querySelector(".canvasWrapper");
      if (!wrapper) return;
      const bounds = wrapper.getBoundingClientRect();
      const x = event.clientX, y = event.clientY;
      if (!bounds.width || !bounds.height || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
      drag = {pointer:event.pointerId, u:(x-bounds.left)/bounds.width, v:(y-bounds.top)/bounds.height, pageIndex};
      try { overlay.setPointerCapture(event.pointerId); } catch (_) { /* Synthetic or released pointer */ }
      updateBox(event);
    }
    function region(event) {
      const page = app.pdfViewer.getPageView(drag.pageIndex);
      const bounds = page?.div?.querySelector(".canvasWrapper")?.getBoundingClientRect();
      if (!bounds?.width || !bounds.height) return null;
      // Keep the first corner anchored to the page if the viewport moves.
      const x = bounds.left + drag.u * bounds.width;
      const y = bounds.top + drag.v * bounds.height;
      const endX = clamp(event.clientX, bounds.left, bounds.right);
      const endY = clamp(event.clientY, bounds.top, bounds.bottom);
      return {left:Math.min(x, endX), top:Math.min(y, endY), width:Math.abs(endX-x), height:Math.abs(endY-y)};
    }
    function updateBox(event) {
      if (!drag || event.pointerId !== drag.pointer) return;
      stop(event);
      const rect = region(event);
      if (!rect) return;
      box.style.display = "block";
      for (const [key, value] of Object.entries(rect)) box.style[key] = value + "px";
    }
    async function pointerup(event) {
      if (!drag || drag.pointer !== event.pointerId || rendering) return;
      stop(event);
      const rect = region(event);
      const selection = drag;
      drag = null;
      box.style.display = "none";
      if (!rect) { close(); onError(new Error("该页已离开阅读区，请重新框选。")); return; }
      if (rect.width < 4 || rect.height < 4) return;
      rendering = true;
      overlay.style.cursor = "progress";
      let canvas;
      try {
        // Sample the rendered PDF page in its own coordinate system. The DOM
        // quad accounts for CSS rotations used by PDF.js during zoom/rotation.
        const pageIndex = selection.pageIndex;
        const page = app.pdfViewer.getPageView(pageIndex);
        const original = page.canvas || page.div.querySelector(".canvasWrapper canvas");
        if (!original?.width || !original.height || page.renderingState !== 3) {
          throw new Error("该页还在绘制，请等页面显示完整后再框选。");
        }
        const box = original.getBoundingClientRect();
        const quad = original.getBoxQuads?.()[0];
        const origin = quad?.p1 || {x:box.left,y:box.top};
        const upperRight = quad?.p2 || {x:box.right,y:box.top};
        const lowerLeft = quad?.p4 || {x:box.left,y:box.bottom};
        const ax = (upperRight.x-origin.x)/original.width, ay = (upperRight.y-origin.y)/original.width;
        const bx = (lowerLeft.x-origin.x)/original.height, by = (lowerLeft.y-origin.y)/original.height;
        const unit = Math.max(Math.hypot(ax,ay),Math.hypot(bx,by));
        if (!(unit > 0)) throw new Error("无法读取这一页，请重新打开 PDF。");
        const scale = Math.min(1/unit, 3072/Math.max(rect.width,rect.height),
          Math.sqrt(4000000/(rect.width*rect.height)));
        canvas = doc.createElementNS(HTML, "canvas");
        canvas.width = Math.max(1, Math.round(rect.width * scale));
        canvas.height = Math.max(1, Math.round(rect.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.setTransform(scale*ax,scale*ay,scale*bx,scale*by,
          scale*(origin.x-rect.left),scale*(origin.y-rect.top));
        ctx.drawImage(original,0,0);
        const dataURL = canvas.toDataURL("image/png");
        const pageLabel = page.pageLabel || String(pageIndex + 1);
        close();
        await onCapture({dataURL, pageIndex, pageLabel});
      } catch (error) {
        if (!closed) close();
        if (!cancelled) onError(error);
      } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0; }
      }
    }

    doc.body.append(overlay);
    active.set(doc, cancel);
    overlay.addEventListener("pointerdown", pointerdown);
    overlay.addEventListener("pointermove", updateBox);
    overlay.addEventListener("pointerup", pointerup);
    overlay.addEventListener("pointercancel", cancel);
    overlay.addEventListener("contextmenu", event => { stop(event); cancel(); });
    win.addEventListener("pagehide", cancel, false);
    win.addEventListener("keydown", keydown, true);
    overlay.focus();
    return cancel;
  }

  globalThis.OpticalReferenceCapture = {begin};
})();

