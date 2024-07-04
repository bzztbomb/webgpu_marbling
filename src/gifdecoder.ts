import { ParsedFrame, decompressFrames, parseGIF } from "gifuct-js";

export class Decoder {
  private patchCanvas = document.createElement('canvas');
  private patchCtx = this.patchCanvas.getContext('2d');
  private gifCanvas = document.createElement('canvas');
  private gifCtx = this.gifCanvas.getContext('2d');
  private frames: ParsedFrame[];
  private frameImageData: ImageData;
  private lastFrame: number;
  private startTime: number;
  private nextFrameTime: number;

  public async load(url: string): Promise<boolean> {
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }
    const gif = parseGIF(await response.arrayBuffer());
    this.frames = decompressFrames(gif, true);
    this.gifCanvas.width = this.frames[0].dims.width;
    this.gifCanvas.height = this.frames[0].dims.height;
    this.lastFrame = -1;
    return true;
  }

  public getNextFrame(): null | HTMLCanvasElement {
    if (this.lastFrame === -1) {
      this.drawFrame(0);
      this.lastFrame = 0;
      this.startTime = performance.now();
      this.nextFrameTime = this.startTime + this.frames[0].delay;
      return this.gifCanvas;
    }
    const now = performance.now();
    if (now >= this.nextFrameTime) {
      const lastFrame = this.lastFrame;
      const nextFrame = (this.lastFrame + 1) % this.frames.length;
      if (lastFrame  === nextFrame) {
        return null;
      }
      this.drawFrame(nextFrame);
      this.nextFrameTime = now + this.frames[nextFrame].delay;
      this.lastFrame = nextFrame;
      return this.gifCanvas;
    }
    return null;  
  }

  private drawFrame(frame: number): void {
    const dims = this.frames[frame].dims;
    if (!this.frameImageData || this.frameImageData.width !== dims.width || this.frameImageData.height !== dims.height) {
      this.patchCanvas.width = dims.width;
      this.patchCanvas.height = dims.height;
      this.frameImageData = this.patchCtx.createImageData(dims.width, dims.height);      
    }
    this.gifCtx.clearRect(0, 0, this.gifCanvas.width, this.gifCanvas.height);
    this.frameImageData.data.set(this.frames[frame].patch);
    this.patchCtx.putImageData(this.frameImageData, 0, 0);
    this.gifCtx.drawImage(this.patchCanvas, dims.left, dims.top);
  }
}
