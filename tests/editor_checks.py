"""Regressions for color controls, history, additive cell selection, and hatch joins."""
def check_editor_updates(page):
    page.evaluate('''() => {
      window.editorOriginal=cm.getMapData();
      window.editorHistory={entries:[...cm.history],index:cm.historyIndex};
      cm.clearCanvas();cm.activeLayerIndex=0;cm.scale=1;cm.offsetX=cm.offsetY=0;
      cm.gridDrawSettings={type:'color',fillColor:'#ffffff',borderColor:'#000000'};
      cm.history=[];cm.historyIndex=-1;cm.saveHistory();
      cm.setActiveInstrument('gridDraw');window.hudInstance.refresh();
    }''')
    page.evaluate('window.hudInstance.showPanel("toolPanel")')
    fill=page.locator('#instrumentSettings').get_by_label('Fill',exact=True)
    outline=page.locator('#instrumentSettings').get_by_label('Cell outline',exact=True)
    # Some native color dialogs send change without a preceding input event.
    fill.evaluate("e=>{e.value='#cc4455';e.dispatchEvent(new Event('change',{bubbles:true}));}")
    fill.focus();page.keyboard.press('Control+z')
    assert page.evaluate("cm.gridDrawSettings.fillColor==='#ffffff'")
    page.keyboard.press('Control+Shift+z')
    assert page.evaluate("cm.gridDrawSettings.fillColor==='#cc4455'")
    # Editing after a history restore must target the live settings object.
    outline.evaluate("e=>{e.value='#226699';e.dispatchEvent(new Event('change',{bubbles:true}));}")
    assert page.evaluate("cm.gridDrawSettings.borderColor==='#226699'")
    fill.evaluate("e=>{e.value='#33aa66';e.dispatchEvent(new Event('input',{bubbles:true}));}")
    fill.focus();page.keyboard.press('Control+z')
    assert page.evaluate("cm.gridDrawSettings.fillColor==='#cc4455' && cm.gridDrawSettings.borderColor==='#226699'")
    page.keyboard.press('Control+Shift+z')
    assert page.evaluate("cm.gridDrawSettings.fillColor==='#33aa66'")
    coords=page.evaluate('''() => {
      cm.handleDrawing({x:336,y:336},{});cm.saveHistory();
      const cell=cm.layers[0].objects.get('10_10');
      if(cell.fillColor!=='#33aa66'||cell.borderColor!=='#226699')throw Error('Paint ignores chosen colors');
      for(const [x,y] of [[11,10],[12,10],[10,11],[11,11]])
        cm.layers[0].objects.set(`${x}_${y}`,{...cell,x,y});
      cm.saveHistory();cm.setActiveInstrument('select');cm.selectedObjects.grid=['12_10'];
      window.selectionBefore=JSON.stringify([...cm.layers[0].objects]);
      window.selectionHistory=cm.historyIndex;
      window.hudInstance.refresh();
      const rect=cm.canvas.getBoundingClientRect();return {x:rect.x,y:rect.y};
    }''')
    page.keyboard.down('Shift');page.mouse.move(coords['x']+322,coords['y']+322);page.mouse.down()
    page.mouse.move(coords['x']+383,coords['y']+383,steps=6);page.mouse.up();page.keyboard.up('Shift')
    selection = page.evaluate("({same:JSON.stringify([...cm.layers[0].objects])===window.selectionBefore, selected:cm.selectedObjects, history:cm.historyIndex, before:window.selectionHistory, size:cm.currentCellSize, visible:cm.layers[0].visible})")
    assert selection['same'] and len(selection['selected']['grid'])==5 and selection['history']==selection['before'], selection
    # A single click starts a potential move, but must not consume an undo step.
    page.mouse.click(coords['x']+336,coords['y']+336)
    assert page.evaluate('cm.historyIndex===window.selectionHistory')
    page.evaluate('''() => {
      cm.selectedObjects.grid=['10_10'];cm.gridMoveRemainder={x:0,y:0};
      cm.moveSelection(32,0);
      if(JSON.stringify([...cm.layers[0].objects])!==window.selectionBefore)throw Error('Moving onto occupied cells overwrites them');
    }''')
    results=page.evaluate('''async () => {
      const assert=(v,m)=>{if(!v)throw Error(m);};
      const {borderArtwork,buildBorderTopology,borderDefaults}=await import('./js/borders.js');
      const topology=buildBorderTopology(cm.layers),opts={...borderDefaults,width:.8};
      const hatch=borderArtwork(topology,opts),blocks=hatch.stats.blocks;
      assert(hatch.stats.connections>hatch.stats.strokes,'Too few connections between patches');
      for(const block of blocks) {
        const first=block[0],dx=first.b.x-first.a.x,dy=first.b.y-first.a.y;
        for(const {a,b} of block)assert(Math.abs(dx*(b.y-a.y)-dy*(b.x-a.x))<1e-8,'Block strokes change direction');
      }
      const geometry=art=>JSON.stringify(art.stats.blocks);
      const regular=borderArtwork(topology,{...opts,hatchRandomness:0});
      assert(geometry(regular)!==geometry(hatch),'Randomness does not affect geometry');
      assert(geometry(borderArtwork(topology,{...opts,hatchAngle:80}))!==geometry(hatch),'Angle does not affect layout');
      const dense=borderArtwork(topology,{...opts,hatchBlockDensity:2});
      assert(dense.stats.chunks>hatch.stats.chunks*1.3,'Block density does not add blocks');
      assert(dense.stats.strokes===dense.stats.chunks*borderDefaults.hatchStrokes,'Block density changed internal stroke count');
      const canvas=document.createElement('canvas');canvas.width=200;canvas.height=160;
      const ctx=canvas.getContext('2d'),cells=new Map([
        ['1_1',{x:1,y:1}],['2_1',{x:2,y:1,castsShadow:false}]]);
      const shadow={enabled:true,angle:0,offset:3,color:'#000000',softness:.12};
      cm.drawGridShadows(ctx,32,{},cells,shadow);
      assert(ctx.getImageData(80,48,1,1).data[3]===0,'Disabling casting exposes a cell to shadows');
      cells.get('2_1').receivesShadow=true;ctx.clearRect(0,0,200,160);
      cm.drawGridShadows(ctx,32,{},cells,shadow);
      assert(ctx.getImageData(80,48,1,1).data[3]>230,'Explicit shadow receiving fails');
      const saved=cm.getMapData();saved.layers[0].objects[0][1].receivesShadow=true;
      cm.loadStateData(saved);assert([...cm.layers[0].objects.values()][0].receivesShadow===true,'Receiver flag lost on load');
      return {colors:true,keyboardUndo:true,additiveSelection:true,collisionProtection:true,hatchBlocks:hatch.stats.chunks,shadowReceiving:true};
    }''')
    page.evaluate('window.hudInstance.showPanel("appearancePanel")')
    page.locator('#borderStyle').select_option('hatch')
    page.locator('#hatchAngle').fill('63');page.locator('#hatchAngle').press('Tab')
    page.locator('#hatchRandomness').evaluate("e=>{e.value='0';e.dispatchEvent(new Event('change',{bubbles:true}));}")
    controls=page.evaluate("({angle:cm.gridBorderOptions.hatchAngle,randomness:cm.gridBorderOptions.hatchRandomness})")
    assert controls=={'angle':63,'randomness':0}, controls
    page.evaluate('''() => {
      cm.loadStateData(window.editorOriginal);cm.history=window.editorHistory.entries;
      cm.historyIndex=window.editorHistory.index;window.hudInstance.refresh();
    }''')
    return results
