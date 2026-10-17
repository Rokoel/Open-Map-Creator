"""Regression checks for editable layer names and paired border uploads."""
def check_texture_updates(page):
    page.evaluate('window.hudInstance.chooseTool("layers")')
    page.evaluate('''() => {
      window.textureOriginal=cm.getMapData();cm.clearCanvas();
      cm.layers=[{name:'Bottom',visible:true,objects:new Map(),gridShadowOptions:{enabled:false,angle:45,offset:.5,color:'#00000080'}},{name:'Top',visible:true,objects:new Map(),gridShadowOptions:{enabled:false,angle:45,offset:.5,color:'#00000080'}}];
      cm.activeLayerIndex=1;cm.saveHistory();window.hudInstance.refresh();
    }''')
    # Double-clicking an inactive layer must survive the activation click.
    page.get_by_role('button',name='Bottom',exact=True).dblclick()
    page.get_by_role('textbox',name='Layer name',exact=True).fill('Dungeon walls')
    page.evaluate('window.hudInstance.updateLayerList()')
    assert page.get_by_role('textbox',name='Layer name',exact=True).input_value()=='Dungeon walls'
    page.get_by_role('textbox',name='Layer name',exact=True).press('Enter')
    assert page.evaluate('cm.layers[0].name')=='Dungeon walls'
    page.keyboard.press('Control+z')
    assert page.evaluate('cm.layers[0].name')=='Bottom'
    page.keyboard.press('Control+Shift+z')
    assert page.evaluate('cm.layers[0].name')=='Dungeon walls'
    page.get_by_role('button',name='Rename Dungeon walls',exact=True).click()
    page.get_by_role('textbox',name='Layer name',exact=True).fill('Cancelled')
    page.get_by_role('textbox',name='Layer name',exact=True).press('Escape')
    assert page.evaluate('cm.layers[0].name')=='Dungeon walls'
    page.get_by_role('button',name='Rename Dungeon walls',exact=True).click()
    page.get_by_role('textbox',name='Layer name',exact=True).fill('Renamed on blur')
    page.locator('[data-instrument=select]').click()
    assert page.evaluate('cm.layers[0].name')=='Renamed on blur'
    result=page.evaluate('''async () => {
      const {drawBorders,contourRuns,buildBorderTopology,borderDefaults,borderArtwork}=await import('./js/borders.js');
      const assert=(value,message)=>{if(!value)throw Error(message);};
      const load=svg=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src='data:image/svg+xml;base64,'+btoa(svg);});
      const edge=await load('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><path fill="#1144cc" d="M0 0H64V16H0z"/><path fill="#cc3311" d="M0 16H64V32H0z"/></svg>');
      const corner=await load('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#880011" d="M0 0H16V16H0z"/><path fill="#008811" d="M16 0H32V16H16z"/><path fill="#001188" d="M0 16H16V32H0z"/><path fill="#ddaa00" d="M16 16H32V32H16z"/></svg>');
      const cells=new Map();for(let x=4;x<7;x++)for(let y=4;y<7;y++)cells.set(`${x}_${y}`,{x,y,type:'color',fillColor:'#eeeeee',borderColor:'#dddddd'});
      const canvas=document.createElement('canvas');canvas.width=400;canvas.height=400;const ctx=canvas.getContext('2d'),bounds={minX:0,minY:0,maxX:400,maxY:400};
      const pixel=(x,y)=>[...ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data];
      const rgb=(x,y,color)=>{const actual=pixel(x,y);assert(actual.slice(0,3).join(',')===color,'Unexpected tile at '+x+','+y+': '+actual);};
      cm.gridBorderOptions={...borderDefaults,enabled:true,style:'image',width:.5,image:edge,imageSrc:edge.src};
      drawBorders(cm,ctx,cells,32,bounds);assert(!ctx.getImageData(0,0,400,400).data.some(v=>v),'A custom pattern must wait for both assets');
      cm.gridBorderOptions.cornerImage=corner;cm.gridBorderOptions.cornerImageSrc=corner.src;
      drawBorders(cm,ctx,cells,32,bounds);
      rgb(150,114,'17,68,204');rgb(150,125,'204,51,17');
      rgb(226,150,'204,51,17');rgb(238,150,'17,68,204');
      rgb(150,226,'204,51,17');rgb(126,150,'204,51,17');
      const topology=buildBorderTopology([{visible:true,objects:cells}]),runs=contourRuns(topology.contours[0]);
      assert(runs.length===4,'A rectangle must use four straight edge runs');
      for(let i=0;i<runs.length;i++){
        const previous=runs[(i+runs.length-1)%runs.length],next=runs[i],p=next.a;
        const x=(p.x+previous.ty*.125+next.ty*.375)*32,y=(p.y-previous.tx*.125-next.tx*.375)*32;
        rgb(x,y,'0,136,17');
      }
      const lshape=new Map([['4_4',{x:4,y:4,type:'color',fillColor:'#eee',borderColor:'#ddd'}],['5_4',{x:5,y:4,type:'color',fillColor:'#eee',borderColor:'#ddd'}],['4_5',{x:4,y:5,type:'color',fillColor:'#eee',borderColor:'#ddd'}]]);
      ctx.clearRect(0,0,400,400);drawBorders(cm,ctx,lshape,32,bounds);rgb(172,164,'0,136,17');
      assert(pixel(145,145)[3]===0,'Custom tiles must not paint inside grid cells');
      cm.layers[0].objects=lshape;cm.layers[1].visible=false;cm.rebuildBorderTopology();
      const exported=document.createElement('canvas'),bbox=cm.getLogicalBoundingBox();exported.width=Math.ceil(bbox.width*32);exported.height=Math.ceil(bbox.height*32);
      const ec=exported.getContext('2d');ec.scale(32,32);ec.translate(-bbox.minX,-bbox.minY);cm.drawAll(ec,32);
      const color=[...ec.getImageData(172-bbox.minX*32,164-bbox.minY*32,1,1).data];assert(color[1]===136&&color[0]===0,'Export lost or changed a corner tile');
      const serialized=JSON.parse(JSON.stringify(cm.getMapData()));
      assert(typeof serialized.layers[cm.activeLayerIndex].gridBorderOptions.image==='string' && typeof serialized.layers[cm.activeLayerIndex].gridBorderOptions.cornerImage==='string','Both assets must serialize as image data');
      cm.loadStateData(serialized);
      await Promise.all([cm.gridBorderOptions.image,cm.gridBorderOptions.cornerImage].map(image=>image.decode()));
      ctx.clearRect(0,0,400,400);drawBorders(cm,ctx,lshape,32,bounds);rgb(172,164,'0,136,17');
      const translucent=await load('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#773399" opacity=".5"/></svg>');
      cm.gridBorderOptions.image=translucent;cm.gridBorderOptions.cornerImage=translucent;
      ctx.clearRect(0,0,400,400);drawBorders(cm,ctx,lshape,32,bounds);
      const alpha=pixel(172,164)[3];assert(alpha>=127&&alpha<=129,'Semitransparent joins were painted more than once: '+alpha);
      // Dense diagonal shading is deterministic, and has no branching strokes.
      cm.gridBorderOptions={...borderDefaults,enabled:true,style:'hatch',density:60,width:.6};
      ctx.clearRect(0,0,400,400);drawBorders(cm,ctx,cells,32,bounds);const first=canvas.toDataURL();
      ctx.clearRect(0,0,400,400);drawBorders(cm,ctx,cells,32,bounds);assert(first===canvas.toDataURL(),'Pencil strokes changed between renders');
      const strip=ctx.getImageData(140,112,68,14).data;let shaded=0;for(let i=3;i<strip.length;i+=4)if(strip[i]>0)shaded++;
      assert(shaded>68*14*.65,'Pencil shading is not dense enough');
      return {renaming:true,cornerRotations:4,concaveCorner:true,joinAlpha:alpha,shadedPixels:shaded};
    }''')
    # Real uploads expose separate previews and prompt for the missing companion.
    page.evaluate('window.hudInstance.showPanel("appearancePanel")')
    page.locator('#customBorderSettings').evaluate('(element)=>element.open=true')
    page.locator('#borderPattern').set_input_files('assets/border-patterns/edge-example.svg')
    page.wait_for_function('cm.gridBorderOptions.image?.complete && cm.gridBorderOptions.style==="image"')
    assert 'corner' in page.locator('#borderUploadStatus').inner_text().lower()
    page.locator('#borderCornerPattern').set_input_files('assets/border-patterns/corner-example.svg')
    page.wait_for_function('!!cm.gridBorderOptions.cornerImageSrc && cm.gridBorderOptions.cornerImage?.complete')
    assert 'ready' in page.locator('#borderUploadStatus').inner_text().lower()
    assert page.locator('#borderCornerPatternPreview').is_visible()
    page.evaluate('cm.loadStateData(window.textureOriginal);window.hudInstance.refresh()')
    return result
