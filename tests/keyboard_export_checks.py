"""Keyboard selection movement and synchronized export settings across state changes."""
from playwright.sync_api import expect


def check_keyboard_and_export_settings(page):
    page.evaluate('''async () => {
      window.keyboardOriginal = cm.getMapData();
      window.keyboardHistory = {entries:[...cm.history], index:cm.historyIndex};
      const {defaultExportSettings,pdfLayout} = await import('./js/pdf-layout.js');
      if(defaultExportSettings().dpi!==300 || pdfLayout().dpi!==300)
        throw Error('Default export resolution must be 300 DPI');
      cm.clearCanvas();cm.currentCellSize=32;cm.scale=.6;
      cm.setActiveInstrument('select');
      cm.layers[0].objects.set('0_0',{x:0,y:0,type:'color',fillColor:'#336699'});
      cm.freeDrawObjects.set('stamp',{x:100,y:100,size:16,layerIndex:0,fillColor:'#336699'});
      const {lightDefaults}=await import('./js/scene.js');
      cm.customObjects.set('lamp',{...lightDefaults,x:200,y:100,type:'light',width:18,height:18,layerIndex:0});
      cm.selectedObjects={grid:['0_0'],free:['stamp'],custom:['lamp']};
      cm.saveHistory();window.hudInstance.refresh();document.activeElement.blur();
    }''')
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowDown')
    page.keyboard.press('Shift+ArrowLeft')
    page.keyboard.press('Shift+ArrowUp')
    assert page.evaluate('''() => cm.layers[0].objects.has('-9_-9') &&
      cm.freeDrawObjects.get('stamp').x===-188 && cm.freeDrawObjects.get('stamp').y===-188 &&
      cm.customObjects.get('lamp').x===-88 && cm.customObjects.get('lamp').y===-188''')
    page.keyboard.press('Control+z')
    assert page.evaluate("cm.customObjects.get('lamp').y===132 && cm.layers[0].objects.has('-9_1')")
    page.keyboard.press('Control+Shift+z')
    assert page.evaluate("cm.customObjects.get('lamp').y===-188 && cm.layers[0].objects.has('-9_-9')")
    # Grid collisions keep mixed selections together and do not add history entries.
    page.evaluate('''() => {
      cm.selectedObjects={grid:['-9_-9'],free:['stamp'],custom:['lamp']};
      cm.layers[0].objects.set('-8_-9',{x:-8,y:-9,type:'color',fillColor:'#336699'});
      cm.saveHistory();window.keyboardIndex=cm.historyIndex;
    }''')
    page.keyboard.press('ArrowRight')
    assert page.evaluate("cm.customObjects.get('lamp').x===-88 && cm.historyIndex===window.keyboardIndex")
    # Native number input arrows and modal dialogs must not move artwork.
    page.evaluate('window.hudInstance.setMapCollapsed(false)')
    page.locator('#exportPadding').focus()
    page.keyboard.press('ArrowUp')
    assert page.evaluate("cm.customObjects.get('lamp').x===-88")
    page.locator('#exportPDFPrimary').click()
    page.locator('#pdfCancel').focus()
    page.keyboard.press('ArrowDown')
    assert page.evaluate("cm.customObjects.get('lamp').y===-188")
    page.locator('#pdfCancel').click()
    page.evaluate('''() => {
      const legacy=cm.getMapData();
      legacy.settings.exportSettings={dpi:150,sheetMargins:{top:0}};
      cm.loadStateData(legacy);
      if(cm.exportSettings.dpi!==150 || cm.exportSettings.sheetMargins.top!==0 || cm.exportSettings.sheetMargins.left!==5)
        throw Error('Saved export settings or missing margin defaults lost');
      delete legacy.settings.exportSettings;
      cm.loadStateData(legacy);window.hudInstance.refresh();
      cm.history=[];cm.historyIndex=-1;cm.saveHistory();
    }''')
    expect(page.locator('#pdfDpi')).to_have_value('300')
    page.locator('#exportPageFields').evaluate("e=>e.closest('details').open=true")
    expect(page.locator('#exportPageFields').get_by_label('Resolution (DPI)',exact=True)).to_have_value('300')
    # Live edits in either location update all four margins, including explicit zero.
    for side, value in [('top','0'),('right','12.5'),('bottom','9'),('left','7')]:
        field=page.get_by_label(f'Sheet {side} margin (mm)',exact=True)
        field.fill(value)
        expect(page.locator(f'#pdfMargin{side.title()}')).to_have_value(value)
        field.press('Tab')
    page.locator('#exportPDFPrimary').click()
    page.locator('#pdfMarginTop').fill('11')
    expect(page.get_by_label('Sheet top margin (mm)',exact=True)).to_have_value('11')
    page.locator('#pdfMarginTop').press('Tab')
    page.locator('#pdfCancel').click()
    field=page.get_by_label('Sheet top margin (mm)',exact=True)
    field.focus()
    page.keyboard.press('Control+z')
    expect(field).to_have_value('0')
    expect(page.locator('#pdfMarginTop')).to_have_value('0')
    page.keyboard.press('Control+Shift+z')
    expect(field).to_have_value('11')
    expect(page.locator('#pdfMarginTop')).to_have_value('11')
    # Padding updates automatic bounds in the editor and PDF dialog together.
    page.locator('#exportPadding').fill('3');page.locator('#exportPadding').press('Tab')
    expect(page.locator('#pdfPadding')).to_have_value('3')
    assert page.evaluate("Number(document.querySelector('#exportAreaFields input').value)===Number(cm.getExportBounds().minX.toFixed(4))")
    page.locator('#exportPDFPrimary').click()
    page.locator('#pdfPadding').fill('2');page.locator('#pdfPadding').press('Tab')
    expect(page.locator('#exportPadding')).to_have_value('2')
    page.locator('#pdfCancel').click()
    # Fitting and undoing the export region refresh the numeric area fields.
    area=page.get_by_label('Left (cells)',exact=True)
    area.fill('123');area.press('Tab')
    page.locator('#resetExportArea').click()
    assert page.evaluate("!cm.exportSettings.region && Number(document.querySelector('#exportAreaFields input').value)!==123")
    page.evaluate('document.activeElement.blur()');page.keyboard.press('Control+z')
    expect(area).to_have_value('123')
    # Restart refreshes controls even with Map settings already expanded.
    page.locator('#restart').evaluate("e=>e.closest('details').open=true")
    page.locator('#restart').click()
    page.locator('#appDialogAccept').click()
    for side in ['top','right','bottom','left']:
        expect(page.get_by_label(f'Sheet {side} margin (mm)',exact=True)).to_have_value('5')
        expect(page.locator(f'#pdfMargin{side.title()}')).to_have_value('5')
    expect(page.locator('#pdfDpi')).to_have_value('300')
    expect(page.locator('#exportPadding')).to_have_value('1')
    assert page.evaluate('cm.exportSettings.dpi===300 && !cm.exportSettings.region')
    page.evaluate('''() => {
      cm.loadStateData(window.keyboardOriginal);cm.history=window.keyboardHistory.entries;
      cm.historyIndex=window.keyboardHistory.index;window.hudInstance.refresh();
      window.hudInstance.setMapCollapsed(true);
    }''')
    return {'arrowMovement':True,'keyboardUndo':True,'collisionProtection':True,
            'defaultDPI':300,'liveMargins':True,'marginUndo':True,'areaReset':True,'restart':True}
