"""Polygon geometry/materials, export framing, and real mobile touch gestures."""
from playwright.sync_api import expect
def check_polygons_and_export_area(page):
    page.evaluate('''() => {
      window.polygonOriginal=cm.getMapData();
      window.polygonHistory={entries:[...cm.history],index:cm.historyIndex};
      cm.clearCanvas();cm.activeLayerIndex=0;cm.layers.forEach(l=>l.visible=true);
      cm.offsetX=cm.offsetY=0;cm.scale=1;cm.exportSettings={colorMode:'color',padding:1};
      cm.history=[];cm.historyIndex=-1;cm.saveHistory();
      window.hudInstance.chooseTool('polygon');
    }''')
    for x,y in [(460,260),(650,260),(650,430),(550,330),(460,430)]:
        page.mouse.click(x,y)
    assert page.evaluate('cm.polygonDraft.length') == 5
    page.locator('#finishPolygon').click()
    assert page.evaluate('cm.customObjects.size') == 1
    page.keyboard.press('Control+z')
    assert page.evaluate('cm.customObjects.size') == 0
    page.keyboard.press('Control+Shift+z')
    assert page.evaluate('cm.customObjects.size') == 1
    page.locator('[data-instrument=select]').click()
    page.mouse.click(500,300)
    page.locator('#instrumentSettings input[type=file]').set_input_files({
        'name':'polygon.svg','mimeType':'image/svg+xml',
        'buffer':b'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="8" height="16" fill="red"/><rect x="8" width="8" height="16" fill="blue"/></svg>'})
    page.wait_for_function('[...cm.customObjects.values()][0].image?.complete')
    page.get_by_label('Texture mode',exact=True).select_option('fit')
    page.get_by_label('Texture rotation (°)',exact=True).fill('37')
    page.get_by_label('Texture rotation (°)',exact=True).press('Tab')
    result = page.evaluate('''async () => {
      const assert=(v,m)=>{if(!v)throw Error(m);};
      const {contains}=await import('./js/geometry.js');
      const {polygonPoints}=await import('./js/polygons.js');
      const {lightingSignature,drawScene}=await import('./js/scene.js');
      const obj=[...cm.customObjects.values()][0];
      assert(contains(obj,{x:500,y:300}),'Polygon interior misses');
      assert(!contains(obj,{x:550,y:410}),'Concave cutout selects bounding box');
      assert(obj.textureMode==='fit' && obj.textureAngle===37,'Material controls failed');
      const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;
      const ctx=canvas.getContext('2d'),old=cm.ctx;cm.ctx=ctx;cm.drawCustomObject(obj);cm.ctx=old;
      assert(ctx.getImageData(500,300,1,1).data[3]>240,'Texture missing');
      assert(ctx.getImageData(550,410,1,1).data[3]===0,'Texture leaks outside polygon');
      const fit=canvas.toDataURL();
      obj.opacity=.4;ctx.clearRect(0,0,800,600);cm.ctx=ctx;cm.drawCustomObject(obj);cm.ctx=old;
      assert(Math.abs(ctx.getImageData(500,300,1,1).data[3]-102)<=1,'Opacity stacks fill and texture');obj.opacity=1;
      obj.textureMode='tile';obj.textureScale=2;
      ctx.clearRect(0,0,800,600);cm.ctx=ctx;cm.drawCustomObject(obj);cm.ctx=old;
      assert(canvas.toDataURL()!==fit,'Fit and tile look identical');
      obj.rotation=.7;obj.mirrorX=true;obj.width*=1.5;
      assert(polygonPoints(obj).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),'Transform corrupts vertices');
      const before=lightingSignature(cm);obj.x+=40;
      assert(lightingSignature(cm)!==before,'Moved polygon leaves stale bake');
      const draw=()=>{ctx.clearRect(0,0,800,600);drawScene(cm,ctx,{minX:0,minY:0,maxX:800,maxY:600});return ctx.getImageData(530,300,1,1).data;};
      const normal=draw();
      cm.layers[0].globalLight={globalEnabled:true,intensity:.2,tintStrength:0,shadowLength:2,angle:0,shadowOpacity:.5,shadowColor:'#000000'};
      const dim=draw();assert(normal[0]+normal[1]+normal[2]>dim[0]+dim[1]+dim[2]+20,'Polygon ignores layer light');
      const {drawPolygonShadows}=await import('./js/polygons.js');
      ctx.clearRect(0,0,800,600);drawPolygonShadows(cm,ctx,0,{enabled:true,angle:0,offset:3,color:'#00000080'});
      const alpha=ctx.getImageData(0,0,800,600).data;
      assert(alpha.some((v,i)=>i%4===3&&v>0),'Polygon fails to cast global shadows');
      cm.layers[0].globalLight={globalEnabled:false};
      const state=JSON.parse(JSON.stringify(cm.getMapData()));cm.loadStateData(state);
      const reloaded=[...cm.customObjects.values()][0];
      assert(reloaded.vertices.length===5 && reloaded.imageSrc && reloaded.textureScale===2,'Roundtrip loses polygon data');
      await reloaded.image.decode();
      cm.exportSettings.region={minX:10,minY:5,maxX:20,maxY:12};
      const b=cm.getExportBounds();assert(b.width===10&&b.height===7,'Custom export bounds ignored');
      const {exportPageSize}=await import('./js/editor-controls.js');
      const zero={top:0,right:0,bottom:0,left:0};
      const landscape=exportPageSize({sheetMargins:zero}),portrait=exportPageSize({orientation:'portrait',cellSize:5,sheetMargins:zero});
      assert(Math.abs(landscape.width-11.88)<.02 && Math.abs(portrait.width-4.2)<.02,'Page guide scale incorrect');
      return {concaveHitTesting:true,textureClipping:true,materialRoundtrip:true,pageScale:true};
    }''')
    page.evaluate('''() => {
      cm.exportSettings.region={minX:14,minY:7,maxX:24,maxY:15};
      window.hudInstance.setMapCollapsed(false);
    }''')
    page.locator('#editExportArea').click()
    page.mouse.move(550,330);page.mouse.down();page.mouse.move(582,362,steps=3);page.mouse.up()
    assert page.evaluate('cm.exportSettings.region.minX') == 15
    page.mouse.move(800,512);page.mouse.down();page.mouse.move(864,544,steps=3);page.mouse.up()
    assert page.evaluate('cm.getExportBounds().width') == 12
    with page.expect_download() as download:
        page.locator('#exportPNG').click()
    path=download.value.path()
    # PNG IHDR records actual output dimensions, independent of browser camera.
    import struct
    with open(path,'rb') as image:
        image.seek(16)
        width,height=struct.unpack('>II',image.read(8))
    assert (width,height)==(768,576),(width,height)
    page.locator('#finishExportArea').click()
    page.evaluate('''() => {
      cm.loadStateData(window.polygonOriginal);cm.history=window.polygonHistory.entries;
      cm.historyIndex=window.polygonHistory.index;window.hudInstance.refresh();
      window.hudInstance.setMapCollapsed(true);
    }''')
    return result


def check_mobile_controls(browser,url):
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(url)
    page.wait_for_function('window.appReady')
    page.evaluate('window.cm=window.hudInstance.canvasManager')
    assert page.locator('#toolContents').is_hidden()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('[data-instrument=polygon]').click()
    for x,y in [(80,240),(280,240),(180,420)]:
        page.touchscreen.tap(x,y)
    assert page.evaluate('cm.polygonDraft.length')==3
    page.locator('#finishPolygon').click()
    assert page.evaluate('cm.customObjects.size')==1
    # Real two-finger pinch changes the camera without placing vertices or painting.
    cdp=page.context.new_cdp_session(page)
    def touch(kind,points):
        cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'id':i} for i,x,y in points]})
    touch('touchStart',[(0,100,300)])
    touch('touchStart',[(0,100,300),(1,220,300)])
    touch('touchMove',[(0,70,320),(1,270,320)])
    touch('touchEnd',[])
    assert page.evaluate('cm.scale>1.5 && cm.polygonDraft.length===0 && cm.customObjects.size===1')
    page.locator('[data-instrument=pan]').click()
    before=page.evaluate('cm.offsetX')
    touch('touchStart',[(0,110,300)])
    touch('touchMove',[(0,170,340)])
    touch('touchEnd',[])
    assert page.evaluate('cm.offsetX') > before+40
    page.locator('[data-instrument=gridDraw]').click()
    touch('touchStart',[(0,110,300)])
    touch('touchMove',[(0,155,300)])
    touch('touchStart',[(0,155,300),(1,260,300)])
    touch('touchMove',[(0,140,300),(1,280,300)])
    touch('touchEnd',[])
    assert page.evaluate('cm.layers[0].objects.size===0'), 'Pinch committed an accidental stroke'
    page.locator('#mapToggle').click()
    page.locator('#editExportArea').click()
    assert page.locator('#mapContents').is_hidden()
    expect(page.locator('#finishExportArea')).to_be_visible()
    page.locator('#finishExportArea').click()
    page.locator('#toolToggle').click()
    assert page.locator('#toolContents').is_visible()
    page.set_viewport_size({'width':844,'height':390})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    page.close()
    return {'touchPolygon':True,'pinchZoom':True,'touchPan':True,'pinchCancelsStroke':True,'responsivePanels':True}
