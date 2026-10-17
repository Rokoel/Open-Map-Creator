"""Checks for hatch stacks, neutral corners, global lights, shadow exclusions and UI."""
def check_studio_updates(page):
    results=page.evaluate('''async () => {
      const {borderArtwork,buildBorderTopology,borderDefaults}=await import('./js/borders.js');
      const {drawScene,ambientDefaults,globalLightDefaults}=await import('./js/scene.js');
      const assert=(v,m)=>{if(!v)throw Error(m);};window.studioOriginal=cm.getMapData();
      const cells=new Map();for(let x=4;x<20;x++)for(let y=4;y<20;y++)cells.set(`${x}_${y}`,{x,y});
      const topology=buildBorderTopology([{visible:true,objects:cells}]);
      const settings={...borderDefaults,enabled:true,width:.8,density:80,hatchStrokes:5,hatchStacks:3};
      const hatch=borderArtwork(topology,settings);
      assert(hatch.stats.strokes===hatch.stats.chunks*5 && hatch.stats.stacks===3,'Wrong stroke grouping or stack count');
      const changed=borderArtwork(topology,{...settings,hatchStrokes:4,hatchStacks:2});
      assert(changed.stats.strokes===changed.stats.chunks*4 && changed.stats.stacks===2 && changed.signature!==hatch.signature,'Hatch controls do not rebuild grouped strokes');
      const dots=borderArtwork(topology,{...settings,style:'dots'}).stats.marks;
      const near=dots.filter(p=>p.distance<.24),corners=near.filter(p=>p.corner).length,edgeCount=near.length-corners;
      const cornerDensity=corners/(Math.PI*.24*.24),edgeDensity=edgeCount/(64*.24);
      assert(cornerDensity<edgeDensity*1.35,'Corners have a denser stipple budget than edges');
      const rocks=borderArtwork(topology,{...settings,style:'rocks'}).stats.marks;
      const bins=new Set(rocks.map(p=>Math.floor((p.y-Math.floor(p.y))*20)));
      assert(bins.size>=18,'Rocks are aligned in repeated rows');
      cm.clearCanvas();cm.layers=[{name:'Global',visible:true,objects:new Map(),gridShadowOptions:{enabled:false}}];cm.activeLayerIndex=0;
      cm.gridBorderOptions={...borderDefaults,enabled:false};cm.rebuildBorderTopology();
      cm.ambientLight={...ambientDefaults,preserveGlobal:true};cm.layers[0].globalLight={...globalLightDefaults,globalEnabled:true,lightColor:'#ff5500',tintStrength:.6,shadowLength:0};
      const canvas=document.createElement('canvas');canvas.width=700;canvas.height=650;const ctx=canvas.getContext('2d'),bounds={minX:0,minY:0,maxX:700,maxY:650};
      const paint=()=>{ctx.clearRect(0,0,700,650);drawScene(cm,ctx,bounds);};const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
      paint();const warm=pixel(250,250);assert(warm[0]>warm[2]+90,'Global light color has no effect without local lights');
      cm.layers[0].globalLight.lightColor='#1155ff';paint();const cool=pixel(250,250);assert(cool[2]>cool[0]+90,'Global tint color did not update');
      cm.layers[0].globalLight.intensity=.25;paint();assert(pixel(250,250)[2]<cool[2]-40,'Global intensity did not dim the scene');
      assert(cm.bakeLighting()===1,'Global-only lighting cannot be baked');const baked=cm.lightingRenderCount;paint();assert(cm.lightingRenderCount===baked,'Global bake recasts on render');
      cm.layers[0].globalLight.lightColor='#fff4db';paint();assert(!cm.bakedLighting,'Global color changes failed to invalidate bake');
      cm.ambientLight={...ambientDefaults,preserveGlobal:true};cm.layers[0].globalLight={...globalLightDefaults,globalEnabled:true,tintStrength:0,angle:0,shadowLength:3,shadowOpacity:.8,shadowColor:'#000000',shadowSoftness:0};
      cm.layers[0].objects=new Map([['1_1',{x:1,y:1,type:'color',fillColor:'#ffffff',borderColor:'#ffffff'}],['2_1',{x:2,y:1,type:'color',fillColor:'#ffffff',borderColor:'#ffffff',castsShadow:false,receivesShadow:true}]]);
      paint();const received=pixel(80,48)[0];assert(received<100,'Excluded floor cell does not receive another cell’s shadow');
      cm.layers[0].objects.get('1_1').castsShadow=false;paint();assert(pixel(80,48)[0]>230,'Excluded cell still drops a global shadow');
      const shadowOnly=document.createElement('canvas');shadowOnly.width=200;shadowOnly.height=200;const sc=shadowOnly.getContext('2d');cm.drawGridShadows(sc,32,bounds,cm.layers[0].objects,{enabled:true,angle:45,offset:2,color:'#000000ff'});assert(!sc.getImageData(0,0,200,200).data.some(v=>v),'Excluded cells still drop layer shadows');
      cm.layers[0].objects.clear();for(let y=0;y<20;y++)cm.layers[0].objects.set(`10_${y}`,{x:10,y,type:'color',fillColor:'#aaaaaa',borderColor:'#aaaaaa'});
      cm.ambientLight={...ambientDefaults};cm.layers[0].globalLight={};cm.customObjects.set('source',{type:'light',x:256,y:320,width:20,height:20,rotation:0,layerIndex:0,color:'#ffcc88',radius:8,intensity:1,bounces:0});
      paint();const blocked=pixel(370,330)[0];for(const cell of cm.layers[0].objects.values())cell.castsShadow=false;paint();const unblocked=pixel(370,330)[0];assert(unblocked>blocked+40,'Excluded cells still occlude local rays');
      cm.layers[0].globalLight={...globalLightDefaults,globalEnabled:true,lightColor:'#336699',angle:125,shadowLength:1.7,shadowSoftness:.12};
      const saved=JSON.parse(JSON.stringify(cm.getMapData()));cm.loadStateData(saved);assert(cm.layers[0].globalLight.lightColor==='#336699' && cm.layers[0].globalLight.shadowSoftness===.12 && [...cm.layers[0].objects.values()].every(c=>c.castsShadow===false),'Global lighting or shadow exclusions lost on reload');
      // Work scale changes stored pixel coordinates, preserving all cell-space dimensions and the camera.
      cm.customObjects.set('object',{x:200,y:200,width:96,height:64,rotation:0,layerIndex:0});
      const before=cm.getLogicalBoundingBox(),originalSize=cm.currentCellSize;cm.scale=1.7;cm.updateCellSize(originalSize*2);
      assert(cm.customObjects.get('object').width/cm.currentCellSize===3 && cm.scale===1.7,'Work scale changed cell dimensions or camera zoom');
      const after=cm.getLogicalBoundingBox();assert(Math.abs(before.width-after.width)<1e-6,'Cell pixels changed export size in cells');cm.updateCellSize(originalSize);
      cm.loadStateData(window.studioOriginal);window.hudInstance.refresh();
      return {hatchGroups:hatch.stats.chunks,strokesPerGroup:5,cornerDensity,edgeDensity,rockBins:bins.size,globalLighting:true,shadowExclusions:true};
    }''')
    # Batch checkbox changes only the selected cells; undo restores the previous flags.
    page.evaluate('''() => {
      cm.clearCanvas();cm.setActiveLayer(0);const layer=cm.layers[0];
      layer.objects.set('4_4',{x:4,y:4,type:'color',fillColor:'#fff',borderColor:'#aaa'});layer.objects.set('5_4',{x:5,y:4,type:'color',fillColor:'#fff',borderColor:'#aaa'});layer.objects.set('6_4',{x:6,y:4,type:'color',fillColor:'#fff',borderColor:'#aaa'});
      cm.saveHistory();cm.setActiveInstrument('select');cm.selectedObjects.grid=['4_4','5_4'];window.hudInstance.refresh();
    }''')
    page.evaluate('window.hudInstance.showPanel("toolPanel")')
    page.locator('#instrumentSettings').get_by_label('Cast shadows',exact=True).uncheck()
    assert page.evaluate("cm.layers[0].objects.get('4_4').castsShadow===false && cm.layers[0].objects.get('5_4').castsShadow===false && cm.layers[0].objects.get('6_4').castsShadow!==false")
    page.locator('#undo').click()
    assert page.evaluate("cm.layers[0].objects.get('4_4').castsShadow!==false")
    page.evaluate('window.hudInstance.showPanel("appearancePanel")')
    page.locator('#borderStyle').select_option('hatch')
    page.locator('#hatchStrokes').fill('4');page.locator('#hatchStacks').fill('2');page.locator('#hatchStacks').press('Tab')
    assert page.evaluate('cm.gridBorderOptions.hatchStrokes===4 && cm.gridBorderOptions.hatchStacks===2')
    page.locator('#globalLightSettings').evaluate('(element)=>element.open=true')
    page.locator('#globalLightEnabled').check()
    page.locator('#globalLightAngle').fill('135');page.locator('#globalLightAngle').press('Tab')
    assert page.evaluate('cm.globalLight.globalEnabled && cm.globalLight.angle===135')
    # The header action opens PDF settings; the Map panel retains PNG export.
    page.locator('#exportPDFPrimary').click()
    assert page.locator('#pdfDialog').is_visible()
    page.locator('#pdfCancel').click()
    assert not page.locator('header #exportPNG').count()
    assert 'Iconoir' not in page.locator('body').inner_text()
    # Icon-only controls must center their SVG in both axes.
    centers=page.evaluate('''() => {
      const buttons=[document.getElementById('themeToggle'),document.getElementById('addLayer'),...document.querySelectorAll('#layerList button[aria-label]')];
      return buttons.filter(b=>b.querySelector('svg')).map(b=>{const br=b.getBoundingClientRect(),sr=b.querySelector('svg').getBoundingClientRect();return {dx:Math.abs(br.x+br.width/2-sr.x-sr.width/2),dy:Math.abs(br.y+br.height/2-sr.y-sr.height/2)};});
    }''')
    assert all(c['dx']<1 and c['dy']<1 for c in centers), centers
    page.evaluate('cm.loadStateData(window.studioOriginal);window.hudInstance.refresh()')
    return results
