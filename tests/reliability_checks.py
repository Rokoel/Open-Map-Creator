"""Frozen lighting, mirror rendering, content-only bounds, monochrome and durable saves."""
def check_export_and_bakes(page):
    original=page.evaluate('cm.getMapData()')
    page.evaluate('window.hudInstance.storageManager.ready=false;clearTimeout(window.hudInstance.storageManager.saveTimer)')
    result=page.evaluate('''async()=>{
      const assert=(v,m)=>{if(!v)throw Error(m);};const {ambientDefaults,lightDefaults,drawScene}=await import('./js/scene.js');
      cm.clearCanvas();cm.activeLayerIndex=0;cm.currentCellSize=32;cm.offsetX=cm.offsetY=0;cm.scale=1;
      cm.layers=[{name:'Reliability',visible:true,objects:new Map([['4_4',{x:4,y:4,type:'color',fillColor:'#335577',borderColor:'#000000'}]]),gridShadowOptions:{enabled:false}}];
      cm.ambientLight={...ambientDefaults,preserveGlobal:true};cm.emptyCellSettings={fillColor:'#224466',borderColor:'#e0e0e0'};cm.exportSettings={colorMode:'color',padding:1};
      cm.customObjects.set('lamp',{...lightDefaults,type:'light',layerIndex:0,x:90,y:144,width:16,height:16,rotation:0,radius:2});cm.rebuildBorderTopology();cm.saveHistory();cm.bakeLighting();
      const cache=cm.bakedLighting,rays=cm.lightingRenderCount;
      const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><path d="M0 0H32V16H0Z" fill="red"/><path d="M32 0H64V16H32Z" fill="blue"/><path d="M0 16H32V32H0Z" fill="green"/><path d="M32 16H64V32H32Z" fill="yellow"/></svg>');await image.decode();
      cm.customObjects.set('art',{type:'image',layerIndex:0,x:600,y:400,width:64,height:32,rotation:0,image,imageSrc:image.src,blocksLight:true});cm.saveHistory();
      const c=document.createElement('canvas');c.width=1000;c.height=800;const x=c.getContext('2d');drawScene(cm,x,{minX:0,minY:0,maxX:1000,maxY:800});
      assert(cm.bakedLighting===cache&&cm.lightingRenderCount===rays,'Adding an object unbakes or recasts lighting');
      cm.customObjects.get('art').x=8000;cm.customObjects.get('art').width=200;cm.saveHistory();
      cm.freeDrawObjects.set('stamp',{x:9000,y:500,size:32,rotation:0,layerIndex:0,fillColor:'#aaa',strokeColor:'#aaa'});cm.saveHistory();
      drawScene(cm,x,{minX:0,minY:0,maxX:1000,maxY:800});assert(cm.bakedLighting===cache&&cm.lightingRenderCount===rays,'Moving/resizing objects or adding stamps unbakes lighting');
      cm.freeDrawObjects.clear();const art=cm.customObjects.get('art');art.x=600;art.width=64;
      cm.setActiveInstrument('select');cm.selectedObjects={grid:[],free:[],custom:['art']};window.hudInstance.refresh();
      return {decorativeBakePreserved:true};
    }''')
    page.get_by_label('Mirror horizontally',exact=True).check()
    pixels=page.evaluate('''()=>{
      const c=document.createElement('canvas');c.width=1000;c.height=800;const x=c.getContext('2d'),old=cm.ctx;cm.ctx=x;cm.drawCustomObject(cm.customObjects.get('art'));cm.ctx=old;
      return [...x.getImageData(584,392,1,1).data];
    }''')
    assert pixels==[0,0,255,255],pixels
    page.get_by_label('Mirror vertically',exact=True).check()
    page.evaluate('''async()=>{
      const c=document.createElement('canvas');c.width=1000;c.height=800;const x=c.getContext('2d'),old=cm.ctx;cm.ctx=x;cm.drawCustomObject(cm.customObjects.get('art'));cm.ctx=old;
      if([...x.getImageData(584,392,1,1).data].join(',')!=='255,255,0,255')throw Error('Vertical mirroring is wrong');
      if(!cm.bakedLighting)throw Error('Mirroring discards baked lighting');
      const preserved=cm.bakedLighting;cm.undo();if(cm.bakedLighting!==preserved)throw Error('Undoing an object edit unbakes lighting');cm.redo();if(cm.bakedLighting!==preserved)throw Error('Redoing an object edit unbakes lighting');
      const saved=JSON.parse(JSON.stringify(cm.getMapData()));cm.loadStateData(saved);
      if(!cm.customObjects.get('art').mirrorX||!cm.customObjects.get('art').mirrorY)throw Error('Mirroring is lost on save/load');
      await cm.customObjects.get('art').image.decode();cm.bakeLighting();
      cm.layers[0].objects.set('5_4',{x:5,y:4,type:'color',fillColor:'#446688',borderColor:'#000000'});cm.saveHistory();
      if(cm.bakedLighting)throw Error('Grid blockers no longer invalidate lighting');
      cm.bakeLighting();cm.customObjects.get('lamp').intensity=.4;cm.saveHistory();if(cm.bakedLighting)throw Error('Light edits no longer invalidate lighting');
      cm.customObjects.delete('art');cm.customObjects.get('lamp').x=100000;cm.customObjects.get('lamp').radius=50;
      const box=cm.getLogicalBoundingBox();if(box.minX!==3||box.maxX!==7||box.minY!==3||box.maxY!==6)throw Error('Invisible light range inflates export: '+JSON.stringify(box));
      cm.customObjects.set('rotated',{layerIndex:0,x:320,y:320,width:64,height:32,rotation:Math.PI/2});
      const rotated=cm.getLogicalBoundingBox();if(Math.abs(rotated.maxX-11.5)>1e-6||rotated.maxY!==12)throw Error('Rotated object bounds are incorrect');
      cm.customObjects.delete('rotated');cm.scale=5;cm.offsetX=9000;cm.offsetY=-8000;
      if(JSON.stringify(cm.getLogicalBoundingBox())!==JSON.stringify(box))throw Error('Camera changes export size');
      cm.scale=1;cm.offsetX=cm.offsetY=0;window.hudInstance.refresh();
      window.pngColorProbe=null;window.originalToBlob=HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob=function(...args){
        const context=this.getContext('2d'),data=context.getImageData(0,0,this.width,this.height).data;let binary=true,black=0,white=0;
        for(let i=0;i<data.length;i+=4){if(data[i]!==data[i+1]||data[i]!==data[i+2]||![0,255].includes(data[i])||data[i+3]!==255)binary=false;if(data[i]===0)black++;if(data[i]===255)white++;}
        window.pngColorProbe={width:this.width,height:this.height,binary,black,white,corner:[...context.getImageData(5,5,1,1).data]};return window.originalToBlob.apply(this,args);
      };
    }''')
    page.locator('#mapToggle').evaluate('()=>window.hudInstance.setMapCollapsed(false)')
    page.locator('#exportColorMode').select_option('bw')
    page.locator('#exportPadding').fill('1.5');page.locator('#exportPadding').press('Tab')
    with page.expect_download():page.locator('#exportPNG').click()
    png=page.evaluate('window.pngColorProbe')
    assert png['binary'] and png['black']>0 and png['white']>0 and png['corner']==[255,255,255,255],png
    assert png['width']==320 and png['height']==256,png
    page.evaluate('()=>{HTMLCanvasElement.prototype.toBlob=window.originalToBlob;}')
    page.locator('#exportPDFPrimary').click()
    assert page.locator('#pdfColorMode').input_value()=='bw'
    assert page.locator('#pdfPadding').input_value()=='1.5'
    if page.evaluate('!!window.jspdf'):
        page.evaluate('''()=>{window.pdfImages=[];window.originalPDF=window.jspdf.jsPDF;window.jspdf.jsPDF=function(...args){const pdf=new window.originalPDF(...args),add=pdf.addImage;pdf.addImage=function(data,...rest){window.pdfImages.push(data);return add.call(this,data,...rest);};return pdf;};}''')
        page.locator('#pdfColorMode').select_option('grayscale')
        page.locator('#pdfDpi').fill('72');page.locator('#pdfCellSize').fill('1')
        with page.expect_download():page.locator('#pdfForm button[type=submit]').click()
        page.evaluate('''async()=>{const image=new Image();image.src=window.pdfImages[0];await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const data=x.getImageData(0,0,c.width,c.height).data;for(let i=0;i<data.length;i+=4)if(data[i]!==data[i+1]||data[i]!==data[i+2])throw Error('PDF is colored');if([...x.getImageData(5,5,1,1).data].join(',')!=='255,255,255,255')throw Error('PDF background is not white');window.jspdf.jsPDF=window.originalPDF;}''')
    else:page.locator('#pdfCancel').click()
    page.evaluate('(data)=>{cm.loadStateData(data);window.hudInstance.refresh();window.hudInstance.storageManager.ready=true;}',original)
    return {**result,'objectMirroring':True,'tightBounds':True,'whiteMonochromePNG':True,'monochromePDF':True}


def check_durable_autosave(page):
    original=page.evaluate('cm.getMapData()')
    result=page.evaluate('''async()=>{
      const s=window.hudInstance.storageManager,{constants}=await import('./js/constants.js');
      s.ready=false;clearTimeout(s.saveTimer);await s.saveQueue;
      cm.clearCanvas();cm.activeLayerIndex=0;cm.layers=[{name:'Large save',visible:true,objects:new Map(),gridShadowOptions:{enabled:false}}];cm.currentCellSize=32;
      cm.customObjectImageSrc=null;cm.customObjects.clear();cm.freeDrawObjects.clear();cm.gridImageList=[];cm.gridDrawSettings={type:'color',fillColor:'#000000',borderColor:'#000000'};cm.freeDrawSettings={size:1,period:0,fillColor:'#000000',strokeColor:'#000000',image:null};
      const source='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><!--'+'x'.repeat(18000)+'--><rect width="32" height="32" fill="#336699"/></svg>'),image=new Image();image.src=source;await image.decode();
      for(let x=0;x<25;x++)for(let y=0;y<20;y++)cm.layers[0].objects.set(`${x}_${y}`,{x,y,type:'image',image,imageSrc:source,borderColor:'#000000',outlineEnabled:false});
      const raw=JSON.stringify(cm.getMapData());let quota=false;try{localStorage.setItem('omc-quota-probe',raw);}catch(error){quota=error.name==='QuotaExceededError';}finally{localStorage.removeItem('omc-quota-probe');}
      if(!quota)throw Error('Quota regression fixture is not large enough');
      s.ready=true;const ok=await s.autoSaveMap();if(!ok)throw Error('IndexedDB cannot save a project larger than localStorage');
      const record=await s.store.read(constants.localStorageKey),packedBytes=JSON.stringify(record.payload).length;
      if(record.payload.assets.length!==1||packedBytes>raw.length/30)throw Error('Repeated textures are not deduplicated');
      return {quotaReproduced:true,largeSave:true,rawBytes:raw.length,packedBytes};
    }''')
    # Restore from actual persistent storage in a fresh document.
    page.reload();page.wait_for_function('window.appReady===true')
    page.evaluate('window.cm=window.hudInstance.canvasManager')
    assert page.evaluate("cm.layers[0].name==='Large save'&&cm.layers[0].objects.size===500")
    page.evaluate("cm.layers[0].objects.get('0_0').image.decode()")
    page.evaluate("cm.layers[0].name='Closed immediately';cm.saveHistory()")
    page.reload();page.wait_for_function('window.appReady===true');page.evaluate('window.cm=window.hudInstance.canvasManager')
    assert page.evaluate("cm.layers[0].name==='Closed immediately'&&cm.layers[0].objects.size===500")
    recovery=page.evaluate('''async()=>{
      const assert=(v,m)=>{if(!v)throw Error(m);};const s=window.hudInstance.storageManager,{constants}=await import('./js/constants.js'),{unpackProject}=await import('./js/project-store.js');
      clearTimeout(s.saveTimer);const originalWrite=s.store.write.bind(s.store),originalSet=Storage.prototype.setItem;
      const before=await s.store.read(constants.localStorageKey);
      s.store.write=async()=>{throw Error('Simulated write failure');};
      Storage.prototype.setItem=function(key,value){if(key===constants.localStorageKey)throw new DOMException('Simulated quota','QuotaExceededError');return originalSet.call(this,key,value);};
      cm.layers[0].objects.get('0_0').fillColor='#112233';const failed=await s.autoSaveMap();
      assert(!failed&&document.getElementById('saveStatus').textContent.includes('failed'),'Failure is reported as saved');
      assert(JSON.stringify(await s.store.read(constants.localStorageKey))===JSON.stringify(before),'Failed transaction destroyed the prior save');
      s.store.write=originalWrite;Storage.prototype.setItem=originalSet;
      assert(await s.autoSaveMap(),'Save does not recover after a storage failure');
      // Serialized writes must preserve the most recently requested snapshot.
      let calls=0;s.store.write=async(...args)=>{if(++calls===1)await new Promise(resolve=>setTimeout(resolve,30));return originalWrite(...args);};
      cm.layers[0].objects.get('0_0').fillColor='#111111';const first=s.autoSaveMap();
      cm.layers[0].objects.get('0_0').fillColor='#222222';const last=s.autoSaveMap();await Promise.all([first,last]);s.store.write=originalWrite;
      assert(unpackProject((await s.store.read(constants.localStorageKey)).payload).layers[0].objects[0][1].fillColor==='#222222','Older save overwrote the newer snapshot');
      // Unreadable legacy data is preserved rather than overwritten by an empty project.
      await s.store.delete(constants.localStorageKey);localStorage.setItem(constants.localStorageKey,'{broken');s.ready=false;await s.autoLoadMap();
      assert(s.loadFailed&&!(await s.autoSaveMap())&&localStorage.getItem(constants.localStorageKey)==='{broken','Corrupt save was silently overwritten');
      // Legacy localStorage projects migrate after durable storage commits.
      const legacy={...cm.getMapData(),layers:[{name:'Migrated legacy',visible:true,objects:[]}]};
      await s.store.delete(constants.localStorageKey);localStorage.setItem(constants.localStorageKey,JSON.stringify(legacy));s.ready=false;s.lastSavedSignature=null;
      await s.autoLoadMap();assert(cm.layers[0].name==='Migrated legacy'&&!localStorage.getItem(constants.localStorageKey),'Legacy project did not migrate');
      assert(!!(await s.store.read(constants.localStorageKey)),'Legacy source removed before durable save');
      // Small projects still save through a browser-storage fallback if IDB is unavailable.
      s.store.write=async()=>{throw Error('IDB unavailable');};cm.layers[0].name='Fallback save';assert(await s.autoSaveMap(),'Small fallback save failed');s.store.write=originalWrite;
      s.ready=false;s.lastSavedSignature=null;await s.autoLoadMap();assert(cm.layers[0].name==='Fallback save','Newer fallback save lost to an older IDB record');
      return {reloadRestored:true,immediateCloseRestored:true,failedWritePreservesSave:true,saveOrdering:true,legacyMigration:true,fallbackRecovery:true,corruptSavePreserved:true};
    }''')
    page.evaluate('''async(data)=>{cm.loadStateData(data);window.hudInstance.refresh();const s=window.hudInstance.storageManager;s.ready=true;s.lastSavedSignature=null;await s.autoSaveMap();}''',original)
    return {**result,**recovery}
