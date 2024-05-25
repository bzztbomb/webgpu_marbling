// DONE: Draw one drop
// DONE: Earcut
// DONE: Draw NxN drops

import * as earcut from "earcut";

// Draw NxN drops with different colors
export {};

if (!navigator.gpu) {
  throw new Error('WebGPU not supported!');
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('Unable to get adapter!');
}

const device = await adapter.requestDevice();
if (!device) {
  throw new Error('Unable to get device!');
}

const context = document.getElementsByTagName('canvas')[0].getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format
});

const NUM_DROP_VERTICES = 20;
const NUM_DROPS = 4;

const vertices = new Float32Array(NUM_DROPS * NUM_DROP_VERTICES * 2);

function makeDrop(dropIndex: number, x: number, y: number, radius: number): void {
  let idx = dropIndex * NUM_DROP_VERTICES * 2;
  for (let i = 0; i < NUM_DROP_VERTICES; i++) {
    const angle = i * ((Math.PI * 2) / NUM_DROP_VERTICES);
    vertices[idx++] = Math.cos(angle) * radius + x;
    vertices[idx++] = Math.sin(angle) * radius + y;
  }  
}

makeDrop(0, -0.5, -0.5, 0.25);
makeDrop(1, 0.5, -0.5, 0.25);
makeDrop(2, -0.5, 0.5, 0.25);
makeDrop(3, 0.5, 0.5, 0.25);

const vertexBuffer = device.createBuffer({
  label: 'drop vertices',
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(vertexBuffer, 0, vertices);
const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [{
          format: "float32x2",
          offset: 0,
          shaderLocation: 0,
      }]
};

const triangles = [];
for (let i = 0; i < NUM_DROPS; i++) {
  const verts = vertices.slice(i * NUM_DROP_VERTICES * 2, (i+1) * NUM_DROP_VERTICES * 2);
  const tris = earcut(verts);
  const offset = i * NUM_DROP_VERTICES;
  triangles.push(...tris.map(i => i + offset));
}
const indices = new Uint32Array(triangles);
const indexBuffer = device.createBuffer({
  label: 'drop indices',
  size: indices.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
 });
device.queue.writeBuffer(indexBuffer, 0, indices);

const shaderModule = device.createShaderModule({
  label: 'drop shader',
  code: `
    @vertex
    fn vertexMain(
      @location(0) pos: vec2f
    ) -> @builtin(position) vec4f {
      return vec4f(pos, 0, 1);
    }

    @fragment
    fn fragmentMain() -> @location(0) vec4f {
      return vec4f(1, 0, 0, 1);
    }
  `
});

const dropPipeline = device.createRenderPipeline({
  label: 'drop pipeline',
  layout: 'auto',
  vertex: {
    module: shaderModule,
    entryPoint: 'vertexMain',
    buffers: [vertexBufferLayout],
  },
  fragment: {
    module: shaderModule,
    entryPoint: 'fragmentMain',
    targets: [{
      format,
    }]
  }
});

const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    loadOp: "clear",
    clearValue: { r: 0, g: 0, b: 0.6, a: 1 },
    storeOp: 'store',
  }]});
pass.setPipeline(dropPipeline);
pass.setVertexBuffer(0, vertexBuffer);
pass.setIndexBuffer(indexBuffer, 'uint32');
pass.drawIndexed(indices.length);
pass.end();
const commandBuffer = encoder.finish();
device.queue.submit([commandBuffer]);
