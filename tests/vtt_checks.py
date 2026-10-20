"""VTT image encoders, UVTT geometry and lighting, bounds, budgets, and dialog."""
import base64
import json
import struct
from playwright.sync_api import expect


def check_vtt_exports(page):
    page.evaluate('''() => {
      window.vttOriginal=cm.getMapData();
      window.vttHistory={entries:[...cm.history],index:cm.historyIndex};
      cm.clearCanvas();cm.activeLayerIndex=0;
      cm.layers=[{name:'Visible',visible:true,objects:new Map(),gridShadowOptions:{enabled:false},gridBorderOptions:{enabled:false}},
        {name:'Hidden',visible:false,objects:new Map(),gridShadowOptions:{enabled:false},gridBorderOptions:{enabled:false}}];
      cm.exportSettings={colorMode:'color',padding:0,region:{minX:-.25,minY:-.5,maxX:7.25,maxY:5.25}};
      cm.emptyCellSettings={fillColor:'#abcdef',borderColor:'#000000',pattern:null};
      const cell={type:'color',fillColor:'#ffffff',borderColor:'#000000',blocksLight:true,castsShadow:true};
      for(const x of [0,1])cm.layers[0].objects.set(`${x}_0`,{...cell,x,y:0});
      cm.layers[0].objects.set('2_0',{...cell,x:2,y:0,blocksLight:false});
      cm.layers[1].objects.set('10_10',{...cell,x:10,y:10});
      cm.customObjects.set('triangle',{type:'polygon',layerIndex:0,x:4*32,y:2*32,width:64,height:64,rotation:.3,mirrorX:true,
        vertices:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:0,y:.5}],fillColor:'#ff0000',borderColor:'#440000',opacity:.7,blocksLight:true});
      cm.customObjects.set('light',{type:'light',layerIndex:0,x:3*32,y:4*32,radius:6,intensity:1,color:'#ff8800',bounces:0});
      cm.customObjects.set('outside',{type:'light',layerIndex:0,x:20*32,y:20*32,radius:6,intensity:1,color:'#ffffff',bounces:0});
      cm.customObjects.set('hidden',{type:'light',layerIndex:1,x:32,y:32,radius:6,intensity:1,color:'#ffffff',bounces:0});
      cm.ambientLight={preserveGlobal:false,brightness:.1,color:'#000000'};
      cm.history=[];cm.historyIndex=-1;cm.saveHistory();window.hudInstance.refresh();
    }''')
    result = page.evaluate('''async () => {
      const {vttPlan,clipWall,uvttData,buildVTTExport,renderVTT}=await import('./js/vtt-export.js');
      const assert=(v,m)=>{if(!v)throw Error(m);};
      const storage=window.hudInstance.storageManager;
      const state=JSON.stringify(cm.getMapData());
      const p=vttPlan(cm,{maxFileMB:0});
      assert(p.width===630 && p.height===490 && p.bounds.minX===-1 && p.bounds.minY===-1,'Whole cell alignment incorrect');
      const exact=vttPlan(cm,{format:'png',alignGrid:false,maxFileMB:0});
      assert(exact.width===525 && exact.height===403 && exact.bounds.minX===-.25,'Exact image frame lost');
      const clipped=clipWall({x:-2,y:1},{x:5,y:1},{minX:0,minY:0,maxX:3,maxY:3});
      assert(clipped[0].x===0&&clipped[1].x===3,'Wall clipping wrong');
      assert(clipWall({x:4,y:0},{x:4,y:4},{minX:0,minY:0,maxX:3,maxY:3})===null,'Outside wall survived');
      const dynamic=await buildVTTExport(storage,{format:'uvtt',maxFileMB:0});
      const data=JSON.parse(await dynamic.blob.text());
      assert(data.format===1 && data.resolution.pixels_per_grid===70 && data.resolution.map_size.x===9,'UVTT resolution schema wrong');
      assert(data.line_of_sight.length===9,'Internal cell seam or missing triangle edges');
      assert(data.lights.length===1 && data.lights[0].position.x===4 && data.lights[0].position.y===5 && data.lights[0].range===6 && data.lights[0].color==='ffff8800','Hidden/outside lights or coordinate/color conversion wrong');
      assert(data.environment.baked_lighting===false && !data.image.startsWith('data:'),'UVTT image/environment wrong');
      const bitmap=await createImageBitmap(await (await fetch('data:image/png;base64,'+data.image)).blob());
      assert(bitmap.width===630&&bitmap.height===490,'Embedded image resolution differs');bitmap.close();
      const crop=vttPlan(cm,{maxFileMB:0});crop.bounds={minX:.5,minY:0,maxX:1.5,maxY:1,width:1,height:1};
      const cropped=uvttData(cm,crop,'');
      assert(cropped.line_of_sight.every(line=>line.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)),'Walls outside crop');
      const unlit=await renderVTT(storage,{maxFileMB:0});
      const gridded=await renderVTT(storage,{showGrid:true,maxFileMB:0});
      assert(unlit.canvas.toDataURL()!==gridded.canvas.toDataURL(),'Grid toggle ignored');
      const pixel=unlit.canvas.getContext('2d').getImageData(70,350,1,1).data;
      assert(pixel[0]===171&&pixel[1]===205&&pixel[2]===239,'Unlit export contains grid or baked darkness');
      const lit=await buildVTTExport(storage,{lighting:true,maxFileMB:0});
      assert(lit.data.environment.baked_lighting && lit.data.lights.length===0,'Dynamic lights duplicated baked image lighting');
      for(const format of ['png','jpg','webp']) {
        const output=await buildVTTExport(storage,{target:'dndbeyond',format,pixelsPerCell:100,lighting:true,maxFileMB:0});
        const decoded=await createImageBitmap(output.blob);
        assert(decoded.width===900&&decoded.height===700,'Image encoder changed resolution');decoded.close();
        assert(output.blob.type==={png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[format],'Incorrect image MIME type');
      }
      let refused=false;
      try {await buildVTTExport(storage,{maxFileMB:.000001});}catch(e){refused=e.message.includes('file budget');}
      assert(refused,'Oversized file downloaded');
      refused=false;try{vttPlan(cm,{pixelsPerCell:0});}catch(e){refused=true;}assert(refused,'Invalid resolution accepted');
      refused=false;try{vttPlan(cm,{target:'dndbeyond',format:'uvtt'});}catch(e){refused=true;}assert(refused,'DDB offered unsupported UVTT');
      assert(JSON.stringify(cm.getMapData())===state,'Export changed the editable map');
      return {uvttSchema:true,wallClipping:true,hiddenLayers:true,gridToggle:true,lightingModes:true,imageEncoders:3,fileBudget:true};
    }''')
    page.evaluate('window.hudInstance.setMapCollapsed(false)')
    page.locator('#exportVTT').click()
    expect(page.locator('#vttDialog')).to_be_visible()
    with page.expect_download() as download:
        page.locator('#vttDownload').click()
    exported=json.loads(download.value.path().read_text())
    png=base64.b64decode(exported['image'])
    assert png[:8]==b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II',png[16:24])==(630,490)
    assert download.value.suggested_filename.endswith('.uvtt')
    expect(page.locator('#vttStatus')).to_contain_text('Downloaded')
    page.locator('#vttTarget').select_option('dndbeyond')
    assert page.locator('#vttFormat').input_value()=='jpg'
    assert page.locator('#vttPixels').input_value()=='100'
    assert page.locator('#vttDynamicFields').is_hidden()
    with page.expect_download() as download:
        page.locator('#vttDownload').click()
    assert download.value.path().read_bytes()[:2]==b'\xff\xd8'
    assert '-9x7-100px.jpg' in download.value.suggested_filename
    expect(page.locator('#vttStatus')).to_contain_text('Downloaded')
    saved=page.evaluate('cm.getMapData().settings.exportSettings.vtt')
    assert saved['target']=='dndbeyond' and saved['format']=='jpg' and saved['pixelsPerCell']==100
    page.locator('#vttCancel').click()
    page.evaluate('''() => {
      cm.loadStateData(window.vttOriginal);cm.history=window.vttHistory.entries;
      cm.historyIndex=window.vttHistory.index;window.hudInstance.refresh();
      window.hudInstance.setMapCollapsed(true);
    }''')
    return result
