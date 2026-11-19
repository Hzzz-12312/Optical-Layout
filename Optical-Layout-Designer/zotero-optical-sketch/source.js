(() => {
  "use strict";
  const HTML = "http://www.w3.org/1999/xhtml";

  // Zotero's PDF toolbar uses the active split's view stats. In the PDF.js
  // view currentPageNumber also reflects a just-completed scroll immediately.
  function currentPage(reader) {
    const internal = reader?._internalReader;
    const visibleNumber = internal?._lastView?._iframeWindow?.PDFViewerApplication?.pdfViewer?.currentPageNumber;
    if (Number.isSafeInteger(visibleNumber) && visibleNumber > 0) return visibleNumber - 1;
    const state = internal?._state;
    const stats = state?.primary === false ? state.secondaryViewStats : state?.primaryViewStats;
    return Number.isSafeInteger(stats?.pageIndex) && stats.pageIndex >= 0 ? stats.pageIndex : null;
  }

  function controls(panel, item, mutate, getReader, openPage, report) {
    const doc = panel.ownerDocument;
    const hasSource = Number.isSafeInteger(item.sourcePage) && item.sourcePage >= 0;
    if (!getReader() && !hasSource) return;
    const row = doc.createElementNS(HTML, "div");
    row.className = "oc-tools";
    function button(title, action, handler) {
      const el = doc.createElementNS(HTML, "button");
      el.type = "button";
      el.textContent = title;
      el.dataset.action = action;
      el.addEventListener("click", async () => {
        try { await handler(); } catch (error) { report(error); }
      });
      row.append(el);
    }
    if (getReader()) {
      button(hasSource ? "更新为当前页" : "标记当前 PDF 页", "bind-page", () => {
        const page = currentPage(getReader());
        if (page === null) throw Error("暂时无法读取页码，请等 PDF 页面加载后再标记。");
        if (item.sourcePage !== page) mutate(record => { record.sourcePage = page; });
      });
    }
    if (hasSource) {
      button("查看 PDF 第 " + (item.sourcePage + 1) + " 页", "go-page", () => openPage(item.sourcePage));
      button("解除页码关联", "unlink-page", () => mutate(record => { delete record.sourcePage; }));
    }
    panel.append(row);
  }
  globalThis.OpticalSource = { controls };
})();

