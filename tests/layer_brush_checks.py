"""Layer appearance, opacity, independent shadow receivers, and SVG brush coverage."""
def check_layer_brush_updates(page):
    result=page.evaluate('''async () => {
      const assert=(v,m)=>{if(!v)throw Error(m);};
      window.layerBrushOriginal=cm.getMapData();
      const {drawScene,ambientDefaults,globalLightDefaults}=await import('./js/scene.js');
      const {borderDefaults}=await import('./js/borders.js');
      assert(borderDefaults.width===.75&&borderDefaults.hatchStrokes===9&&borderDefaults.hatchStacks===2&&borderDefaults.hatchBlockDensity===.3&&borderDefaults.hatchRandomness===.5,'Screenshot defaults differ');
      cm.clearCanvas();cm.layers=[{name:'Lower',visible:true,objects:new Map(),gridShadowOptions:{enabled:false},globalLight:{...globalLightDefaults},gridBorderOptions:{...borderDefaults}},
        {name:'Upper',visible:true,objects:new Map(),gridShadowOptions:{enabled:false},globalLight:{...globalLightDefaults},gridBorderOptions:{...borderDefaults}}];
      cm.currentCellSize=32;cm.offsetX=cm.offsetY=0;cm.scale=1;cm.activeLayerIndex=0;
      cm.ambientLight={...ambientDefaults};cm.emptyCellSettings={fillColor:'#ffffff',borderColor:'#ffffff'};
      cm.layers[0].objects.set('4_4',{x:4,y:4,type:'color',fillColor:'#ff0000',borderColor:'#ff0000'});
      cm.layers[1].objects.set('4_4',{x:4,y:4,type:'color',fillColor:'#0000ff',borderColor:'#0000ff',opacity:.5});
      const canvas=document.createElement('canvas');canvas.width=650;canvas.height=650;const ctx=canvas.getContext('2d'),bounds={minX:0,minY:0,maxX:650,maxY:650};
      const paint=()=>{ctx.clearRect(0,0,650,650);drawScene(cm,ctx,bounds);};const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
      cm.rebuildBorderTopology();paint();let p=pixel(144,144);
      assert(p[0]>=126&&p[0]<=128&&p[2]>=127&&p[2]<=129,'Half-transparent cell does not reveal lower layer: '+p);
      cm.layers[1].objects.get('4_4').opacity=0;paint();assert(pixel(144,144).join(',')==='255,0,0,255','Zero opacity covers the lower layer');
      cm.layers[1].objects.clear();cm.layers[1].objects.set('12_4',{x:12,y:4,type:'color',fillColor:'#ffffff',borderColor:'#ffffff'});
      cm.gridBorderOptions={...borderDefaults,enabled:true,color:'#cc0000',width:.75};cm.globalLight.globalEnabled=true;cm.globalLight.angle=0;cm.globalLight.shadowLength=2;cm.globalLight.tintStrength=0;
      cm.setActiveLayer(1);cm.gridBorderOptions={...borderDefaults,enabled:true,color:'#0000cc',width:.4};cm.globalLight.globalEnabled=true;cm.globalLight.angle=90;cm.globalLight.shadowLength=3;cm.globalLight.tintStrength=0;
      cm.saveHistory();paint();const image=canvas.toDataURL();cm.setActiveLayer(0);paint();assert(image===canvas.toDataURL(),'Active layer changes appearance of other layers');
      assert(cm.gridBorderOptions.color==='#cc0000'&&cm.globalLight.angle===0,'Layer settings leak');
      let red=0,blue=0;const data=ctx.getImageData(0,0,650,650).data;
      for(let i=0;i<data.length;i+=4){if(data[i]>data[i+2]+40)red++;if(data[i+2]>data[i]+40)blue++;}
      assert(red>100&&blue>100,'Per-layer border colors did not render');
      const saved=JSON.parse(JSON.stringify(cm.getMapData()));
      assert(!saved.settings.gridBorderOptions&&saved.layers[0].gridBorderOptions.color==='#cc0000'&&saved.layers[1].globalLight.angle===90,'Appearance was not serialized per layer');
      cm.loadStateData(saved);assert(cm.layers[1].gridBorderOptions.width===.4&&cm.layers[0].globalLight.angle===0,'Per-layer settings lost on load');
      // Both old global border assets and old global lighting migrate to independent layers.
      const legacy=structuredClone(saved);for(const l of legacy.layers){delete l.gridBorderOptions;delete l.globalLight;}
      legacy.settings.gridBorderOptions={...borderDefaults,enabled:true,color:'#123456'};legacy.settings.ambientLight={...ambientDefaults,globalEnabled:true,angle:135};
      cm.loadStateData(legacy);assert(cm.layers.every(l=>l.gridBorderOptions.color==='#123456'&&l.globalLight.angle===135),'Legacy appearance lost');
      cm.layers[0].gridBorderOptions.color='#654321';assert(cm.layers[1].gridBorderOptions.color==='#123456','Migrated layer settings share references');
      cm.layers=[{name:'Receivers',visible:true,objects:new Map(),globalLight:{...globalLightDefaults},gridBorderOptions:{...borderDefaults},gridShadowOptions:{enabled:false}}];cm.activeLayerIndex=0;
      cm.ambientLight={...ambientDefaults};cm.customObjects.clear();
      for(let y=0;y<20;y++)cm.layers[0].objects.set(`10_${y}`,{x:10,y,type:'color',fillColor:'#ffffff',borderColor:'#ffffff'});
      const floor={x:12,y:10,type:'color',fillColor:'#ffffff',borderColor:'#ffffff',blocksLight:false,castsShadow:false,receivesGlobalShadow:false,receivesLightShadow:true};
      cm.layers[0].objects.set('12_10',floor);cm.customObjects.set('lamp',{type:'light',x:256,y:336,width:16,height:16,rotation:0,layerIndex:0,color:'#ffffff',radius:10,intensity:1,bounces:0});
      cm.rebuildBorderTopology();paint();const dark=pixel(400,336)[0];floor.receivesLightShadow=false;paint();const bright=pixel(400,336)[0];
      assert(bright>dark+35,'Light-source receiving switch does not bypass occlusion: '+[dark,bright]);
      assert(floor.receivesGlobalShadow===false,'Light-source switch changes global receiving');
      cm.bakeLighting();const baked=pixel(400,336)[0];paint();assert(Math.abs(pixel(400,336)[0]-baked)<3,'Baking loses light-source receiving state');
      floor.receivesLightShadow=true;paint();assert(!cm.bakedLighting,'Receiving changes fail to invalidate lighting bake');
      cm.customObjects.clear();cm.loadStateData(saved);window.hudInstance.refresh();
      return {layerAppearance:true,cellOpacity:true,sourceShadowReceiving:true,legacyMigration:true};
    }''')
    page.evaluate('window.hudInstance.showPanel("appearancePanel")')
    page.evaluate('cm.setActiveLayer(1);window.hudInstance.refresh()')
    assert page.locator('#borderWidth').input_value()=='0.4'
    page.locator('#borderWidth').fill('0.9');page.locator('#borderWidth').press('Tab')
    assert page.evaluate('cm.layers[1].gridBorderOptions.width===.9&&cm.layers[0].gridBorderOptions.width===.75')
    page.evaluate('cm.setActiveLayer(0);window.hudInstance.refresh()')
    assert page.locator('#borderWidth').input_value()=='0.75'
    assert not page.locator('#hatchLayout, #borderDensity, #cellSize, #cellSizeValue').count()
    # Upload a real SVG with a conventional full-canvas white background.
    page.locator('[data-instrument=freeDraw]').click()
    page.evaluate('window.hudInstance.showPanel("toolPanel")')
    page.locator('#instrumentSettings input[type=file]').set_input_files({
      'name':'brush.svg','mimeType':'image/svg+xml',
      'buffer':b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="white"/><path d="M8 12H28V48H8Z" fill="#00aa44"/><circle cx="44" cy="24" r="8" fill="#00aa44"/></svg>'})
    page.wait_for_function('!!cm.freeDrawSettings.svgSource && cm.freeDrawSettings.image?.complete')
    fill=page.locator('#instrumentSettings').get_by_label('Fill',exact=True)
    fill.evaluate("e=>{e.value='#dd2255';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}")
    page.wait_for_function('cm.freeDrawSettings.image?.complete')
    def sample():
        return page.evaluate('''() => {
          const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.drawImage(cm.freeDrawSettings.image,0,0,64,64);
          return {background:[...x.getImageData(2,2,1,1).data],art:[...x.getImageData(16,24,1,1).data]};
        }''')
    pixels=sample()
    assert pixels['background'][3]==0 and pixels['art']==[221,34,85,255],pixels
    page.locator('#instrumentSettings').get_by_label('SVG background',exact=True).check()
    bg=page.locator('#instrumentSettings').get_by_label('SVG background color',exact=True)
    bg.evaluate("e=>{e.value='#1122ee';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}")
    page.wait_for_function('cm.freeDrawSettings.image?.complete')
    assert sample()['background']==[17,34,238,255],sample()
    page.locator('#instrumentSettings').get_by_label('Keep original SVG colors',exact=True).check()
    page.wait_for_function('cm.freeDrawSettings.image?.complete')
    assert sample()['art']==[0,170,68,255],sample()
    page.locator('#instrumentSettings').get_by_label('SVG background',exact=True).uncheck()
    page.wait_for_function('cm.freeDrawSettings.image?.complete')
    assert sample()['background'][3]==0
    page.locator('#instrumentSettings').get_by_label('Spread (cells)',exact=True).fill('1')
    page.locator('#instrumentSettings').get_by_label('Rotation randomness (±°)',exact=True).fill('150')
    page.locator('#instrumentSettings').get_by_label('Size randomness',exact=True).evaluate("e=>{e.value='.5';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}")
    page.locator('#instrumentSettings').get_by_label('Random mirroring',exact=True).select_option('both')
    brush=page.evaluate('''async () => {
      cm.freeDrawSettings.period=0;cm.freeDrawObjects.clear();
      for(let i=0;i<60;i++)cm.handleDrawing({x:500,y:500},{});
      const stamps=[...cm.freeDrawObjects.values()];
      if(!stamps.every(s=>s.size>=16&&s.size<=48&&Math.abs(s.rotation)<=150*Math.PI/180&&Math.abs(s.x-500)<=32&&Math.abs(s.y-500)<=32))throw Error('Brush variation bounds ignored');
      if(!stamps.some(s=>s.mirrorX)||!stamps.some(s=>!s.mirrorX)||!stamps.some(s=>s.mirrorY))throw Error('Mirroring never varies');
      if(new Set(stamps.map(s=>s.size.toFixed(2))).size<40)throw Error('Brush size is not randomized');
      cm.saveHistory();const saved=JSON.parse(JSON.stringify(cm.getMapData()));cm.loadStateData(saved);
      await cm.freeDrawSettings.image.decode();await Promise.all([...cm.freeDrawObjects.values()].map(s=>s.image.decode()));
      if(cm.freeDrawObjects.size!==60||cm.freeDrawSettings.mirroring!=='both'||!cm.freeDrawSettings.svgSource)throw Error('Brush save/load failed');
      const stamp=[...cm.freeDrawObjects.values()][0],c=document.createElement('canvas');c.width=c.height=1000;const ctx=c.getContext('2d');const old=cm.ctx;cm.ctx=ctx;cm.drawFreeDrawObject(stamp);cm.ctx=old;
      if(!ctx.getImageData(450,450,100,100).data.some(v=>v))throw Error('Random brush not rendered after loading');
      return {svgTint:true,svgBackground:true,brushVariation:true,stamps:stamps.length};
    }''')
    page.evaluate('cm.loadStateData(window.layerBrushOriginal);window.hudInstance.refresh()')
    return {**result,**brush}
