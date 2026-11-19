'use strict';
var window = this;
var paneID, styleText;
const states = new Map();
const pending = new Set();
const HTML = 'http://www.w3.org/1999/xhtml';
function tabItem(body) {
  const details = body.closest('item-details');
  const tabID = details?.tabID;
  if (!tabID) return null;
  const reader = Zotero.Reader.getByTabID(tabID);
  if (reader?.itemID) return Zotero.Items.get(reader.itemID);
  const nativeTab = body.ownerDocument.defaultView.Zotero_Tabs?._getTab?.(tabID)?.tab;
  return nativeTab?.data?.itemID ? Zotero.Items.get(nativeTab.data.itemID) : null;
}
function firstPDF(item) {
  for (const id of item?.getAttachments?.() || []) {
    const attachment = Zotero.Items.get(id);
    if (attachment?.isPDFAttachment?.()) return attachment;
  }
  return null;
}
function pdfTarget(item) {
  if (!item) return null;
  if (item.isPDFAttachment?.()) return item;
  if (item.isAnnotation?.()) {
    const parent = item.parentItem;
    return parent?.isPDFAttachment?.() ? parent : null;
  }
  let parent = item;
  if (item.isAttachment?.()) parent = item.parentItem;
  return parent?.isRegularItem?.() ? firstPDF(parent) : null;
}
// The pane follows the PDF the user is looking at: the attachment open in the
// reader, otherwise the selected attachment, otherwise the PDF of the selected
// item. Selecting the parent journal article therefore works too.
function attachment({body, item}) {
  for (const candidate of [tabItem(body), item]) {
    const pdf = pdfTarget(candidate);
    if (pdf) return pdf;
  }
  return null;
}
function supports(args) {
  const item = args.item;
  return !!attachment(args) || !!item?.isRegularItem?.() || !!item?.isAttachment?.();
}
// Writes are serialized by attachment in OpticalStore. A stale load or write
// completion must not replace a newer image in another open pane.
function attachReference(host, state, pdf, getReader) {
  const live = () => states.get(state.body) === state;
  let cancelCapture = null;
  let generation = 0;
  const showError = error => {
    Zotero.logError(error);
    if (live()) panel.setStatus('参考图操作失败：' + (error.message || error));
  };
  const update = async value => {
    const siblings = [...states.values()].filter(other => other.id === pdf.id);
    for (const other of siblings) other.referenceRevision++;
    const write = OpticalStore.saveReference(pdf, value);
    pending.add(write);
    try {
      await write;
      // All panes, including those mounted during the write, read the latest
      // committed value. An older pending load is ignored by refresh().
      for (const other of states.values()) {
        if (other.id === pdf.id) other.refreshReference?.();
      }
    } catch (error) { showError(error); }
    finally { pending.delete(write); }
  };
  const stop = () => {
    generation++;
    const cancel = cancelCapture;
    cancelCapture = null;
    cancel?.();
    panel.setCapturing(false);
  };
  async function start() {
    stop();
    const token = generation;
    panel.setStatus('');
    panel.setCapturing(true);
    try {
      const reader = getReader() || await Zotero.Reader.open(pdf.id);
      if (reader?._initPromise) await reader._initPromise;
      if (!live() || generation !== token) return;
      if (!reader || reader.itemID !== pdf.id) throw Error('请先在 Zotero 中打开此 PDF。');
      cancelCapture = OpticalReferenceCapture.begin(reader, {
        onCapture(ref) {
          if (!live() || token !== generation) return;
          cancelCapture = null;
          panel.setCapturing(false);
          update(ref);
        },
        onCancel() {
          if (token !== generation) return;
          cancelCapture = null;
          panel.setCapturing(false);
        },
        onError(error) {
          if (token !== generation) return;
          cancelCapture = null;
          panel.setCapturing(false);
          showError(error);
        }
      });
    } catch (error) {
      if (token === generation && live()) {
        panel.setCapturing(false);
        showError(error);
      }
    }
  }
  const panel = OpticalReferencePanel.mount(host, {
    onCapture: start,
    onClear: () => { stop(); return update(null); },
    onCancel: stop
  });
  state.refreshReference = async () => {
    const revision = ++state.referenceRevision;
    try {
      const ref = await OpticalStore.loadReference(pdf);
      if (live() && state.referenceRevision === revision) {
        panel.setReference(ref);
        panel.setStatus('');
      }
    } catch (error) { if (live() && state.referenceRevision === revision) showError(error); }
  };
  state.disposeReference = () => { stop(); panel.destroy(); };
  state.refreshReference();
}

function detach(body) {
  const state = states.get(body);
  states.delete(body);
  state?.disposeReference?.();
  state?.editor?.destroy();
  body.replaceChildren();
}
async function render(args) {
  const {body, doc} = args;
  const pdf = attachment(args);
  if (!pdf) {
    if (body.querySelector('.optical-hint')) return;
    detach(body);
    const hint = doc.createElementNS(HTML, 'p');
    hint.className = 'optical-hint';
    hint.textContent = '该条目暂无 PDF 附件。给条目添加 PDF 附件后，草图会按附件单独保存。';
    body.append(hint);
    return;
  }
  if (states.get(body)?.id === pdf.id) return;
  detach(body);
  const state = {body, id: pdf.id, revision: 0, referenceRevision: 0};
  states.set(body, state);
  const node = (tag, text) => {
    const element = doc.createElementNS(HTML, tag);
    if (text) element.textContent = text;
    return element;
  };
  const style = node('style',styleText);
  const reference = node('div');
  const canvas = node('div');
  const status = node('small','正在打开草图…');
  const exportButton = node('button','导出 JSON');
  exportButton.disabled = true;
  body.append(style,reference,canvas,exportButton,status);
  const getReader = () => {
    const tabID = body.closest('item-details')?.tabID;
    const reader = tabID && Zotero.Reader.getByTabID(tabID);
    return reader?.itemID === pdf.id ? reader : null;
  };
  attachReference(reference, state, pdf, getReader);
  const openPage = pageIndex => {
    const reader = getReader();
    return reader ? reader.navigate({pageIndex}) : Zotero.Reader.open(pdf.id, {pageIndex});
  };
  const report = error => { status.textContent = '操作失败：' + error.message; Zotero.logError(error); };
  try {
    const data = await OpticalStore.load(pdf);
    if (states.get(body) !== state) return;
    state.editor = OpticalCanvas.mount(canvas, state.latest || data, updated => {
      // The library pane and the reader can show the same PDF. Apply edits
      // immediately, even if the other pane is still loading its disk copy.
      for (const sibling of states.values()) {
        if (sibling === state || sibling.id !== pdf.id) continue;
        if (sibling.editor) sibling.editor.replaceData(updated);
        else sibling.latest = updated;
      }
      const revision = ++state.revision;
      status.textContent = '正在保存…';
      const write = OpticalStore.save(pdf,updated).then(() => {
        if (state.revision === revision) status.textContent = '已保存在本机';
      }, error => { if (state.revision === revision) report(error); });
      pending.add(write);
      write.finally(() => pending.delete(write));
    }, {
      renderSource: (panel, item, mutate) =>
        OpticalSource.controls(panel, item, mutate, getReader, openPage, report)
    });
    delete state.latest;
    status.textContent = '修改后自动保存在本机 · ' + (pdf.attachmentFilename || 'PDF');
    exportButton.disabled = false;
    exportButton.onclick = async () => {
      try { await OpticalStore.exportFile(pdf,state.editor.getData(),doc.defaultView); } catch(e) { report(e); }
    };
  } catch(e) { report(e); }
}
function onMainWindowLoad({window: win}) { win.MozXULElement.insertFTLIfNeeded('optical-sketch.ftl'); }
async function startup({id, rootURI}) {
  await Zotero.initializationPromise;
  for (const path of ['catalog.js','storage.js','source.js','editor.js','reference-capture.js','reference-panel.js']) Services.scriptloader.loadSubScript(rootURI + path, window, 'UTF-8');
  styleText = (await Promise.all(['editor.css','reference-panel.css'].map(name => Zotero.File.getResourceAsync(rootURI + name)))).join('\n');
  for (const win of Zotero.getMainWindows()) onMainWindowLoad({window:win});
  const icon = rootURI+'icon.svg';
  paneID = Zotero.ItemPaneManager.registerSection({paneID:'optical-sketch',pluginID:id,
    header:{l10nID:'optical-sketch-heading',icon}, sidenav:{l10nID:'optical-sketch-navigation',icon},
    onItemChange(args) { args.setEnabled(supports(args)); },
    onRender(args) { render(args).catch(e => Zotero.logError(e)); },
    onDestroy({body}) { detach(body); }
  });
}
async function shutdown() {
  if(paneID) Zotero.ItemPaneManager.unregisterSection(paneID);
  for(const body of states.keys()) detach(body);
  await Promise.allSettled([...pending]);
}
