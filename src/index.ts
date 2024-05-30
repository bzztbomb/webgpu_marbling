// DONE: Draw one drop
// DONE: Earcut
// DONE: Draw NxN drops
// DONE: Trigger drops with mouse
// DONE: Retriangulate
// DONE: Different colors per drop
// DONE: Cleanup
// DONE: https://people.csail.mit.edu/jaffer/Marbling/Dropping-Paint
// DONE: https://tchayen.github.io/posts/triangulation-of-polygons
// DONE: Optimize simpleEarcut (get rid of vertices.slice())
// TODO: Clean up simpleEarcut (get rid of removeNode and isEar)
// TODO: Port earcut to webgpu
import { simpleEarcut } from "./simpleEarcut";

// Draw NxN drops with different colors
export {};

//
// Drop simulation
//
const NUM_DROP_VERTICES = 64;
const NUM_DROPS = 256;
const TRIANGLES_GENERATED = (NUM_DROP_VERTICES - 2);

const vertices = new Float32Array(NUM_DROPS * NUM_DROP_VERTICES * 2);
const indices = new Uint32Array(NUM_DROPS * TRIANGLES_GENERATED * 3);
const colors = new Float32Array((NUM_DROPS + 1) * 4);

let currentDrop = 0;

function makeDrop(dropIndex: number, x: number, y: number, radius: number, r: number = 1, g: number = 0, b: number = 0): void {
  let idx = dropIndex * NUM_DROP_VERTICES * 2;
  for (let i = 0; i < NUM_DROP_VERTICES; i++) {
    const angle = i * ((Math.PI * 2) / NUM_DROP_VERTICES);
    vertices[idx++] = Math.cos(angle) * radius + x;
    vertices[idx++] = Math.sin(angle) * radius + y;
  }  
  let colorIndex = dropIndex * 4;
  colors[colorIndex++] = r;
  colors[colorIndex++] = g;
  colors[colorIndex++] = b;
  colors[colorIndex++] = 1.0;
}

function triangulateDrop(dropIndex: number) {
  simpleEarcut(vertices, dropIndex * NUM_DROP_VERTICES, NUM_DROP_VERTICES, indices, TRIANGLES_GENERATED * 3 * dropIndex);
}

for (let i = 0; i < NUM_DROPS; i++) {
  makeDrop(i, 0, 0, 0);
  triangulateDrop(i);
}

function handleClick(x: number, y: number): void {
  const radius = 0.15;
  simulateDrop(x, y, radius);
  makeDrop(currentDrop, x, y, radius, Math.random(), Math.random(), Math.random());
  for (let i = 0; i < NUM_DROPS; i++) {
    triangulateDrop(i);
  }
  currentDrop++;
  if (currentDrop >= NUM_DROPS) {
    currentDrop = 0;
  }
  colors[NUM_DROPS * 4] = currentDrop;
}

function simulateDrop(cx: number, cy: number, r: number): void {
  const r2 = r*r;
  let idx = 0;
  for (let i = 0; i < NUM_DROPS * NUM_DROP_VERTICES; i++) {
    const x = vertices[idx];
    const y = vertices[idx+1];
    const pMinusC = (x-cx)*(x-cx)+(y-cy)*(y-cy);
    const lastTerm = Math.sqrt(1 + r2 / pMinusC);
    vertices[idx++] = cx + (x - cx) * lastTerm;
    vertices[idx++] = cy + (y - cy) * lastTerm;
  }
}

//
// WebGPU stuff
// 
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

const canvas = document.getElementsByTagName('canvas')[0];
canvas.onclick = (ev: MouseEvent) => {
  const x = (ev.clientX / canvas.width) * 2.0 - 1.0;
  const y = -((ev.clientY / canvas.height) * 2.0 - 1.0);
  handleClick(x ,y);
  device.queue.writeBuffer(vertexBuffer, 0, vertices);
  device.queue.writeBuffer(indexBuffer, 0, indices);
  device.queue.writeBuffer(uniformBuffer, 0, colors);
  draw();
}
const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format
});

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

const indexBuffer = device.createBuffer({
  label: 'drop indices',
  size: indices.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
 });
device.queue.writeBuffer(indexBuffer, 0, indices);

const uniformBuffer = device.createBuffer({
  label: 'drop colors',
  size: colors.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(uniformBuffer, 0, colors);

const shaderModule = device.createShaderModule({
  label: 'drop shader',
  code: `
    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) color: vec3f,
    }

    struct DropUniforms {
      colors: array<vec3f, ${NUM_DROPS}>,
      currentDrop: f32,
    }

    @group(0) @binding(0) var<uniform> drops: DropUniforms;

    @vertex
    fn vertexMain(
      @builtin(vertex_index) vertIndex: u32,
      @location(0) pos: vec2f
    ) -> VertexOutput {
      var output: VertexOutput;
      let dropIndex = vertIndex / ${NUM_DROP_VERTICES};
      var z = f32(dropIndex) - drops.currentDrop;
      if (z < 0) {
        z += ${NUM_DROPS};
      }
      output.pos = vec4f(pos, (1.0 - (z / ${NUM_DROPS})) * 0.99, 1);
      output.color = drops.colors[vertIndex / ${NUM_DROP_VERTICES}];
      return output;
    }

    @fragment
    fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
      return vec4f(input.color, 1);
    }
  `
});

const bindGroupLayout = device.createBindGroupLayout({
  label: 'drop bind group layout',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: {}
    }
  ]
});

const depthTexture = device.createTexture({
  size: [512, 512],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

const dropPipeline = device.createRenderPipeline({
  label: 'drop pipeline',
  layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout]}),
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
  },
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth24plus',
  }
});

const bindGroup = device.createBindGroup({
  label: 'Drop bind group',
  layout: bindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: { buffer: uniformBuffer }
    }
  ]
});

function draw() {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: 
      [{
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0.6, a: 1 },
        storeOp: 'store',
      }],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    }
  });
  pass.setPipeline(dropPipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.setIndexBuffer(indexBuffer, 'uint32');
  pass.setBindGroup(0, bindGroup);
  pass.drawIndexed(indices.length);
  pass.end();
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);  
}

draw();
