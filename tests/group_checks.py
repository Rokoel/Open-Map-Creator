"""Shared-pivot group transforms, optional solid outlines, and layer-owned lights."""
def check_groups_and_light_layers(page):
    page.evaluate('''async()=>{
      window.groupOriginal=cm.getMapData();cm.clearCanvas();
      const {ambientDefaults,globalLightDefaults}=await import('./js/scene.js');
      cm.layers=[{name:'Ground',visible:true,objects:new Map(),globalLight:{...globalLightDefaults},gridShadowOptions:{enabled:false}},
        {name:'Upper',visible:true,objects:new Map(),globalLight:{...globalLightDefaults},gridShadowOptions:{enabled:false}}];
      cm.activeLayerIndex=0;cm.currentCellSize=32;cm.offsetX=cm.offsetY=0;cm.scale=1;cm.ambientLight={...ambientDefaults};
      cm.emptyCellSettings={fillColor:'#ffffff',borderColor:'#ffffff'};
      cm.gridDrawSettings={type:'color',fillColor:'#335577',borderColor:'#ff0000'};
      cm.customObjects.set('a',{x:500,y:400,width:48,height:32,rotation:.2,layerIndex:0,fillColor:'#3388aa'});
      cm.customObjects.set('b',{x:700,y:400,width:32,height:64,rotation:-.3,layerIndex:0,fillColor:'#88aa33'});
      cm.setActiveInstrument('select');cm.selectedObjects={grid:[],free:[],custom:['a','b']};cm.saveHistory();window.hudInstance.refresh();
    }''')
    page.get_by_role('button',name='Group objects',exact=True).click()
    assert page.evaluate("!!cm.customObjects.get('a').groupId&&cm.customObjects.get('a').groupId===cm.customObjects.get('b').groupId")
    page.get_by_label('Group rotation (°)',exact=True).fill('90')
    page.get_by_label('Group rotation (°)',exact=True).press('Tab')
    page.evaluate('''()=>{
      const a=cm.customObjects.get('a'),b=cm.customObjects.get('b');
      if(Math.abs(a.x-600)>1e-6||Math.abs(a.y-300)>1e-6||Math.abs(b.x-600)>1e-6||Math.abs(b.y-500)>1e-6)throw Error('Group does not orbit shared pivot');
      if(Math.abs(a.rotation-(.2+Math.PI/2))>1e-6||Math.abs(b.rotation-(-.3+Math.PI/2))>1e-6)throw Error('Group does not preserve relative orientation');
    }''')
    # A real hit on either member selects the entire group. The round handle
    # rotates around the marked shared pivot, retaining each member's distance.
    page.evaluate("cm.selectedObjects={grid:[],free:[],custom:[]};cm.render()")
    page.mouse.click(600,300)
    assert page.evaluate('cm.selectedObjects.custom.length===2')
    handle=page.evaluate('cm.handlePoints(cm.selectionGroup())[8]')
    # Pointer starts to the right of the pivot after the 90° numeric rotation.
    page.mouse.move(handle['x'],handle['y']);page.mouse.down()
    page.mouse.move(600,400+abs(handle['x']-600),steps=8);page.mouse.up()
    page.evaluate('''()=>{
      const a=cm.customObjects.get('a'),b=cm.customObjects.get('b');
      if(Math.abs(a.x-700)>1||Math.abs(a.y-400)>1||Math.abs(b.x-500)>1||Math.abs(b.y-400)>1)throw Error('Shared handle rotates members independently');
      if(Math.abs(cm.selectionGroup().x-600)>1e-6||Math.abs(cm.selectionGroup().y-400)>1e-6)throw Error('Group pivot moved during rotation');
    }''')
    # Undo/redo preserves grouping and transforms, and ungrouping preserves art.
    page.keyboard.press('Control+z')
    assert page.evaluate("Math.abs(cm.customObjects.get('a').y-300)<1e-6&&!!cm.customObjects.get('a').groupId")
    page.keyboard.press('Control+Shift+z')
    page.mouse.click(700,400)
    page.evaluate("window.beforeUngroup=JSON.stringify(['a','b'].map(id=>{const o=cm.customObjects.get(id);return [o.x,o.y,o.rotation]}))")
    page.evaluate('document.activeElement.blur()');page.keyboard.press('Control+Shift+g')
    assert page.evaluate("!cm.customObjects.get('a').groupId&&window.beforeUngroup===JSON.stringify(['a','b'].map(id=>{const o=cm.customObjects.get(id);return [o.x,o.y,o.rotation]}))")
    page.keyboard.press('Control+g')
    assert page.evaluate("!!cm.customObjects.get('a').groupId")
    checks=page.evaluate('''async()=>{
      const assert=(v,m)=>{if(!v)throw Error(m);};
      // Groups may combine image objects, brush stamps, and light sources.
      cm.freeDrawObjects.set('stamp',{x:600,y:600,size:32,rotation:.4,layerIndex:0,fillColor:'#ff5500',strokeColor:'#ff5500'});
      cm.selectedObjects.free=['stamp'];cm.groupSelection();const group=cm.selectionGroup(),original=cm.selectedMembers().map(m=>({...m.obj}));
      cm.copySelection();cm.mouseX=900;cm.mouseY=650;cm.pasteSelection();
      const copied=cm.selectedMembers().map(m=>m.obj),newGroup=cm.selectionGroup();
      assert(newGroup&&newGroup.groupId!==group.groupId,'Pasted group merged with source group');
      const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
      for(let i=0;i<copied.length;i++)for(let j=0;j<copied.length;j++)assert(Math.abs(distance(copied[i],copied[j])-distance(original[i],original[j]))<1e-6,'Mixed group lost geometry on paste');
      const data=JSON.parse(JSON.stringify(cm.getMapData()));cm.loadStateData(data);
      const all=[...cm.freeDrawObjects.values(),...cm.customObjects.values()];assert(all.filter(o=>o.groupId===newGroup.groupId).length===3,'Group lost on save/load');
      return {sharedPivot:true,groupHandle:true,groupUndo:true,mixedCopy:true,groupSave:true};
    }''')
    # Solid brush and selected colored cells can both turn outlines off.
    page.locator('[data-instrument=gridDraw]').click()
    page.get_by_label('Show cell outline',exact=True).uncheck()
    page.mouse.click(500,200)
    assert page.evaluate("cm.layers[0].objects.get('15_6').outlineEnabled===false")
    page.locator('[data-instrument=select]').click();page.mouse.click(500,200)
    assert not page.get_by_label('Show cell outline',exact=True).is_checked()
    page.get_by_label('Show cell outline',exact=True).check()
    assert page.evaluate("cm.layers[0].objects.get('15_6').outlineEnabled===true")
    # Explicit placement layer plus real canvas placement.
    page.locator('[data-instrument=light]').click()
    page.get_by_label('Placement layer',exact=True).select_option('1')
    page.mouse.click(650,250)
    assert page.evaluate("[...cm.customObjects.values()].at(-1).type==='light'&&[...cm.customObjects.values()].at(-1).layerIndex===1")
    light=page.evaluate('''async()=>{
      const assert=(v,m)=>{if(!v)throw Error(m);};const {drawScene,lightDefaults,globalLightDefaults}=await import('./js/scene.js');
      cm.customObjects.clear();cm.freeDrawObjects.clear();for(const l of cm.layers){l.objects.clear();l.globalLight={...globalLightDefaults};}
      cm.layers[1].objects.set('18_9',{x:18,y:9,type:'color',fillColor:'#ffffff',borderColor:'#ffffff',blocksLight:false,castsShadow:false});
      const lamp={...lightDefaults,type:'light',layerIndex:0,x:592,y:304,width:18,height:18,rotation:0,color:'#ff0000',intensity:.6};cm.customObjects.set('lamp',lamp);cm.rebuildBorderTopology();
      const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d'),bounds={minX:0,minY:0,maxX:800,maxY:600};
      const paint=(editor=false)=>{x.clearRect(0,0,800,600);drawScene(cm,x,bounds,{editor});return [...x.getImageData(592,304,1,1).data];};
      assert(paint(true).slice(0,3).join(',')==='255,255,255','Lower-layer light marker covers upper artwork');
      lamp.layerIndex=1;const live=paint(false);assert(live[1]<220,'Upper layer ignores its own light');
      const marker=paint(true);assert(marker[0]===255&&marker[1]===0,'Marker not drawn in its actual layer');
      assert(paint(false)[1]>0,'Editor light marker leaked into export');
      cm.layers[1].visible=false;assert(paint(true).slice(0,3).join(',')==='255,255,255','Hidden layer light still renders or illuminates');cm.layers[1].visible=true;
      const saved=JSON.parse(JSON.stringify(cm.getMapData()));saved.customObjects[0][1].layerIndex='1';cm.loadStateData(saved);
      assert(cm.customObjects.get('lamp').layerIndex===1,'Imported light moved to layer zero');
      cm.setActiveLayer(1);cm.setActiveInstrument('select');cm.selectedObjects.custom=['lamp'];window.hudInstance.refresh();
      return {placementLayer:true,lightOrdering:true,hiddenLights:true,lightImport:true};
    }''')
    page.get_by_label('Move to layer',exact=True).select_option('0')
    assert page.evaluate("cm.customObjects.get('lamp').layerIndex===0")
    page.evaluate('cm.loadStateData(window.groupOriginal);window.hudInstance.refresh()')
    return {**checks,**light,'solidOutline':True}
