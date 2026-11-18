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
function detach(body) {
  const state = states.get(body);
  states.delete(body);
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
  const state = {id: pdf.id, revision: 0};
  states.set(body, state);
  const node = (tag, text) => {
    const element = doc.createElementNS(HTML, tag);
    if (text) element.textContent = text;
    return element;
  };
  const style = node('style',styleText);
  const canvas = node('div');
  const status = node('small','正在打开草图…');
  const exportButton = node('button','导出 JSON');
  exportButton.disabled = true;
  body.append(style,canvas,exportButton,status);
  const report = error => { status.textContent = '操作失败：' + error.message; Zotero.logError(error); };
  try {
    const data = await OpticalStore.load(pdf);
    if (states.get(body) !== state) return;
    state.editor = OpticalCanvas.mount(canvas, data, updated => {
      const revision = ++state.revision;
      status.textContent = '正在保存…';
      const write = OpticalStore.save(pdf,updated).then(() => {
        if (state.revision === revision) status.textContent = '已保存在本机';
      }, error => { if (state.revision === revision) report(error); });
      pending.add(write);
      write.finally(() => pending.delete(write));
    });
    status.textContent = '修改后自动保存在本机 · ' + (pdf.attachmentFilename || 'PDF');
    exportButton.disabled = false;
    exportButton.onclick = async () => {
      try { await OpticalStore.exportFile(pdf,state.editor.getData(),doc.defaultView); } catch(e) { report(e); }
    };
  } catch(e) { report(e); states.delete(body); }
}
function onMainWindowLoad({window: win}) { win.MozXULElement.insertFTLIfNeeded('optical-sketch.ftl'); }
async function startup({id, rootURI}) {
  await Zotero.initializationPromise;
  for (const path of ['storage.js','editor.js']) Services.scriptloader.loadSubScript(rootURI + path, window, 'UTF-8');
  styleText = await Zotero.File.getResourceAsync(rootURI+'editor.css');
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
