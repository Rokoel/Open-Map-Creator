"""Real uploads, stable per-cell variations, brush sizing, and split panel layout."""
def check_tileset_updates(page):
    page.evaluate('''async()=>{
      window.tilesOriginal=cm.getMapData();cm.clearCanvas();cm.layers=[{name:'Tiles',visible:true,objects:new Map(),gridShadowOptions:{enabled:false}}];
      const {ambientDefaults}=await import('./js/scene.js');
      cm.ambientLight={...ambientDefaults};cm.activeLayerIndex=0;cm.currentCellSize=32;cm.offsetX=cm.offsetY=0;cm.scale=1;
      cm.gridDrawSettings={type:'color',fillColor:'#ffffff',borderColor:'#ff0000'};cm.gridImageList=[];
      cm.freeDrawSettings.size=1;cm.emptyCellSettings={fillColor:'#ffffff',borderColor:'#ffffff'};cm.saveHistory();window.hudInstance.refresh();
      window.hudInstance.setMapCollapsed(true);
    }''')
    assert not page.locator('#mapContents').is_visible()
    assert not page.locator('#hud #instrumentSettings, #hud #layerControls, #hud #appearancePanel').count()
    page.locator('#mapToggle').click();assert page.locator('#mapContents').is_visible()
    page.locator('#mapToggle').click();assert not page.locator('#mapContents').is_visible()
    page.locator('[data-instrument=layers]').click()
    assert page.locator('#toolHud #layerControls').is_visible()
    assert page.locator('#appearancePanel').is_visible()
    before=page.evaluate('cm.layers[0].objects.size')
    page.mouse.click(600,400);assert page.evaluate('cm.layers[0].objects.size')==before
    rail=page.locator('#toolbar').bounding_box();left=page.locator('#toolHud').bounding_box()
    assert left['y']>=rail['y']+rail['height'] and left['x']<40,(rail,left)
    page.locator('[data-instrument=freeDraw]').click()
    slider=page.get_by_label('Size baseline (cells)',exact=True)
    assert slider.get_attribute('type')=='range'
    page.mouse.move(600,400);page.keyboard.down('Alt');page.mouse.wheel(0,-120)
    assert page.evaluate('cm.scale===1&&cm.freeDrawSettings.size>1&&cm.brushSizeModifier')
    assert float(slider.input_value())==page.evaluate('cm.freeDrawSettings.size')
    preview=page.evaluate('''async()=>{
      cm._doRender();const {drawScene}=await import('./js/scene.js');
      const c=document.createElement('canvas');c.width=cm.canvas.width;c.height=cm.canvas.height;const ctx=c.getContext('2d');
      drawScene(cm,ctx,{minX:0,minY:0,maxX:c.width,maxY:c.height});
      const screen=cm.ctx.getImageData(550,350,100,100).data,exported=ctx.getImageData(550,350,100,100).data;
      let differences=0;for(let i=0;i<screen.length;i++)if(screen[i]!==exported[i])differences++;
      if(differences<100)throw Error('Brush circle absent from screen or included in export');return differences;
    }''')
    page.keyboard.up('Alt')
    page.evaluate('document.activeElement.blur()');page.keyboard.press(']')
    assert page.evaluate('cm.freeDrawSettings.size>1.3')
    page.evaluate('cm.setBrushSize(.1);document.activeElement.blur()');page.keyboard.press(']')
    assert page.evaluate('cm.freeDrawSettings.size===.2')
    slider.evaluate("e=>{e.value='2.5';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}")
    assert page.evaluate('cm.freeDrawSettings.size===2.5')
    page.locator('[data-instrument=gridDraw]').click()
    files=[]
    for index,color in enumerate(['#338866','#996644']):
        files.append({'name':f'tile-{index}.svg','mimeType':'image/svg+xml','buffer':f'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="{color}"/><path d="M2 2H12V14H2Z" fill="#bbccdd"/></svg>'.encode()})
    page.locator('#instrumentSettings input[type=file]').set_input_files(files)
    page.wait_for_function('cm.gridDrawSettings.tileset?.length===2')
    assert page.locator('.tile-choice input:checked').count()==2
    assert not page.locator('#instrumentSettings').get_by_label('Cell outline',exact=True).is_visible()
    outline=page.get_by_label('Show cell outline',exact=True)
    assert not outline.is_checked()
    outline.check();assert page.get_by_label('Cell outline',exact=True).is_visible()
    outline.uncheck()
    for label in ['Random horizontal mirroring','Random vertical mirroring','Random quarter-turn rotation']:
        page.get_by_label(label,exact=True).check()
    for label,value in [('Hue variation (±°)','120'),('Saturation variation','.5'),('Brightness variation','.4'),('Contrast variation','.3')]:
        page.get_by_label(label,exact=True).evaluate('(e,value)=>{e.value=value;e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}',value)
    result=page.evaluate('''async()=>{
      const assert=(v,m)=>{if(!v)throw Error(m);};const {drawScene}=await import('./js/scene.js');
      for(let x=10;x<25;x++)for(let y=5;y<10;y++)cm.handleDrawing({x:(x+.5)*32,y:(y+.5)*32},{});
      const cells=[...cm.layers[0].objects.values()];
      assert(new Set(cells.map(c=>c.imageSrc)).size===2,'Tileset does not choose all tiles');
      assert(new Set(cells.map(c=>c.textureRotation)).size===4,'Rotation does not vary');
      assert(cells.some(c=>c.textureMirrorX)&&cells.some(c=>!c.textureMirrorX)&&cells.some(c=>c.textureMirrorY),'Mirroring does not vary');
      assert(cells.every(c=>c.outlineEnabled===false&&Math.abs(c.hueShift)<=120&&c.brightness>=.6&&c.brightness<=1.4&&c.contrast>=.7&&c.contrast<=1.3),'Variation or outline bounds ignored');
      assert(new Set(cells.map(c=>c.hueShift.toFixed(1))).size>40,'Color shifts do not vary');
      const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=600;const ctx=canvas.getContext('2d'),bounds={minX:0,minY:0,maxX:1000,maxY:600};
      const paint=()=>{ctx.clearRect(0,0,1000,600);drawScene(cm,ctx,bounds);return canvas.toDataURL();};
      cm.saveHistory();const first=paint();assert(first===paint(),'Redraw rerolls cell variations');
      // Reentering a cell in the same stroke must not reroll it.
      cm.isDrawing=true;cm.strokeCells=new Set();const point={x:336,y:176};cm.handleDrawing(point,{});
      const selected=JSON.stringify(cm.layers[0].objects.get('10_5'));for(let i=0;i<10;i++)cm.handleDrawing(point,{});
      assert(JSON.stringify(cm.layers[0].objects.get('10_5'))===selected,'Cell rerolled within a stroke');cm.isDrawing=false;cm.strokeCells=null;
      cm.saveHistory();const expected=paint(),data=JSON.parse(JSON.stringify(cm.getMapData()));
      cm.gridDrawSettings.type='color';cm.handleDrawing(point,{});cm.saveHistory();cm.undo();
      await Promise.all([...cm.layers[0].objects.values()].map(c=>c.image.decode()));assert(paint()===expected,'Undo changes texture variations');
      cm.loadStateData(data);await Promise.all([...cm.layers[0].objects.values()].map(c=>c.image.decode()));
      assert(paint()===expected,'Save/load changes texture variations');
      window.hudInstance.refresh();return {tiles:2,paintedCells:cells.length,stableVariation:true,undo:true,roundtrip:true};
    }''')
    # Unchecking a tile produces a one-texture tileset.
    page.get_by_label('Use tile 2',exact=True).uncheck()
    assert page.evaluate('cm.gridDrawSettings.tileset.length===1')
    page.evaluate('cm.handleDrawing({x:900,y:500},{});if(cm.layers[0].objects.get("28_15").imageSrc!==cm.gridDrawSettings.tileset[0])throw Error("Deselected tile still used")')
    page.evaluate('cm.loadStateData(window.tilesOriginal);window.hudInstance.refresh();window.hudInstance.setMapCollapsed(true)')
    return {**result,'brushPreviewPixels':preview,'splitPanels':True}
