(() => {
  "use strict";

  const ongoing = new Map();
  const kinds = new Set(["laser", "mirror", "lens", "hwp", "qwp", "pbs", "bs", "aom",
    "shutter", "fiber", "iris", "photodiode", "dump"]);
  const elementFields = ["id", "kind", "x", "y", "angle", "label", "notes", "part",
    "part_number", "auto_angle"];
  const linkFields = ["id", "source", "target", "color", "wavelength_nm", "label"];

  function draftPath(item) {
    if (!Number.isSafeInteger(item.libraryID) || !/^[A-Z0-9]{8}$/.test(item.key)) {
      throw new Error("无法识别 PDF 附件。");
    }
    return PathUtils.join(Zotero.DataDirectory.dir, "optical-sketch",
      item.libraryID + "-" + item.key + ".json");
  }

  function checkStructure(drawing) {
    if (!Array.isArray(drawing?.elements) || !Array.isArray(drawing?.links)) {
      throw new Error("光路图数据格式有误。");
    }
    const ids = new Set();
    for (const element of drawing.elements) {
      if (!element.id || ids.has(element.id) || !kinds.has(element.kind)
          || !Number.isFinite(element.x) || !Number.isFinite(element.y)) {
        throw new Error("光路元件的类型、编号或位置有误。");
      }
      ids.add(element.id);
    }
    const linkIDs = new Set();
    for (const link of drawing.links) {
      if (!link.id || linkIDs.has(link.id) || !ids.has(link.source) || !ids.has(link.target)) {
        throw new Error("光束编号重复或连接的元件缺失。");
      }
      linkIDs.add(link.id);
    }
  }

  async function load(item) {
    const path = draftPath(item);
    await ongoing.get(path);
    if (!await IOUtils.exists(path)) return { elements: [], links: [] };
    const draft = JSON.parse(await IOUtils.readUTF8(path));
    if (draft.version !== 1) throw new Error("草图版本不兼容。");
    checkStructure(draft.schematic);
    return draft.schematic;
  }

  async function save(item, schematic) {
    const path = draftPath(item);
    checkStructure(schematic);
    // Capture this edit before waiting for older writes to finish.
    const text = JSON.stringify({ version: 1, schematic });
    const previous = ongoing.get(path) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true });
      await IOUtils.writeUTF8(path, text, { tmpPath: path + "." + Services.uuid.generateUUID().toString() + ".tmp" });
    });
    ongoing.set(path, write);
    try {
      await write;
    } finally {
      if (ongoing.get(path) === write) ongoing.delete(path);
    }
  }

  function selectFields(record, names) {
    return Object.fromEntries(names.filter(name => record[name] !== undefined)
      .map(name => [name, record[name]]));
  }

  async function exportFile(item, schematic, win) {
    checkStructure(schematic);
    const layout = {
      format: "optolayout", version: 1, table: {},
      components: [], beams: [], measurement_points: [],
      schematic: {
        elements: schematic.elements.map(el => selectFields(el, elementFields)),
        links: schematic.links.map(link => selectFields(link, linkFields))
      }
    };
    const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
    const picker = new FilePicker();
    picker.init(win || window, "导出 Optical Layout Designer 原理图", picker.modeSave);
    picker.defaultString = "optical-layout-" + item.key + ".json";
    picker.defaultExtension = "json";
    picker.appendFilter("Optical Layout Designer (*.json)", "*.json");
    const result = await picker.show();
    if (result !== picker.returnOK && result !== picker.returnReplace) return false;
    const path = picker.file;
    const tempPath = path + "." + Services.uuid.generateUUID().toString() + ".tmp";
    await IOUtils.writeUTF8(path, JSON.stringify(layout, null, 2) + "\n", { tmpPath: tempPath });
    return true;
  }

  window.OpticalStore = { load, save, exportFile };
})();
