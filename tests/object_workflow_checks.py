"""Reusable object images, group resizing, tool-preserving layers and right-drag erasing."""
from playwright.sync_api import expect


def check_object_workflows(page):
    original=page.evaluate('cm.getMapData()')
    history=page.evaluate('({entries:cm.history,index:cm.historyIndex})')
    page.evaluate('''() => {
      cm.clearCanvas();cm.objectImageList=[];cm.customObjectImage=cm.customObjectImageSrc=null;
      cm.offsetX=cm.offsetY=0;cm.scale=1;cm.currentCellSize=32;cm.setActiveLayer(0);
      window.hudInstance.setMapCollapsed(true);window.hudInstance.chooseTool('addObject');
    }''')
    for name,color in [('Chair.svg','#aa3300'),('Table.svg','#0033aa')]:
        page.locator('#instrumentSettings input[type=file]').set_input_files({
            'name':name,'mimeType':'image/svg+xml',
            'buffer':f'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24"><rect width="40" height="24" fill="{color}"/></svg>'.encode()})
        expect(page.locator('.object-library').get_by_role('button',name=name,exact=True)).to_have_attribute('aria-pressed','true')
    assert page.locator('.object-asset').count()==2
    page.locator('.object-library').get_by_role('button',name='Chair.svg',exact=True).click()
    page.mouse.click(450,350)
    page.locator('.object-library').get_by_role('button',name='Table.svg',exact=True).click()
    page.mouse.click(550,350)
    assert page.evaluate('new Set([...cm.customObjects.values()].map(o=>o.imageSrc)).size')==2
    # Library assets and the selection survive a real save/reload.
    page.evaluate('window.hudInstance.storageManager.autoSaveMap()')
    page.reload();page.wait_for_function('window.appReady===true')
    page.evaluate('window.cm=window.hudInstance.canvasManager;window.hudInstance.chooseTool("addObject")')
    assert page.locator('.object-asset').count()==2
    expect(page.locator('.object-library').get_by_role('button',name='Table.svg',exact=True)).to_have_attribute('aria-pressed','true')
    page.locator('.object-library').get_by_role('button',name='Chair.svg',exact=True).click()
    page.mouse.click(650,350)
    assert page.evaluate("[...cm.customObjects.values()].at(-1).imageSrc===cm.objectImageList[0].src")
    # Clear artwork retains uploaded assets; legacy saves recover placed images.
    page.evaluate('''() => {
      const legacy=cm.getMapData();delete legacy.settings.objectImageList;cm.loadStateData(legacy);
      if(cm.objectImageList.length!==2)throw Error('Legacy object images missing from picker');
      cm.clearCanvas();if(cm.objectImageList.length!==2)throw Error('Clearing artwork deleted uploads');
      window.hudInstance.refresh();
    }''')
    # Layer controls change only the active layer, leaving the brush and its settings intact.
    page.locator('[data-instrument=freeDraw]').click()
    page.evaluate('cm.freeDrawSettings.size=2.5')
    page.locator('[data-instrument=layers]').click()
    assert page.evaluate("cm.activeInstrument==='freeDraw'")
    page.locator('#addLayer').click()
    page.get_by_role('button',name='Layer 1',exact=True).click()
    page.locator('#layerUp').click()
    assert page.evaluate("cm.activeInstrument==='freeDraw' && cm.freeDrawSettings.size===2.5")
    page.get_by_role('button',name='Rename Layer 1',exact=True).click()
    page.get_by_label('Layer name',exact=True).fill('Artwork');page.get_by_label('Layer name',exact=True).press('Enter')
    assert page.evaluate("cm.activeInstrument==='freeDraw'")
    page.mouse.click(650,350)
    assert page.evaluate('cm.freeDrawObjects.size>0')
    # Heterogeneous, individually rotated members scale about the opposite corner.
    page.evaluate('''async () => {
      const {lightDefaults,ambientDefaults}=await import('./js/scene.js');
      cm.clearCanvas();cm.activeLayerIndex=0;cm.layers[0].visible=true;cm.ambientLight={...ambientDefaults};
      cm.customObjects.set('a',{x:460,y:360,width:50,height:30,rotation:.2,layerIndex:0});
      cm.customObjects.set('b',{x:600,y:400,width:40,height:70,rotation:-.4,layerIndex:0});
      cm.customObjects.set('light',{...lightDefaults,type:'light',x:560,y:350,width:18,height:18,rotation:0,layerIndex:0});
      cm.freeDrawObjects.set('stamp',{x:500,y:420,size:24,rotation:.3,fillColor:'#336699',strokeColor:'#336699',layerIndex:0});
      window.hudInstance.chooseTool('select');cm.selectedObjects={grid:[],free:['stamp'],custom:['a','b','light']};
      cm.groupSelection();cm.setGroupRotation(30);cm.saveHistory();window.hudInstance.refresh();
      window.resizeFrame=cm.selectionGroup();window.resizeBefore=cm.selectedMembers().map(m=>({kind:m.kind,id:m.id,...m.obj}));
    }''')
    assert page.evaluate('cm.handlePoints(cm.selectionGroup()).length')==9
    points=page.evaluate('''() => {
      const f=cm.selectionGroup(),p=cm.handlePoints(f)[4],a=cm.handlePoints(f)[0];
      return {p,a,target:{x:a.x+(p.x-a.x)*1.25,y:a.y+(p.y-a.y)*1.25}};
    }''')
    page.mouse.move(points['p']['x'],points['p']['y']);page.mouse.down()
    page.mouse.move(points['target']['x'],points['target']['y'],steps=5);page.mouse.up()
    page.evaluate('''() => {
      const f=cm.selectionGroup(),a=cm.handlePoints(f)[0],old=cm.handlePoints(window.resizeFrame)[0];
      if(Math.hypot(a.x-old.x,a.y-old.y)>1e-6)throw Error('Resize anchor moved');
      const ratio=f.width/window.resizeFrame.width;
      if(Math.abs(ratio-1.25)>.01)throw Error('Group resize scale incorrect');
      window.actualResizeRatio=ratio;
      for(const before of window.resizeBefore){
        const obj=(before.kind==='free'?cm.freeDrawObjects:cm.customObjects).get(before.id);
        for(const key of ['width','height','size','radius'])if(Number.isFinite(before[key])&&Math.abs(obj[key]-before[key]*ratio)>1e-6)throw Error('Group member size did not scale: '+key);
        if(obj.rotation!==before.rotation||obj.groupId!==before.groupId)throw Error('Resize changed grouping or orientation');
      }
      window.resizedWidth=f.width;
    }''')
    page.evaluate('document.activeElement.blur()');page.keyboard.press('Control+z')
    assert page.evaluate("Math.abs(cm.customObjects.get('a').width-50)<1e-6")
    page.keyboard.press('Control+Shift+z')
    assert page.evaluate("Math.abs(cm.customObjects.get('a').width-50*window.actualResizeRatio)<1e-6")
    page.evaluate("cm.selectedObjects={grid:[],free:['stamp'],custom:['a','b','light']};window.hudInstance.refresh()")
    # Numeric fields and side double-clicks resize the same group.
    width=page.get_by_label('Group width (cells)',exact=True)
    target=page.evaluate('cm.selectionGroup().width/cm.currentCellSize*1.2')
    width.fill(str(target));width.press('Tab')
    assert page.evaluate('Math.abs(cm.selectionGroup().width-window.resizedWidth*1.2)<1e-6')
    side=page.evaluate('cm.handlePoints(cm.selectionGroup())[1]')
    page.mouse.dblclick(side['x'],side['y'])
    page.locator('#appDialogInput').fill('8');page.locator('#appDialogAccept').click()
    page.wait_for_function('Math.abs(cm.selectionGroup().width/cm.currentCellSize-8)<1e-6')
    # One right-drag deletes every artwork kind only from the active visible layer.
    page.evaluate('''async () => {
      const {lightDefaults}=await import('./js/scene.js');cm.clearCanvas();cm.activeLayerIndex=0;
      cm.layers[0].visible=cm.layers[1].visible=true;cm.offsetX=cm.offsetY=0;cm.scale=1;
      for(const layer of cm.layers)layer.objects.set('10_12',{x:10,y:12,type:'color',fillColor:'#336699'});
      for(const layerIndex of [0,1]){
        cm.freeDrawObjects.set('stamp'+layerIndex,{x:400,y:400,size:20,rotation:0,fillColor:'#336699',layerIndex});
        cm.customObjects.set('image'+layerIndex,{x:450,y:400,width:20,height:20,rotation:.5,layerIndex});
        cm.customObjects.set('polygon'+layerIndex,{type:'polygon',x:550,y:400,width:30,height:30,rotation:0,layerIndex,
          vertices:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:0,y:.5}],fillColor:'#336699'});
        cm.customObjects.set('lamp'+layerIndex,{...lightDefaults,type:'light',x:650,y:400,width:18,height:18,rotation:0,layerIndex});
      }
      window.hudInstance.chooseTool('pan');window.hudInstance.setMapCollapsed(true);
      cm.saveHistory();window.eraseIndex=cm.historyIndex;
      cm.canvas.addEventListener('contextmenu',e=>window.contextSuppressed=e.defaultPrevented,{once:true});
    }''')
    assert page.locator('[data-instrument=erase]').count()==0
    page.mouse.move(330,400);page.mouse.down(button='right');page.mouse.move(670,400);page.mouse.up(button='right')
    assert page.evaluate("cm.activeInstrument==='pan' && cm.layers[0].objects.size===0 && cm.layers[1].objects.size===1")
    assert page.evaluate("[...cm.customObjects.values(),...cm.freeDrawObjects.values()].every(o=>o.layerIndex===1) && cm.historyIndex===window.eraseIndex+1 && window.contextSuppressed")
    page.keyboard.press('Control+z')
    assert page.evaluate('cm.customObjects.size===6 && cm.freeDrawObjects.size===2 && cm.layers[0].objects.size===1')
    page.keyboard.press('Control+Shift+z')
    assert page.evaluate('cm.customObjects.size===3 && cm.freeDrawObjects.size===1')
    for tool in ['gridDraw','freeDraw','polygon','addObject','select','light','pan']:
        page.locator(f'[data-instrument={tool}]').click()
        page.evaluate("cm.customObjects.set('erase-me',{x:500,y:550,width:30,height:30,rotation:0,layerIndex:0})")
        page.mouse.click(500,550,button='right')
        assert page.evaluate("!cm.customObjects.has('erase-me')")
        assert page.evaluate('cm.activeInstrument')==tool
    page.evaluate('''() => {
      cm.layers[0].visible=false;cm.layers[0].objects.set('15_17',{x:15,y:17,type:'color',fillColor:'#336699'});
      cm.saveHistory();window.eraseIndex=cm.historyIndex;
    }''')
    page.mouse.click(500,550,button='right')
    assert page.evaluate("cm.layers[0].objects.has('15_17') && cm.historyIndex===window.eraseIndex")
    page.evaluate('''data => {
      cm.loadStateData(data);window.hudInstance.showingLayers=false;window.hudInstance.refresh();cm.render();
    }''',original)
    page.evaluate('''history => {cm.history=history.entries;cm.historyIndex=history.index;}''',history)
    return {'objectLibrary':True,'libraryReload':True,'legacyLibrary':True,'toolPreserved':True,
            'groupHandles':True,'groupNumericSize':True,'groupUndo':True,'rightErase':True,'perLayerErase':True}
