/* Original, schematic-only glyphs. Each path is centred on its optical anchor. */
globalThis.OpticalCatalog = Object.freeze({
  dichroic: ["二向色镜", "DM", "M-11 11L11 -11 M-7 11L-4 8 M-1 5L2 2 M5 -1L8 -4 M11 -7L13 -9"],
  grating: ["衍射光栅", "G", "M-12 7H12 M-12 6L-8 -4V6L-4 -4V6L0 -4V6L4 -4V6L8 -4V6L12 -4V7"],
  prism: ["棱镜", "PR", "M-13 9L-1 -12L13 9Z M-8 1L-2 -1L8 2"],
  objective: ["显微物镜", "OBJ", "M-13 -9H-3L8 -5H12V5H8L-3 9H-13Z M-9 -9V9 M-3 -8V8 M9 -4Q15 0 9 4"],
  polarizer: ["线偏振片", "POL", "M-7 -11H7V11H-7Z M-4 -8V8 M0 -8V8 M4 -8V8"],
  longpass: ["长通滤光片", "LP", "M-13 -9H13V9H-13Z M-10 6H-2L1 -5H10"],
  shortpass: ["短通滤光片", "SP", "M-13 -9H13V9H-13Z M-10 -5H-1L2 6H10"],
  bandpass: ["带通滤光片", "BP", "M-13 -9H13V9H-13Z M-10 6H-5L-2 -5H2L5 6H10"],
  notch: ["陷波滤光片", "NF", "M-13 -9H13V9H-13Z M-10 -5H-4L-1 6H1L4 -5H10"],
  nd_filter: ["中性密度滤光片", "ND", "M-13 -9H13V9H-13Z M-10 2H10 M-10 5H10"],
  eom: ["电光调制器", "EOM", "M-10 -6H10V6H-10Z M-6 -10H6 M0 -14V-10 M-6 10H6 M0 10V14 M-7 3L5 -3"],
  isolator: ["光隔离器", "ISO", "M-13 -9H13V9H-13Z M-9 0H5 M1 -4L5 0L1 4 M8 -5V5"],
  sample: ["样品池", "SC", "M-9 -11V9Q-9 11 -7 11H7Q9 11 9 9V-11 M-11 -11H11 M-7 0Q-4 -3 -1 0T7 0"],
  camera: ["相机 / CCD", "CAM", "M-12 -9H11V9H-12Z M-8 -6H6V6H-8Z M-3 -6V6 M2 -6V6 M-8 0H6"],
  spectrometer: ["光谱仪", "SPEC", "M-13 -10H13V10H-13Z M-10 6L-7 5L-5 -2L-3 5L0 4L3 -6L5 5L9 4"]
});
