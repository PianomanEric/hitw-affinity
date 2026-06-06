const { Document, FileExportArea, FileExportOptions } = require("/document");
const { Dialog, DialogResult } = require('/dialog');
const { DocumentCommand } = require("/commands");
const { Selection } = require("/selections");
const { NodeMoveType } = require("affinity:dom");

const SVG_EXPORT = "SVG (for export)";
const PNG_EXPORT = "PNG";

function inspectObject(obj) {
    const objectName = obj.constructor.name;
  
    let str = "";

    let current = obj;
    let level = 0;

    while (current) {
        str += "\nLEVEL " + level;

        try {
            str += " : " + current.constructor.name;
        } catch (e) {}

        str += "\n";

        let keys = Reflect.ownKeys(current);

        for (let i = 0; i < keys.length; i++) {
            str += "  " + String(keys[i]) + "\n";
        }

        current = Object.getPrototypeOf(current);
        level++;
        
        alert(str, objectName);
        str = "";
    }

    return str;
}

function trim(text) {
  return String(text == null ? "" : text).replace(/^\s+|\s+$/g, "");
}

function getDescendants(node, descendants = []) {
  for (const child of node.children) {
    descendants.push(child);
    getDescendants(child, descendants);
  }
  return descendants;
}

function getCutouts(node) {
  const descendants = getDescendants(node);
  const shapes = [];
  const holes = [];
  for (const descendant of descendants) {
    if (descendant.polyCurve) {
      if (descendant.description === "SHAPE") {
        descendant.lineWeightPts = 0;
        shapes.push(descendant);
      } else if (descendant.description === "HOLE") {
        descendant.lineWeightPts = 0;
        holes.push(descendant);
      }
    }
  }
  return {shapes, holes}
}

function exportableNodesExist(node) {
  const descendants = getDescendants(node);
  for (node of descendants) {
    if ((node.polyCurve || node.isImageNode || node.isRasterNode) && node.isVisibleInDomain && node.description !== "SHAPE" && node.description !== "HOLE") {
      return true;
    }
  }
  return false;
}

function selectNodes(nodes) {
  const selection = Selection.createEmpty(Document.current);
  for (const node of nodes) {
    selection.addNode(node);
  }
  return selection;
}

function exportSVG(doc, artboard, shapes, holes, path, fileNames) {
  const originalSelection = doc.selection;
  const visibleSelection = selectNodes([...doc.currentSpread.children].filter((node) => node.isVisibleInDomain));
  doc.executeCommand(DocumentCommand.createSetVisibility(visibleSelection, false));
  
  const shapeCopies = [];
  const holeCopies = [];
  for (const shape of shapes) {
    const copy = shape.duplicate();
    shapeCopies.push(copy);
  }
  for (const hole of holes) {
    const copy = hole.duplicate();
    holeCopies.push(copy);
  }
  
  const allCopiesSelection = selectNodes([...shapeCopies, ...holeCopies]);
  doc.selection = allCopiesSelection;
  doc.executeCommand(DocumentCommand.createMoveNodes(allCopiesSelection, artboard.node, NodeMoveType.Main));
  doc.executeCommand(DocumentCommand.createSetVisibility(allCopiesSelection, true));
  
  const svgExportOptions = FileExportOptions.createWithPresetName(SVG_EXPORT);
  const svgExportArea = FileExportArea.createForArtboard(artboard);
  
  if (shapeCopies.length > 0) {
    const holeCopiesSelection = selectNodes(holeCopies);
    doc.executeCommand(DocumentCommand.createSetVisibility(holeCopiesSelection, false));
    const fileName = `${doc.title}_${artboard.description}_Shape.svg`
    doc.export(`${path}${fileName}`, svgExportOptions, svgExportArea);
    fileNames.push(fileName);
    doc.executeCommand(DocumentCommand.createSetVisibility(holeCopiesSelection, true));
  }
  
  if (holeCopies.length > 0) {
    const shapeCopiesSelection = selectNodes(shapeCopies);
    doc.executeCommand(DocumentCommand.createSetVisibility(shapeCopiesSelection, false));
    const fileName = `${doc.title}_${artboard.description}_Holes.svg`
    doc.export(`${path}${fileName}`, svgExportOptions, svgExportArea);
    fileNames.push(fileName);
    doc.executeCommand(DocumentCommand.createSetVisibility(shapeCopiesSelection, true));
  }
  
  doc.selection = allCopiesSelection;
  doc.executeCommand(DocumentCommand.createDeleteSelection(allCopiesSelection, true));
  doc.selection = visibleSelection;
  doc.executeCommand(DocumentCommand.createSetVisibility(visibleSelection, true));
  doc.selection = originalSelection;
  //alert(`${path}${artboard.description}.svg`, "Path");
}

function exportPNG(doc, artboard, shapes, holes, path, fileNames) {
  if (exportableNodesExist(artboard.node)) {
    const originalSelection = doc.selection;
    const shapesSelection = selectNodes(shapes);
    const visibleSelection = selectNodes([...shapes, ...holes].filter((node) => node.isVisibleInDomain));
    doc.executeCommand(DocumentCommand.createSetVisibility(visibleSelection, false));
    const pngExportOptions = FileExportOptions.createWithPresetName(PNG_EXPORT);
    doc.selection = shapesSelection;
    const pngExportArea = (shapes.length > 0) ? FileExportArea.createForSelectionArea(shapesSelection) : FileExportArea.createForArtboard(artboard);
    const fileName = `${doc.title}_${artboard.description}_Decal.png`
    doc.export(`${path}${fileName}`, pngExportOptions, pngExportArea);
    fileNames.push(fileName);
    doc.executeCommand(DocumentCommand.createSetVisibility(visibleSelection, true));
    doc.selection = originalSelection;
  }
}

function exportAll() {
  const fileNames = [];
  const doc = Document?.current;
  const artboards = doc?.currentSpread?.artboards;
  if (!artboards || artboards.length == 0) {
    alert("No artboards found!", "Print");
    return;
  }
  const docPath = Document.current.path;
  const separator = docPath.includes('\\') ? "\\" : "/";
  const docFolder = docPath.substring(0, docPath.lastIndexOf(separator)) + separator + "source_assets" + separator;
  const originalSelection = doc.selection
  for (const artboard of artboards) {
    if (!artboard.description.startsWith('_')) {
      const {shapes, holes} = getCutouts(artboard.node);
      if (shapes.length > 1) {
        alert(`Artboard '${artboard.description}' can only have one SHAPE! Please make a new artboard for each new SHAPE.`, "Too many SHAPEs!");
      } else {
        exportPNG(doc, artboard, shapes, holes, docFolder, fileNames);
        exportSVG(doc, artboard, shapes, holes, docFolder, fileNames);
      }
    }
  }
  doc.selection = originalSelection;
  return fileNames;
}

function main() {
  const doc = Document.current;
  const exports = exportAll();
  alert(exports.join("\n"), "The following files have been exported:")
}

try {
  main();
} catch (error) {
  alert(`Script Error: ${error.message}\n\nStack Trace:\n${error.stack}`, "Error");
}