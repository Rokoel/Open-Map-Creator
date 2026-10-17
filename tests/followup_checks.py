"""Regression checks for contour textures, swept shadows, light baking, and editor state."""
def check_followups(page):
    result = page.evaluate('''async () => {
      const {outerContours}=await import('./js/geometry.js');
      const {drawBorders,buildBorderTopology}=await import('./js/borders.js');
      const {drawScene,lightingSignature}=await import('./js/scene.js');
      const cm=window.hudInstance.canvasManager,original=cm.getMapData();
      const assert=(condition,message)=>{if(!condition)throw Error(message);};
      const ring=new Map();for(let x=3;x<11;x++)for(let y=3;y<11;y++)if(x===3||x===10||y===3||y===10)ring.set(`${x}_${y}`,{x,y,type:'color',fillColor:'#dddddd',borderColor:'#dddddd'});
      assert(outerContours(ring).length===1,'Ring must expose only its exterior contour');
      ring.set('6_6',{x:6,y:6});assert(outerContours(ring).length===1,'Enclosed islands must not reopen exterior texture mask');ring.delete('6_6');
      const diagonal=new Map([['0_0',{x:0,y:0}],['1_1',{x:1,y:1}]]);assert(outerContours(diagonal).length===2,'Diagonal touching cells must trace distinct contours');
      const union=buildBorderTopology([{visible:true,objects:new Map([['0_0',{x:0,y:0}]])},{visible:true,objects:new Map([['1_0',{x:1,y:0}]])}]);
      assert(union.contours.length===1 && union.contours[0].length===6,'Visible layers must share one exterior boundary');
      const canvas=document.createElement('canvas');canvas.width=500;canvas.height=500;const ctx=canvas.getContext('2d'),bounds={minX:0,minY:0,maxX:500,maxY:500};
      cm.gridBorderOptions={enabled:true,style:'dots',width:.7,density:80,color:'#27364a',seed:4};
      drawBorders(cm,ctx,ring,32,bounds);
      const inner=ctx.getImageData(128,128,192,192).data;assert(!inner.some((v,i)=>i%4===3&&v),'Texture leaked into an enclosed ring');
      const alphaCount=(x,y,w,h)=>{const data=ctx.getImageData(x,y,w,h).data;let n=0;for(let i=3;i<data.length;i+=4)if(data[i])n++;return n;};
      const near=alphaCount(130,89,188,6),far=alphaCount(130,76,188,6);assert(near>far*1.7,'Stipple density must increase toward the contour');
      const layerBorders={...cm.gridBorderOptions};cm.clearCanvas();cm.layers=[{name:'Wall',visible:true,objects:ring,gridBorderOptions:layerBorders,gridShadowOptions:{enabled:false}}];cm.activeLayerIndex=0;cm.rebuildBorderTopology();
      cm.customObjects.set('light',{type:'light',layerIndex:0,x:64,y:64,width:20,height:20,rotation:0,color:'#ffd090',intensity:1,radius:8,bounces:1});
      const inkCanvas=document.createElement('canvas');inkCanvas.width=1500;inkCanvas.height=1500;const inkContext=inkCanvas.getContext('2d');inkContext.scale(3,3);drawScene(cm,inkContext,bounds);const lit=inkContext.getImageData(384,222,576,66).data;
      cm.layers[0].gridShadowOptions={enabled:true,angle:270,offset:1,color:'#000000ee'};
      inkContext.clearRect(0,0,500,500);drawScene(cm,inkContext,bounds);const shadowed=inkContext.getImageData(384,222,576,66).data;
      // Compare fully inked pixels: pen color cannot be darkened by scene lighting or shadows.
      const penCanvas=document.createElement('canvas');penCanvas.width=1500;penCanvas.height=1500;const pen=penCanvas.getContext('2d');pen.scale(3,3);drawBorders(cm,pen,ring,32,bounds);const ink=pen.getImageData(384,222,576,66).data;
      let stableInk=0;for(let i=0;i<lit.length;i+=4)if(ink[i+3]===255){assert(Math.abs(shadowed[i]-lit[i])<=1&&Math.abs(shadowed[i+1]-lit[i+1])<=1&&Math.abs(shadowed[i+2]-lit[i+2])<=1,'Lighting/shadow changed pen ink '+JSON.stringify({lit:[...lit.slice(i,i+4)],shadowed:[...shadowed.slice(i,i+4)],ink:[...ink.slice(i,i+4)]}));stableInk++;}
      assert(stableInk>10,'Need solid pen samples for lighting test');
      // A long diagonal shadow must be a continuous extrusion, never a detached copy.
      ctx.clearRect(0,0,500,500);
      cm.drawGridShadows(ctx,32,bounds,new Map([['2_2',{x:2,y:2}]]),{enabled:true,angle:45,offset:3,color:'#00000080'});
      assert(ctx.getImageData(110,110,1,1).data[3]>50,'Diagonal sweep detached from source cell');
      assert(ctx.getImageData(145,145,1,1).data[3]>50,'Long sweep contains a gap');
      assert(ctx.getImageData(80,80,1,1).data[3]===0,'Shadow covered its source cell');
      const noLight=cm.customObjects.get('light');cm.customObjects.delete('light');
      cm.layers[0].gridShadowOptions={enabled:true,angle:0,offset:4,color:'#00000080'};
      assert(cm.getLogicalBoundingBox().maxX>=15,'Export bounds crop long directional shadows');cm.customObjects.set('light',noLight);
      cm.layers[0].gridShadowOptions={enabled:false};
      // History restores document state without restoring a historical camera.
      cm.saveHistory();cm.customObjects.get('light').intensity=.4;cm.saveHistory();cm.scale=2.7;cm.offsetX=123;cm.offsetY=-77;cm.undo();
      assert(cm.customObjects.get('light').intensity===1,'Undo must restore the edit');assert(cm.scale===2.7&&cm.offsetX===123&&cm.offsetY===-77,'Undo moved the camera');cm.redo();
      assert(cm.scale===2.7&&cm.offsetX===123&&cm.offsetY===-77,'Redo moved the camera');
      cm.scale=1;cm.offsetX=0;cm.offsetY=0;
      // Keeping global light leaves distant parts at full map brightness.
      cm.ambientLight={preserveGlobal:true,brightness:.22,color:'#091226'};
      ctx.clearRect(0,0,500,500);drawScene(cm,ctx,bounds);const bright=ctx.getImageData(450,450,1,1).data[0];
      cm.ambientLight.preserveGlobal=false;ctx.clearRect(0,0,500,500);drawScene(cm,ctx,bounds);const dark=ctx.getImageData(450,450,1,1).data[0];assert(bright>dark+100,'Global light preservation has no effect');
      // A bake is a world-space radiance cache, reused by view changes and exports.
      assert(cm.bakeLighting()===1,'Bake did not create a lightmap');const renders=cm.lightingRenderCount;
      cm.scale=2;cm.offsetX=40;ctx.clearRect(0,0,500,500);drawScene(cm,ctx,bounds);assert(cm.lightingRenderCount===renders,'Baked panning/zooming recast rays');
      const exportCanvas=document.createElement('canvas');exportCanvas.width=1000;exportCanvas.height=1000;const exportContext=exportCanvas.getContext('2d');exportContext.scale(32,32);cm.drawAll(exportContext,32);assert(cm.lightingRenderCount===renders,'Baked export recast rays');
      cm.gridBorderOptions.color='#123456';cm.saveHistory();assert(!!cm.bakedLighting,'Changing border ink should preserve lightmap');
      cm.customObjects.get('light').x+=10;ctx.clearRect(0,0,500,500);drawScene(cm,ctx,bounds);assert(!cm.bakedLighting && cm.lightingRenderCount>renders,'Moving a light did not invalidate bake');
      cm.ambientLight.preserveGlobal=true;const data=cm.getMapData();cm.loadStateData(JSON.parse(JSON.stringify(data)));assert(cm.ambientLight.preserveGlobal,'Global lighting not saved');
      cm.loadStateData(original);window.hudInstance.refresh();
      return {nearDots:near,farDots:far,stableInk,bakedLightingReused:true};
    }''')
    # Stroke-time topology: painting each cell must not run connectivity analysis.
    page.evaluate('''() => {
      window.followupOriginal=cm.getMapData();cm.clearCanvas();cm.setActiveLayer(0);cm.setActiveInstrument('gridDraw');window.hudInstance.refresh();
      window.beforeStrokeBuilds=cm.borderTopologyBuilds;
    }''')
    page.mouse.move(420,200);page.mouse.down()
    page.mouse.move(640,200,steps=12)
    assert page.evaluate('cm.borderTopologyBuilds===window.beforeStrokeBuilds'), 'Contours rebuilt during stroke'
    page.mouse.up()
    assert page.evaluate('cm.borderTopologyBuilds===window.beforeStrokeBuilds+1'), 'Stroke completion must rebuild exactly once'
    # Inspector ratio lock: both editing directions, then unlock; persistence through JSON.
    page.evaluate('''() => {
      cm.clearCanvas();cm.setActiveInstrument('select');cm.customObjects.set('ratio',{x:300,y:300,width:96,height:64,rotation:0,layerIndex:0});cm.selectedObjects.custom=['ratio'];window.hudInstance.refresh();
    }''')
    page.evaluate('window.hudInstance.showPanel("toolPanel")')
    page.get_by_role('button',name='Lock width/height ratio',exact=True).click()
    page.locator('#instrumentSettings').get_by_label('Width (cells)',exact=True).fill('6')
    assert page.evaluate("cm.customObjects.get('ratio').height") == 128
    page.locator('#instrumentSettings').get_by_label('Height (cells)',exact=True).fill('2')
    assert page.evaluate("cm.customObjects.get('ratio').width") == 96
    page.get_by_role('button',name='Lock width/height ratio',exact=True).click()
    page.locator('#instrumentSettings').get_by_label('Width (cells)',exact=True).fill('5')
    assert page.evaluate("cm.customObjects.get('ratio').height") == 64
    page.evaluate('''() => {cm.loadStateData(window.followupOriginal);window.hudInstance.refresh();}''')
    # All icon references resolve to locally licensed Iconoir symbols.
    icons = page.evaluate('''async () => {
      const response=await fetch('assets/iconoir/sprite.svg'),xml=new DOMParser().parseFromString(await response.text(),'image/svg+xml');
      if(xml.querySelector('parsererror'))throw Error('Invalid Iconoir SVG sprite');
      const uses=[...document.querySelectorAll('use')];for(const use of uses){const id=use.getAttribute('href').split('#')[1];if(!xml.getElementById(id))throw Error('Missing Iconoir icon '+id);}
      return uses.length;
    }''')
    assert icons>15
    page.evaluate('window.hudInstance.showPanel("appearancePanel")')
    page.locator('#preserveGlobalLight').check()
    assert page.locator('#ambientBrightness').is_disabled()
    page.locator('#bakeLighting').click()
    assert page.evaluate('!!cm.bakedLighting')
    page.evaluate('window.bakedUiRenders=cm.lightingRenderCount')
    page.mouse.move(500,400);page.mouse.wheel(0,-120);page.wait_for_timeout(100)
    assert page.evaluate('cm.lightingRenderCount===window.bakedUiRenders')
    page.locator('#liveLighting').click()
    assert page.evaluate('!cm.bakedLighting')
    page.evaluate('cm.loadStateData(window.followupOriginal);window.hudInstance.refresh()')
    return result
