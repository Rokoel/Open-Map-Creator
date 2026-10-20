import { vttDefaults, vttPlan, buildVTTExport, downloadVTT } from "./vtt-export.js";

export function setupVTTExport(manager, storage) {
  const $ = id => document.getElementById(id), dialog = $("vttDialog");
  const fields = {
    target:"vttTarget", format:"vttFormat", pixelsPerCell:"vttPixels", quality:"vttQuality",
    maxFileMB:"vttBudget", alignGrid:"vttAlign", showGrid:"vttGrid", lighting:"vttLighting", walls:"vttWalls", lights:"vttLights",
  };
  const read = () => Object.fromEntries(Object.entries(fields).map(([key,id]) => {
    const input = $(id);
    return [key,input.type === "checkbox" ? input.checked : ["number","range"].includes(input.type) ? Number(input.value) : input.value];
  }));
  const fill = settings => {
    for (const [key,id] of Object.entries(fields)) {
      if ($(id).type === "checkbox") $(id).checked = settings[key]; else $(id).value = settings[key];
    }
  };
  const update = () => {
    const settings = read(), uvtt = settings.format === "uvtt";
    $("vttFormat").querySelector('[value="uvtt"]').disabled = settings.target === "dndbeyond";
    $("vttAlign").disabled = uvtt;
    if (uvtt) { settings.alignGrid = true; $("vttAlign").checked = true; }
    $("vttQuality").disabled = uvtt || settings.format === "png";
    $("vttDynamicFields").hidden = !uvtt;
    $("vttLights").disabled = settings.lighting;
    $("vttInstructions").textContent = settings.target === "dndbeyond"
      ? "Upload the image as a custom map in D&D Beyond Maps. Set its grid to the exported cell count shown above. JPG, PNG, and WebP are image-only exports; set up any VTT walls or lights there."
      : settings.target === "roll20" && uvtt
        ? "In Roll20, open Create Page → Upload Background and choose the .uvtt file. The image, grid scale, blocking walls, and lights are included. Using Dynamic Lighting requires a supporting Roll20 subscription."
        : uvtt
          ? "Import the .uvtt file using your VTT’s Universal VTT importer. Wall and light support varies by importer."
          : "Upload the image to your VTT’s map/background layer. Set the map and page to the cell dimensions above and use your VTT’s grid. The filename includes cell dimensions and resolution.";
    try {
      const plan = vttPlan(manager,settings), {width,height} = plan;
      const ppc = settings.pixelsPerCell;
      const cells = n => Number(n.toFixed(4));
      const offset = n => Number((((-n)%1+1)%1*ppc).toFixed(2));
      $("vttSummary").textContent = `${width} × ${height} px · ${cells(width/ppc)} × ${cells(height/ppc)} cells · ${ppc} px/cell. Grid offset: ${offset(plan.bounds.minX)} × ${offset(plan.bounds.minY)} px. ${settings.alignGrid ? "Frame expands outward to whole cells." : "Exact frame; use this offset when aligning your VTT grid."}`;
      $("vttDownload").disabled = false;
      return settings;
    } catch (error) {
      $("vttSummary").textContent = error.message;
      $("vttDownload").disabled = true;
      return null;
    }
  };
  $("exportVTT").onclick = () => {
    fill({...vttDefaults,...manager.exportSettings.vtt});
    $("vttStatus").textContent = ""; update(); dialog.showModal();
  };
  $("vttCancel").onclick = () => dialog.close();
  $("vttTarget").addEventListener("change", () => {
    const ddb = $("vttTarget").value === "dndbeyond";
    $("vttFormat").value = ddb ? "jpg" : "uvtt";
    $("vttPixels").value = ddb ? 100 : 70;
    $("vttLighting").checked = ddb;
  });
  $("vttFormat").addEventListener("change", () => {
    $("vttLighting").checked = $("vttFormat").value !== "uvtt";
  });
  $("vttForm").addEventListener("input", update);
  $("vttForm").addEventListener("change", () => {
    const settings = update();
    if (settings) { manager.exportSettings.vtt = settings; manager.saveHistory(); }
    $("vttStatus").textContent = "";
  });
  let busy = false;
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  $("vttForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !$("vttForm").reportValidity()) return;
    const settings = update();
    if (!settings) return;
    manager.exportSettings.vtt = settings; manager.saveHistory();
    busy = true; $("vttFields").disabled = true; $("vttDownload").disabled = true; $("vttCancel").disabled = true;
    $("vttStatus").textContent = "Rendering map…";
    try {
      const result = await buildVTTExport(storage,settings);
      downloadVTT(result);
      const dynamic = result.data ? ` · ${result.data.line_of_sight.length} wall segments · ${result.data.lights.length} lights` : "";
      $("vttStatus").textContent = `Downloaded ${result.filename} · ${(result.blob.size/1000000).toFixed(2)} MB${dynamic}`;
    } catch (error) { $("vttStatus").textContent = error.message; }
    finally {
      busy = false; $("vttFields").disabled = false; $("vttCancel").disabled = false; update();
    }
  });
}
