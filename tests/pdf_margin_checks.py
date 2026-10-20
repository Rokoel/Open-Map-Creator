"""Per-sheet PDF margins preserve raster pixels and their physical print scale."""
from playwright.sync_api import expect


def check_pdf_margins(page):
    page.evaluate('''() => {
      window.marginOriginal=cm.getMapData();
      window.marginHistory={entries:[...cm.history],index:cm.historyIndex};
    }''')
    result = page.evaluate('''async () => {
      const assert=(value,message)=>{if(!value)throw Error(message);};
      const {pdfLayout,pdfTiles}=await import('./js/pdf-layout.js');
      const {exportPageSize}=await import('./js/editor-controls.js');
      const zero={top:0,right:0,bottom:0,left:0};
      let layouts=0;
      for(const paper of ['A4','A3']) for(const orientation of ['portrait','landscape'])
        for(const dpi of [36,150,600]) for(const sheetMargins of [zero,{top:11,right:13,bottom:17,left:7}]) {
          const layout=pdfLayout({paper,orientation,dpi,cellSize:1.37,sheetMargins});
          const width=Math.ceil(layout.exportScale*47.25),height=Math.ceil(layout.exportScale*32.125);
          const tiles=[...pdfTiles(layout,width,height)];
          assert(tiles.reduce((sum,t)=>sum+t.sourceWidth*t.sourceHeight,0)===width*height,'Tile coverage loses pixels');
          for(const t of tiles) {
            assert(t.xMM===sheetMargins.left&&t.yMM===sheetMargins.top,'Margin placement wrong');
            assert(Math.abs(t.widthMM/t.sourceWidth-25.4/dpi)<1e-10,'Horizontal pixel print scale changes');
            assert(Math.abs(t.heightMM/t.sourceHeight-25.4/dpi)<1e-10,'Vertical pixel print scale changes');
            assert(t.xMM+t.widthMM<=layout.widthMM-sheetMargins.right+1e-8,'Tile enters right margin');
            assert(t.yMM+t.heightMM<=layout.heightMM-sheetMargins.bottom+1e-8,'Tile enters bottom margin');
          }
          layouts++;
        }
      let invalid=false;
      try{pdfLayout({sheetMargins:{left:-1}});}catch(e){invalid=true;}
      assert(invalid,'Negative margins accepted');invalid=false;
      try{pdfLayout({sheetMargins:{top:Infinity}});}catch(e){invalid=true;}
      assert(invalid,'Invalid margin accepted');
      const normal=pdfLayout({});
      assert(normal.margins.top===5&&normal.margins.bottom===5,'Printer margin defaults missing');
      assert(Math.abs(normal.cellSizeCM*10/normal.exportScale-25.4/normal.dpi)<1e-10,'Cell physical size changed');
      const originalJSPDF=window.jspdf,Original=originalJSPDF?.jsPDF,drawAll=cm.drawAll;
      let capture,source;
      function Spy(options) {
        capture={options,tiles:[],pages:1,saved:false};
        const doc=Original?new Original(options):{addPage(){},addImage(){}};
        const add=doc.addImage,addPage=doc.addPage;
        doc.addImage=function(image,type,x,y,width,height,...rest){
          capture.tiles.push({image,x,y,width,height});return add.call(this,image,type,x,y,width,height,...rest);
        };
        doc.addPage=function(...args){capture.pages++;return addPage.apply(this,args);};
        doc.save=function(){capture.saved=true;if(Original)capture.pdf=this.output();};
        return doc;
      }
      try {
        window.jspdf={...originalJSPDF,jsPDF:Spy};
        cm.drawAll=function(ctx){
          const {width,height}=ctx.canvas,data=ctx.createImageData(width,height);
          for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const i=(y*width+x)*4;data.data[i]=(x*17+y*3)%256;
            data.data[i+1]=(y*13+x*7)%256;data.data[i+2]=(x+y*23)%256;data.data[i+3]=255;
          }
          ctx.putImageData(data,0,0);source=ctx.canvas.toDataURL();
        };
        cm.exportSettings={colorMode:'color',padding:0,region:{minX:-2.25,minY:1.5,maxX:27.75,maxY:23.5}};
        const options={orientation:'landscape',paper:'A4',dpi:36,cellSize:1,sheetMargins:{top:11,right:13,bottom:17,left:7}};
        const layout=pdfLayout(options),bounds=JSON.stringify(cm.getExportBounds());
        window.hudInstance.storageManager.exportPDF(options);
        assert(capture.saved&&capture.pages===4&&capture.tiles.length===4,'PDF missing pages');
        assert(capture.options.unit==='mm'&&capture.options.format[0]===297&&capture.options.format[1]===210,'PDF physical paper units incorrect');
        const original=new Image();original.src=source;await original.decode();
        const stitched=document.createElement('canvas');stitched.width=original.width;stitched.height=original.height;
        const ctx=stitched.getContext('2d');
        for(const t of capture.tiles){
          const image=new Image();image.src=t.image;await image.decode();
          assert(t.x===7&&t.y===11,'Tile does not start at requested margins');
          assert(Math.abs(t.width/image.width-25.4/36)<1e-10&&Math.abs(t.height/image.height-25.4/36)<1e-10,'Export resized a page tile');
          assert(t.x+t.width<=284&&t.y+t.height<=193,'Export entered printer margins');
          const col=capture.tiles.indexOf(t)%2,row=Math.floor(capture.tiles.indexOf(t)/2);
          ctx.drawImage(image,col*layout.contentWidthPx,row*layout.contentHeightPx);
        }
        assert(stitched.toDataURL()===source,'Reassembled PDF differs from original pixels');
        const guides=exportPageSize(options);
        assert(guides.width===layout.contentWidthPx/layout.exportScale&&guides.height===layout.contentHeightPx/layout.exportScale,'Overlay guides differ from PDF slices');
        assert(JSON.stringify(cm.getExportBounds())===bounds,'Sheet margins changed map bounds');
        if(Original){
          const media=/\\/MediaBox \\[([^\\]]+)\\]/.exec(capture.pdf);
          assert(media,'PDF has no MediaBox');const box=media[1].trim().split(/\\s+/).map(Number);
          assert(Math.abs(box[2]*25.4/72-297)<1e-6&&Math.abs(box[3]*25.4/72-210)<1e-6,'Saved PDF page is not physical A4');
        }
        window.marginRealPDF=!!Original;
      } finally {window.jspdf=originalJSPDF;cm.drawAll=drawAll;}
      cm.exportSettings={colorMode:'color',padding:1,orientation:'landscape',paper:'A4',dpi:150,cellSize:2.5,
        sheetMargins:{top:7.5,right:6,bottom:12.5,left:8}};
      cm.saveHistory();window.hudInstance.refresh();
      return {layouts,completePixelReassembly:true,constantPhysicalScale:true,asymmetricMargins:true,pageGuides:true,realPDF:!!Original};
    }''')
    page.locator('#exportPDFPrimary').click()
    expect(page.locator('#pdfMarginTop')).to_have_value('7.5')
    expect(page.locator('#pdfMarginRight')).to_have_value('6')
    expect(page.locator('#pdfMarginBottom')).to_have_value('12.5')
    expect(page.locator('#pdfMarginLeft')).to_have_value('8')
    expect(page.locator('#pdfLayoutSummary')).to_contain_text('sheets')
    page.locator('#pdfMarginTop').fill('10')
    page.locator('#pdfMarginTop').press('Tab')
    assert page.evaluate('cm.exportSettings.sheetMargins.top')==10
    page.locator('#pdfCancel').click()
    page.evaluate('window.hudInstance.setMapCollapsed(false)')
    page.locator('#exportPageFields').evaluate("e=>e.closest('details').open=true")
    field=page.get_by_label('Sheet top margin (mm)',exact=True)
    expect(field).to_have_value('10')
    field.fill('9');field.press('Tab')
    page.locator('#exportPDFPrimary').click()
    expect(page.locator('#pdfMarginTop')).to_have_value('9')
    page.locator('#pdfCancel').click()
    page.evaluate('''() => {
      const data=JSON.parse(JSON.stringify(cm.getMapData()));cm.loadStateData(data);
      if(cm.exportSettings.sheetMargins.top!==9)throw Error('Sheet margin lost on roundtrip');
      cm.loadStateData(window.marginOriginal);cm.history=window.marginHistory.entries;
      cm.historyIndex=window.marginHistory.index;window.hudInstance.refresh();window.hudInstance.setMapCollapsed(true);
    }''')
    return result
