"""Browser integration checks. Run with Python + Playwright (see README)."""
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from followup_checks import check_followups
from texture_checks import check_texture_updates
from studio_checks import check_studio_updates
from editor_checks import check_editor_updates
from layer_brush_checks import check_layer_brush_updates
from tileset_checks import check_tileset_updates
from group_checks import check_groups_and_light_layers
from reliability_checks import check_export_and_bakes, check_durable_autosave

ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def run():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.wait_for_function('!!window.hudInstance')
        page.evaluate('window.cm = window.hudInstance.canvasManager')
        # Geometry: hidden internal grid seams, rotated rectangle hit testing, ray intersections.
        geometry = page.evaluate('''async () => {
          const g=await import('./js/geometry.js');
          const cells=new Map([['0_0',{x:0,y:0}],['1_0',{x:1,y:0}]]);
          const obj={x:100,y:100,width:100,height:20,rotation:Math.PI/2};
          return {edges:g.gridEdges(cells,32).length,inside:g.contains(obj,{x:100,y:140}),outside:g.contains(obj,{x:140,y:100}),
            hit:g.rayHit({x:0,y:0},0,[{a:{x:10,y:-5},b:{x:10,y:5}}],100).distance};
        }''')
        assert geometry == {'edges':6,'inside':True,'outside':False,'hit':10}, geometry
        # Upload/place/select/drag handles using real browser input.
        page.locator('[data-instrument=addObject]').click()
        page.locator('#instrumentSettings input[type=file]').set_input_files({
            'name':'object.svg','mimeType':'image/svg+xml',
            'buffer':b'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" rx="8" fill="#679bc6"/></svg>'})
        page.wait_for_function('!!cm.customObjectImage')
        page.mouse.move(320,320);page.mouse.down();page.mouse.move(350,320);page.mouse.up()
        assert page.evaluate('cm.customObjects.size') == 1, 'Placement must not stamp multiple objects during drag'
        page.locator('[data-instrument=select]').click();page.mouse.click(320,320)
        assert page.evaluate('cm.selectedObjects.custom.length') == 1
        handle=page.evaluate('cm.handlePoints([...cm.customObjects.values()][0])[4]')
        page.mouse.move(handle['x'],handle['y']);page.mouse.down();page.mouse.move(handle['x']+40,handle['y']+20,steps=5);page.mouse.up()
        assert page.evaluate('[...cm.customObjects.values()][0].width') == 136
        # Rotation handle and side-length editing.
        handle=page.evaluate('cm.handlePoints([...cm.customObjects.values()][0])[8]')
        obj=page.evaluate('({...cm.customObjects.values().next().value,image:null})')
        page.mouse.move(handle['x'],handle['y']);page.mouse.down();page.mouse.move(obj['x']+100,obj['y'],steps=5);page.mouse.up()
        assert abs(page.evaluate('[...cm.customObjects.values()][0].rotation')-1.5707963268)<0.001
        side=page.evaluate('cm.handlePoints([...cm.customObjects.values()][0])[1]')
        page.once('dialog',lambda dialog:dialog.accept('5'))
        page.mouse.dblclick(side['x'],side['y'])
        assert page.evaluate('[...cm.customObjects.values()][0].width') == 160
        page.keyboard.press('Control+z')
        assert page.evaluate('[...cm.customObjects.values()][0].width') == 136
        # Layer ownership: hidden and foreign objects cannot be selected/erased; paste adopts active layer.
        page.evaluate('''() => {
          cm.addLayer();cm.setActiveInstrument('erase');cm.handleDrawing({x:340,y:330},{type:'mousedown'});
          if(cm.customObjects.size!==1)throw Error('Eraser crossed layers');
          if(cm.getObjectAtWorldPos({x:340,y:330}))throw Error('Selection crossed layers');
          cm.setActiveLayer(0);cm.selectedObjects.custom=[...cm.customObjects.keys()];cm.copySelection();
          cm.setActiveLayer(1);cm.mouseX=600;cm.mouseY=400;cm.pasteSelection();
          if([...cm.customObjects.values()].at(-1).layerIndex!==1)throw Error('Paste wrong layer');
          cm.layers[1].visible=false;
          if(cm.getObjectAtWorldPos({x:600,y:400}))throw Error('Hidden layer selectable');
          cm.layers[1].visible=true;
        }''')
        # Transfer and reorder through the inspector; adding a layer clears stale selections.
        page.evaluate("cm.setActiveLayer(1);cm.setActiveInstrument('select');cm.selectedObjects.custom=[[...cm.customObjects.keys()].at(-1)];window.hudInstance.refresh()")
        page.get_by_label('Move to layer').select_option('0')
        assert page.evaluate('[...cm.customObjects.values()].every(o=>o.layerIndex===0)')
        page.locator('[data-instrument=layers]').click()
        page.locator('#layerUp').click()
        assert page.evaluate('[...cm.customObjects.values()].every(o=>o.layerIndex===1)')
        page.evaluate("cm.selectedObjects.custom=[...cm.customObjects.keys()];cm.addLayer();if(cm.selectedObjects.custom.length)throw Error('New layer retained foreign selection');cm.setActiveLayer(1);cm.removeActiveLayer();if(cm.customObjects.size)throw Error('Layer deletion retained objects');cm.undo();")
        # Real light placement, movement, settings, and deletion.
        page.evaluate('cm.clearCanvas();cm.setActiveLayer(0);window.hudInstance.refresh()')
        page.locator('[data-instrument=light]').click();page.mouse.click(400,350)
        assert page.evaluate('cm.customObjects.size')==1
        page.locator('[data-instrument=select]').click()
        page.mouse.move(400,350);page.mouse.down();page.mouse.move(460,390,steps=4);page.mouse.up()
        assert page.evaluate('[...cm.customObjects.values()][0].x')==460
        page.get_by_label('Rebounds').fill('2');page.get_by_label('Rebounds').press('Tab')
        assert page.evaluate('[...cm.customObjects.values()][0].bounces')==2
        page.mouse.click(460,390);page.keyboard.press('Delete')
        assert page.evaluate('cm.customObjects.size')==0
        # Draw order and hidden layers: pixel-based comparison in shared renderer.
        page.evaluate('''async () => {
          const {drawScene}=await import('./js/scene.js');
          cm.clearCanvas();cm.layers=[{name:'Bottom',visible:true,objects:new Map(),gridShadowOptions:{enabled:false}},{name:'Top',visible:true,objects:new Map([['4_4',{x:4,y:4,type:'color',fillColor:'#ff0000',borderColor:'#ff0000'}]]),gridShadowOptions:{enabled:false}}];
          cm.freeDrawObjects.set('free',{x:144,y:144,size:28,fillColor:'#00ff00',strokeColor:'#00ff00',layerIndex:0});
          const c=document.createElement('canvas');c.width=800;c.height=600;const ctx=c.getContext('2d');
          drawScene(cm,ctx,{minX:0,minY:0,maxX:800,maxY:600});
          if(ctx.getImageData(144,144,1,1).data[0]!==255)throw Error('Lower object painted over upper layer');
          cm.layers[1].visible=false;drawScene(cm,ctx,{minX:0,minY:0,maxX:800,maxY:600});
          if(ctx.getImageData(144,144,1,1).data[1]!==255)throw Error('Hidden upper layer still rendered');
        }''')
        # Actual occlusion: a wall must leave the point behind it darker than the symmetric unblocked point.
        lighting=page.evaluate('''async () => {
          const {drawScene}=await import('./js/scene.js');cm.clearCanvas();cm.layers=[{name:'Walls',visible:true,objects:new Map(),gridShadowOptions:{enabled:false}}];cm.activeLayerIndex=0;
          for(let y=0;y<20;y++)cm.layers[0].objects.set(`10_${y}`,{x:10,y,type:'color',fillColor:'#aaaabb',borderColor:'#aaaabb'});
          cm.customObjects.set('light',{type:'light',x:256,y:320,width:20,height:20,rotation:0,layerIndex:0,color:'#ffcc88',radius:8,intensity:1,bounces:0});
          const c=document.createElement('canvas');c.width=700;c.height=650;const ctx=c.getContext('2d');
          const bounds={minX:0,minY:0,maxX:700,maxY:650};drawScene(cm,ctx,bounds);
          const front=ctx.getImageData(160,330,1,1).data[0],back=ctx.getImageData(370,330,1,1).data[0];
          const before=ctx.getImageData(0,0,700,650).data;
          cm.customObjects.get('light').bounces=3;ctx.clearRect(0,0,700,650);drawScene(cm,ctx,bounds);
          const after=ctx.getImageData(0,0,700,650).data;let differences=0;for(let i=0;i<after.length;i+=4)if(after[i]!==before[i])differences++;
          return {front,back,differences};
        }''')
        assert lighting['front'] > lighting['back']+40, lighting
        assert lighting['differences'] > 100, lighting
        # Equivalent lights on an empty upper layer must not stack extra darkness.
        page.evaluate("""async () => {
          const {drawScene}=await import('./js/scene.js');
          const c=document.createElement('canvas');c.width=700;c.height=650;const ctx=c.getContext('2d'),bounds={minX:0,minY:0,maxX:700,maxY:650};
          const light={...cm.customObjects.get('light'),x:200,y:200,bounces:0};
          cm.customObjects.set('upper',{...light,layerIndex:0});drawScene(cm,ctx,bounds);const single=c.toDataURL();
          cm.addLayer();cm.customObjects.get('upper').layerIndex=1;ctx.clearRect(0,0,700,650);drawScene(cm,ctx,bounds);
          if(c.toDataURL()!==single)throw Error('Layer lights multiplied darkness');
          cm.removeActiveLayer();
        }""")
        # Borders: stable variations, all procedural styles, and no painting inside filled cells.
        borders=page.evaluate('''async () => {
          const {drawBorders}=await import('./js/scene.js');const cells=new Map([['5_5',{x:5,y:5}],['6_5',{x:6,y:5}]]);
          const c=document.createElement('canvas');c.width=400;c.height=400;const ctx=c.getContext('2d'),bounds={minX:0,minY:0,maxX:400,maxY:400};
          const counts=[];
          for(const style of ['hatch','dots','rocks']){
            cm.gridBorderOptions={enabled:true,style,width:.4,density:100,color:'#000000',seed:7};ctx.clearRect(0,0,400,400);drawBorders(cm,ctx,cells,32,bounds);
            const first=c.toDataURL();drawBorders(cm,ctx,new Map(),32,bounds);if(c.toDataURL()!==first)throw Error('Empty cells changed border');
            const pixels=ctx.getImageData(0,0,400,400).data;let n=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])n++;
            if(ctx.getImageData(165,165,1,1).data[3])throw Error('Border overlaps filled cell');
            ctx.clearRect(0,0,400,400);drawBorders(cm,ctx,cells,32,bounds);if(c.toDataURL()!==first)throw Error('Pattern not deterministic');counts.push(n);
          }return counts;
        }''')
        assert all(n>50 for n in borders), borders
        # JSON/load/undo preserve lights and procedural settings. Legacy objects migrate to Layer 1.
        page.evaluate('''() => {
          const original=cm.getMapData();cm.loadStateData(JSON.parse(JSON.stringify(original)));
          if(cm.customObjects.get('light').bounces!==3 || cm.gridBorderOptions.style!=='rocks')throw Error('Roundtrip lost settings');
          cm.saveHistory();cm.customObjects.get('light').intensity=.3;cm.saveHistory();cm.undo();
          if(cm.customObjects.get('light').intensity!==1)throw Error('Undo lost light settings');
          cm.redo();if(cm.customObjects.get('light').intensity!==.3)throw Error('Redo lost light settings');
          const legacy=cm.getMapData();delete legacy.customObjects[0][1].layerIndex;cm.loadStateData(legacy);
          if(cm.customObjects.get('light').layerIndex!==0)throw Error('Legacy migration failed');
        }''')
        # Shared export matches world rendering, independent of zoom, at identical pixel scale.
        page.evaluate('''async () => {
          const {drawScene}=await import('./js/scene.js');
          cm.layers[0].gridShadowOptions={enabled:true,offset:.5,angle:45,color:'#00000080'};
          cm.scale=2.4;const bounds=cm.getLogicalBoundingBox(),size=32;
          const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=Math.ceil(bounds.width*size);a.height=b.height=Math.ceil(bounds.height*size);
          const ac=a.getContext('2d'),bc=b.getContext('2d');ac.scale(size,size);ac.translate(-bounds.minX,-bounds.minY);cm.drawAll(ac,size);
          bc.translate(-bounds.minX*size,-bounds.minY*size);drawScene(cm,bc,{minX:bounds.minX*size,minY:bounds.minY*size,maxX:bounds.maxX*size,maxY:bounds.maxY*size});
          if(a.toDataURL()!==b.toDataURL())throw Error('Export differs from world render');
        }''')
        page.evaluate('window.hudInstance.refresh()')
        # PNG, JSON, and PDF downloads. PDF needs the existing jsPDF CDN.
        page.evaluate('window.hudInstance.showPanel("mapPanel")')
        with page.expect_download() as download:
            page.locator('#exportPNG').click()
        assert download.value.suggested_filename.endswith('.png')
        page.evaluate('window.hudInstance.showPanel("mapPanel")')
        with page.expect_download() as download:
            page.locator('#exportMap').click()
        assert download.value.suggested_filename.endswith('.json')
        pdf_available=page.evaluate('!!window.jspdf')
        if pdf_available:
            page.locator('#exportPDF').click()
            page.locator('#pdfDpi').fill('72');page.locator('#pdfCellSize').fill('1')
            with page.expect_download() as download:
                page.locator('#pdfForm button[type=submit]').click()
            assert download.value.suggested_filename.endswith('.pdf')
        followup=check_followups(page)
        texture=check_texture_updates(page)
        studio=check_studio_updates(page)
        editor=check_editor_updates(page)
        layer_brush=check_layer_brush_updates(page)
        tileset=check_tileset_updates(page)
        groups=check_groups_and_light_layers(page)
        reliability=check_export_and_bakes(page)
        autosave=check_durable_autosave(page)
        # Theme persistence, responsive panels, reload of saved state.
        page.locator('#themeToggle').click()
        theme=page.evaluate('document.documentElement.dataset.theme')
        page.evaluate('window.hudInstance.storageManager.autoSaveMap()')
        page.reload();page.wait_for_function('!!window.hudInstance')
        assert page.evaluate('document.documentElement.dataset.theme')==theme
        assert page.evaluate('window.hudInstance.canvasManager.customObjects.get("light").type')=='light'
        page.set_viewport_size({'width':760,'height':700})
        assert page.locator('#hud').bounding_box()['x'] > 0
        assert not errors, errors
        browser.close()
    server.shutdown()
    print(json.dumps({'status':'PASS','followup':followup,'texture':texture,'studio':studio,'editor':editor,'layer_brush':layer_brush,'tileset':tileset,'groups':groups,'reliability':reliability,'autosave':autosave,'geometry':geometry,'lighting':lighting,'border_pixels':borders,'pdf_download_checked':pdf_available}))

if __name__=='__main__':
    run()
