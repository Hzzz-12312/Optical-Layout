(() => {
  "use strict";
  const HTML = "http://www.w3.org/1999/xhtml";

  function mount(root, { onCapture, onClear, onCancel }) {
    const doc = root.ownerDocument;
    function element(tag, css, text) {
      const node = doc.createElementNS(HTML, tag);
      node.className = css;
      if (text) node.textContent = text;
      return node;
    }
    const panel = element("section", "oc-reference");
    panel.setAttribute("aria-label", "论文参考图");
    const header = element("div", "oc-reference-header");
    const name = element("strong", "oc-reference-title", "论文参考图");
    const page = element("span", "oc-reference-page");
    const actions = element("div", "oc-reference-actions");
    const viewport = element("div", "oc-reference-viewport");
    const image = element("img", "oc-reference-image");
    image.alt = "固定在光路画布上方的文献截图";
    image.draggable = false;
    viewport.append(image);
    const status = element("p", "oc-reference-status");
    status.setAttribute("role", "status");

    let reference = null;
    let capturing = false;
    let zoomed = false;
    let disposed = false;

    function button(key, label, handler) {
      const el = element("button", "oc-reference-button", label);
      el.type = "button";
      el.dataset.action = key;
      el.addEventListener("click", async () => {
        try { await handler(); }
        catch (error) { setStatus(error?.message || String(error)); }
      });
      actions.append(el);
      return el;
    }
    const capture = button("capture-reference", "框选参考图", onCapture);
    const cancel = button("cancel-reference", "取消框选", onCancel);
    const zoom = button("zoom-reference", "放大", () => {
      zoomed = !zoomed;
      update();
    });
    const clear = button("clear-reference", "移除", onClear);
    clear.title = "移除这份 PDF 的参考图";
    function update() {
      capture.hidden = capturing;
      cancel.hidden = !capturing;
      capture.textContent = reference ? "重新框选" : "框选参考图";
      clear.hidden = zoom.hidden = !reference;
      clear.disabled = capturing;
      viewport.hidden = !reference;
      viewport.classList.toggle("is-zoomed", zoomed);
      zoom.textContent = zoomed ? "适应" : "放大";
      zoom.title = zoomed ? "显示整张参考图" : "放大并滚动查看图中细节";
      zoom.setAttribute("aria-pressed", String(zoomed));
      if (!zoomed) viewport.scrollLeft = viewport.scrollTop = 0;
    }
    function setStatus(text) {
      if (disposed) return;
      const message = text || (capturing
        ? "在 PDF 页面上拖动框选，按 Esc 取消。"
        : reference ? "" : "框选文献插图后，可在翻页时继续对照。");
      status.textContent = message;
      status.hidden = !message;
    }
    function setReference(next) {
      if (disposed) return;
      const changed = reference?.dataURL !== next?.dataURL;
      reference = next || null;
      if (changed) {
        zoomed = false;
        if (reference) image.setAttribute("src", reference.dataURL);
        else image.removeAttribute("src");
      }
      page.textContent = reference && Number.isInteger(reference.pageIndex)
        ? "PDF 第 " + (reference.pageIndex + 1) + " 页" : "";
      page.hidden = !page.textContent;
      update();
      setStatus("");
    }
    function setCapturing(value) {
      if (disposed) return;
      capturing = Boolean(value);
      update();
      setStatus("");
    }
    header.append(name, page, actions);
    panel.append(header, viewport, status);
    root.append(panel);
    setReference(null);
    return {
      setReference, setCapturing, setStatus,
      destroy() {
        disposed = true;
        reference = null;
        image.removeAttribute("src");
        panel.remove();
      }
    };
  }
  globalThis.OpticalReferencePanel = { mount };
})();

