// DONE: Get canvas resizing working ;)
// DONE: Port simpleEarcut to webgpu
// DONE: Add #defines for shaders (MAX_DROPS, workgroup_size, etc)
// DONE: Port simulateDrop to gpu
// DONE: Interpolate between last and current
// TODO: Textured drops
// TODO: Bvmble

import { preprocess } from './preprocessor';

import earcutShader from './earcut.wgsl';
import dropShader from './drop.wgsl';
import simulateShader from './simulate.wgsl';

export {};

//
// Drop simulation
//
const NUM_DROP_VERTICES = 256;
const NUM_DROPS = 256;
const TRIANGLES_GENERATED = (NUM_DROP_VERTICES - 2);
const NUM_INDICES = NUM_DROPS * TRIANGLES_GENERATED * 3;
const EARCUT_WORKGROUP_SIZE = 32;
const SIMULATE_WORKGROUP_SIZE = 32;

const ShaderConsts = {
  NUM_DROP_VERTICES: NUM_DROP_VERTICES,
  NUM_DROPS: NUM_DROPS,
  TRIANGLES_GENERATED: TRIANGLES_GENERATED,
  EARCUT_WORKGROUP_SIZE: EARCUT_WORKGROUP_SIZE,
  SIMULATE_WORKGROUP_SIZE: SIMULATE_WORKGROUP_SIZE,
};

const NUM_UNIFORMS = 5;
const UNIFORM_CURRENT_DROP = NUM_DROPS * 4; // f32 - 4bytes
const UNIFORM_ASPECT_RATIO_X = NUM_DROPS * 4 + 2; // vec2 -
const UNIFORM_ASPECT_RATIO_Y = NUM_DROPS * 4 + 3;
const UNIFORM_DROP_X_Y_R = NUM_DROPS * 4 + 4;
const UNIFORM_TIME = NUM_DROPS * 4 + 7;

const uniforms = new Float32Array((NUM_DROPS + NUM_UNIFORMS) * 4);

// Init uniforms for currentDrop and aspect ratio
uniforms[UNIFORM_CURRENT_DROP] = 0;
uniforms[UNIFORM_ASPECT_RATIO_X] = 1.0;
uniforms[UNIFORM_ASPECT_RATIO_Y] = 1.0;
uniforms[UNIFORM_TIME] = 0.0;

let currentDrop = 0;
let simulateRequired = false;

function makeDrop(dropIndex: number, x: number, y: number, radius: number, r: number = 1, g: number = 0, b: number = 0): void {
  let xyzIndex = UNIFORM_DROP_X_Y_R;
  uniforms[xyzIndex++] = x;
  uniforms[xyzIndex++] = y;
  uniforms[xyzIndex++] = radius; 
  let colorIndex = dropIndex * 4;
  uniforms[colorIndex++] = r;
  uniforms[colorIndex++] = g;
  uniforms[colorIndex++] = b;
  uniforms[colorIndex++] = 1.0;
}

function handleClick(ix: number, iy: number): void {
  const radius = 0.15;
  const x = ix / uniforms[UNIFORM_ASPECT_RATIO_X];
  const y = iy / uniforms[UNIFORM_ASPECT_RATIO_Y];
  currentDrop++;
  if (currentDrop >= NUM_DROPS) {
    currentDrop = 0;
  }
  makeDrop(currentDrop, x, y, radius, Math.random(), Math.random(), Math.random());
  uniforms[NUM_DROPS * 4] = currentDrop;
  simulateRequired = true;
  draw();
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
  const rect = canvas.getBoundingClientRect();
  const cx = ev.clientX - rect.left;
  const cy = ev.clientY - rect.top;
  const x = (cx / rect.width) * 2.0 - 1.0;
  const y = -((cy / rect.height) * 2.0 - 1.0);
  handleClick(x, y);
}

const observer = new ResizeObserver(elements => {
  for (const element of elements) {
    const box = element.devicePixelContentBoxSize ?? element.contentBoxSize;
    const width = box[0].inlineSize;
    const height = box[0].blockSize;
    const canvas = element.target as HTMLCanvasElement;
    canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
    canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
    if (depthTexture) {
      depthTexture.destroy();
    }
    depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
  }
  uniforms[UNIFORM_ASPECT_RATIO_X] = canvas.height >= canvas.width ? canvas.height / canvas.width : 1.0;
  uniforms[UNIFORM_ASPECT_RATIO_Y] = canvas.width >= canvas.height ? canvas.width / canvas.height : 1.0;
  draw();
});
try {
  observer.observe(canvas, { box: 'device-pixel-content-box' });
} catch {
  // Handle Safari
  observer.observe(canvas, { box: 'content-box' });
}

const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format
});

const vertices = new Float32Array(NUM_DROPS * NUM_DROP_VERTICES * 2);
const vertexBuffers = [0, 1].map(i => device.createBuffer({
  label: `drop vertices ${i}`,
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
}));
vertexBuffers.forEach(vb => device.queue.writeBuffer(vb, 0, vertices));
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
  size: NUM_INDICES * 4,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
 });

const uniformBuffer = device.createBuffer({
  label: 'drop colors',
  size: uniforms.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(uniformBuffer, 0, uniforms);

const dropShaderModule = device.createShaderModule({
  label: 'drop shader',
  code: preprocess(dropShader.code, ShaderConsts)
});

const earcutShaderModule = device.createShaderModule({ 
  label: 'Earcut compute module', 
  code: preprocess(earcutShader.code, ShaderConsts),
});

const simulateShaderModule = device.createShaderModule({
  label: 'simulate shader',
  code: preprocess(simulateShader.code, ShaderConsts),
});

const dropBindGroupLayout = device.createBindGroupLayout({
  label: 'drop bind group layout',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: {}
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX,
      buffer: { type: 'read-only-storage' }
    }
  ]
});

const earcutBindGroupLayout = device.createBindGroupLayout({
  label: 'earcut bind group layout',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'storage' },
    }
  ]
});

const simulateBindGroupLayout = device.createBindGroupLayout({
  label: 'simulate bind group layout',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'read-only-storage' },
    }, 
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'storage' },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'uniform' },
    }
  ]
});

let depthTexture = device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

const dropPipeline = device.createRenderPipeline({
  label: 'drop pipeline',
  layout: device.createPipelineLayout({ bindGroupLayouts: [dropBindGroupLayout]}),
  vertex: {
    module: dropShaderModule,
    entryPoint: 'vertexMain',
    buffers: [vertexBufferLayout],
  },
  fragment: {
    module: dropShaderModule,
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

const dropBindGroups = [1, 0].map(vb => device.createBindGroup({
  label: 'Drop bind group',
  layout: dropBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: { buffer: uniformBuffer }
    },
    {
      binding: 1,
      resource: { buffer: vertexBuffers[vb] }
    }
  ]
}));

const earcutBindGroups = [0, 1].map(vb => device.createBindGroup({
  label: 'earcut bind group',
  layout: earcutBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: { buffer: vertexBuffers[vb] }
    },
    {
      binding: 1,
      resource: { buffer: indexBuffer }
    }
  ]
}));

const simulateBindGroups = [1, 0].map(vb => device.createBindGroup({
  label: 'simulate bind group',
  layout: simulateBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: { buffer: vertexBuffers[vb] }
    },
    {
      binding: 1,
      resource: { buffer: vertexBuffers[1 - vb] }
    },
    {
      binding: 2,
      resource: { buffer: uniformBuffer }
    }
  ]
}))

const earcutPipeline = device.createComputePipeline({
  label: 'earcut pipeline',
  layout: device.createPipelineLayout({ bindGroupLayouts: [earcutBindGroupLayout ]}),
  compute: {
    module: earcutShaderModule,
    entryPoint: "computeMain",
  }
});

const simulatePipeline = device.createComputePipeline({
  label: 'simulate pipeline',
  layout: device.createPipelineLayout({ bindGroupLayouts: [simulateBindGroupLayout ]}),
  compute: {
    module: simulateShaderModule,
    entryPoint: 'computeMain',
  }
})

let pingPong = 0;
let start = performance.now();
async function draw() {
  if (simulateRequired) {
    start = performance.now();
  }
  const elapsed = performance.now() - start;
  uniforms[UNIFORM_TIME] = Math.min(elapsed / 1000, 1);
  device.queue.writeBuffer(uniformBuffer, 0, uniforms);

  const encoder = device.createCommandEncoder();

  if (simulateRequired) {
    pingPong = 1 - pingPong;

    const simulatePass = encoder.beginComputePass();
    simulatePass.setPipeline(simulatePipeline);
    simulatePass.setBindGroup(0, simulateBindGroups[pingPong]);
    simulatePass.dispatchWorkgroups(Math.ceil(NUM_DROPS * NUM_DROP_VERTICES / SIMULATE_WORKGROUP_SIZE));
    simulatePass.end();  

    const earcutPass = encoder.beginComputePass();
    earcutPass.setPipeline(earcutPipeline);
    earcutPass.setBindGroup(0, earcutBindGroups[pingPong]);
    earcutPass.dispatchWorkgroups(Math.ceil(NUM_DROPS / EARCUT_WORKGROUP_SIZE));
    earcutPass.end();

    start = performance.now();

    simulateRequired = false;
  }

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
  pass.setVertexBuffer(0, vertexBuffers[pingPong]);
  pass.setIndexBuffer(indexBuffer, 'uint32');
  pass.setBindGroup(0, dropBindGroups[pingPong]);
  pass.drawIndexed(NUM_INDICES);
  pass.end();
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
  if (elapsed < 1000) {
    requestAnimationFrame(draw);
  }
}

requestAnimationFrame(draw);