/** Aggregate geometry only. Never returns pixel data, object labels or player text. */
export function measureRgbaContent(pixels, width, height) {
  if (!(pixels instanceof Uint8Array) || !Number.isInteger(width) || !Number.isInteger(height) ||
      width <= 0 || height <= 0 || pixels.length !== width * height * 4) throw new Error('Invalid RGBA geometry');
  let left=width,top=height,right=-1,bottom=-1,blackPixels=0,opaquePixels=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=(y*width+x)*4;
    if(pixels[i+3]===255) opaquePixels++;
    if(pixels[i]<=8 && pixels[i+1]<=8 && pixels[i+2]<=8) {blackPixels++;continue;}
    if(pixels[i+3]===0) continue;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
  }
  return {contentX:right<0?0:left,contentY:bottom<0?0:top,
    contentWidth:right<0?0:right-left+1,contentHeight:bottom<0?0:bottom-top+1,
    blackPixels,opaquePixels};
}
