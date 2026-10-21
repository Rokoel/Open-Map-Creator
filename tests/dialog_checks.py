"""In-app confirmations, notifications, and numeric prompts."""
import json
from playwright.sync_api import expect


def check_dialogs(page):
    original=page.evaluate('cm.getMapData()')
    page.evaluate('''() => {
      window.dialogHistory={entries:[...cm.history],index:cm.historyIndex};
      cm.clearCanvas();cm.currentCellSize=32;
      cm.layers[0].objects.set('0_0',{x:0,y:0,type:'color',fillColor:'#336699'});
      cm.setActiveInstrument('select');cm.selectedObjects={grid:['0_0'],free:[],custom:[]};
      cm.saveHistory();window.hudInstance.refresh();window.hudInstance.setMapCollapsed(false);
      document.querySelector('#clearCanvas').closest('details').open=true;
    }''')
    page.locator('#clearCanvas').click()
    expect(page.get_by_role('dialog',name='Clear artwork',exact=True)).to_be_visible()
    expect(page.locator('#appDialogCancel')).to_be_focused()
    # Global shortcuts are inactive while answering, including Escape deselection.
    page.keyboard.press('v');page.keyboard.press('Delete');page.keyboard.press('ArrowRight')
    assert page.evaluate("cm.layers[0].objects.has('0_0') && cm.activeInstrument==='select'")
    page.keyboard.press('Escape')
    expect(page.locator('#appDialog')).not_to_be_visible()
    assert page.evaluate("cm.selectedObjects.grid[0]==='0_0'")
    expect(page.locator('#clearCanvas')).to_be_focused()
    page.locator('#clearCanvas').click();page.locator('#appDialogAccept').click()
    page.wait_for_function('cm.layers[0].objects.size===0')
    page.evaluate('document.activeElement.blur()');page.keyboard.press('Control+z')
    assert page.evaluate("cm.layers[0].objects.has('0_0')")
    # Layer deletion is also deferred until accepted.
    page.evaluate("cm.addLayer();window.hudInstance.chooseTool('layers')")
    page.locator('#removeLayer').click();page.locator('#appDialogCancel').click()
    assert page.evaluate('cm.layers.length')==2
    page.locator('#removeLayer').click();page.locator('#appDialogAccept').click()
    page.wait_for_function('cm.layers.length===1')
    # Last-layer errors appear inside the app, and long text fits a mobile dialog.
    page.evaluate('cm.removeActiveLayer()')
    expect(page.locator('#appDialogMessage')).to_have_text('Cannot remove the last layer.')
    page.set_viewport_size({'width':390,'height':844})
    box=page.locator('#appDialog').bounding_box()
    assert box['x']>=0 and box['x']+box['width']<=390
    page.keyboard.press('Enter')
    expect(page.locator('#appDialog')).not_to_be_visible()
    page.set_viewport_size({'width':1440,'height':1000})
    page.evaluate('window.hudInstance.setMapCollapsed(false)')
    # Import cancellation leaves the current map; acceptance loads the chosen data.
    imported=page.evaluate('''() => {
      const data=cm.getMapData();data.layers[0].name='Imported map';return data;
    }''')
    for accept in [False,True]:
        with page.expect_file_chooser() as chooser:
            page.locator('#importMap').click()
        chooser.value.set_files({'name':'map.json','mimeType':'application/json',
                                 'buffer':json.dumps(imported).encode()})
        expect(page.get_by_role('dialog',name='Open map',exact=True)).to_be_visible()
        if accept:
            page.locator('#appDialogAccept').click()
            page.wait_for_function("cm.layers[0].name==='Imported map'")
        else:
            page.locator('#appDialogCancel').click()
            assert page.evaluate("cm.layers[0].name!=='Imported map'")
    with page.expect_file_chooser() as chooser:
        page.locator('#importMap').click()
    chooser.value.set_files({'name':'broken.json','mimeType':'application/json','buffer':b'{}'})
    expect(page.locator('#appDialogMessage')).to_contain_text('Failed to import map:')
    page.locator('#appDialogAccept').click()
    # Numeric prompts show inline validation and return null on Escape.
    page.evaluate('''async () => {
      const {askNumber}=await import('./js/dialogs.js');window.dialogAnswer='pending';
      askNumber('Object width (cells)',2).then(value=>window.dialogAnswer=value);
    }''')
    expect(page.locator('#appDialogInput')).to_be_focused()
    for value in ['', '0', '-1']:
        page.locator('#appDialogInput').fill(value);page.locator('#appDialogAccept').click()
        expect(page.locator('#appDialogError')).to_be_visible()
        assert page.evaluate('window.dialogAnswer')=='pending'
    page.locator('#appDialogInput').fill('2.75');page.keyboard.press('Enter')
    page.wait_for_function('window.dialogAnswer===2.75')
    page.evaluate('''async () => {
      const {askNumber}=await import('./js/dialogs.js');window.dialogAnswer='pending';
      askNumber('Object height (cells)',2).then(value=>window.dialogAnswer=value);
    }''')
    expect(page.locator('#appDialog')).to_be_visible();page.keyboard.press('Escape')
    page.wait_for_function('window.dialogAnswer===null')
    # Queued errors preserve their messages; HTML in file/layer names stays text.
    page.evaluate('''async () => {
      const {showAlert}=await import('./js/dialogs.js');window.dialogAnswers=[];
      showAlert('<img src=x onerror=alert(1)>').then(value=>window.dialogAnswers.push(value));
      showAlert('Second message').then(value=>window.dialogAnswers.push(value));
    }''')
    expect(page.locator('#appDialogMessage')).to_have_text('<img src=x onerror=alert(1)>')
    assert page.locator('#appDialogMessage img').count()==0
    page.locator('#appDialogAccept').click()
    expect(page.locator('#appDialogMessage')).to_have_text('Second message')
    page.locator('#appDialogAccept').click()
    page.wait_for_function('window.dialogAnswers.length===2')
    page.evaluate('''data => {
      cm.loadStateData(data);cm.history=window.dialogHistory.entries;
      cm.historyIndex=window.dialogHistory.index;window.hudInstance.refresh();
      window.hudInstance.setMapCollapsed(true);cm.render();
    }''',original)
    return {'confirmCancel':True,'keyboardIsolation':True,'focusRestored':True,
            'importChoice':True,'errors':True,'numericValidation':True,'queuedAlerts':True,'mobile':True}
