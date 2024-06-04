// DONE: Get canvas resizing working ;)
// DONE: Port simpleEarcut to webgpu
  
import earcutShader from './earcut.wgsl';

export {};

//
// Drop simulation
//
const NUM_DROP_VERTICES = 256;
const NUM_DROPS = 256;
const TRIANGLES_GENERATED = (NUM_DROP_VERTICES - 2);
const UNIFORM_CURRENT_DROP = NUM_DROPS * 4;
const UNIFORM_ASPECT_RATIO_X = NUM_DROPS * 4 + 2;
const UNIFORM_ASPECT_RATIO_Y = NUM_DROPS * 4 + 3;

const vertices = new Float32Array(NUM_DROPS * NUM_DROP_VERTICES * 2);
const indices = new Uint32Array(NUM_DROPS * TRIANGLES_GENERATED * 3);
const uniforms = new Float32Array((NUM_DROPS + 2) * 4);

// Init uniforms for currentDrop and aspect ratio
uniforms[UNIFORM_CURRENT_DROP] = 0;
uniforms[UNIFORM_ASPECT_RATIO_X] = 1.0;
uniforms[UNIFORM_ASPECT_RATIO_Y] = 1.0;

let currentDrop = 0;

function makeDrop(dropIndex: number, x: number, y: number, radius: number, r: number = 1, g: number = 0, b: number = 0): void {
  let idx = dropIndex * NUM_DROP_VERTICES * 2;
  for (let i = 0; i < NUM_DROP_VERTICES; i++) {
    const angle = i * ((Math.PI * 2) / NUM_DROP_VERTICES);
    vertices[idx++] = Math.cos(angle) * radius + x;
    vertices[idx++] = Math.sin(angle) * radius + y;
  }  
  let colorIndex = dropIndex * 4;
  uniforms[colorIndex++] = r;
  uniforms[colorIndex++] = g;
  uniforms[colorIndex++] = b;
  uniforms[colorIndex++] = 1.0;
}

for (let i = 0; i < NUM_DROPS; i++) {
  makeDrop(i, 0, 0, 0.25);
}

function handleClick(ix: number, iy: number): void {
  const radius = 0.15;
  const x = ix / uniforms[UNIFORM_ASPECT_RATIO_X];
  const y = iy / uniforms[UNIFORM_ASPECT_RATIO_Y];
  simulateDrop(x, y, radius);
  makeDrop(currentDrop, x, y, radius, Math.random(), Math.random(), Math.random());
  currentDrop++;
  if (currentDrop >= NUM_DROPS) {
    currentDrop = 0;
  }
  uniforms[NUM_DROPS * 4] = currentDrop;
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
  const rect = canvas.getBoundingClientRect();
  const cx = ev.clientX - rect.left;
  const cy = ev.clientY - rect.top;
  const x = (cx / rect.width) * 2.0 - 1.0;
  const y = -((cy / rect.height) * 2.0 - 1.0);
  handleClick(x, y);
  updateBuffersAndDraw();
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
  updateBuffersAndDraw(); // just need uniform buffer, but meh
});
try {
  observer.observe(canvas, { box: 'device-pixel-content-box' });
} catch {
  // Handle Safari
  observer.observe(canvas, { box: 'content-box' });
}


function updateBuffersAndDraw() {
  device.queue.writeBuffer(vertexBuffer, 0, vertices);
  // device.queue.writeBuffer(indexBuffer, 0, indices);
  device.queue.writeBuffer(uniformBuffer, 0, uniforms);
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
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
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
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
 });
 device.queue.writeBuffer(indexBuffer, 0, indices);

const uniformBuffer = device.createBuffer({
  label: 'drop colors',
  size: uniforms.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(uniformBuffer, 0, uniforms);

const dropShaderModule = device.createShaderModule({
  label: 'drop shader',
  code: `
    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) color: vec3f,
    }

    struct DropUniforms {
      colors: array<vec3f, ${NUM_DROPS}>,
      currentDrop: f32,
      aspectRatio: vec2f,
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
      output.pos = vec4f(pos * drops.aspectRatio, (1.0 - (z / ${NUM_DROPS})) * 0.99, 1);
      output.color = drops.colors[vertIndex / ${NUM_DROP_VERTICES}];
      return output;
    }

    @fragment
    fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
      return vec4f(input.color, 1);
    }
  `
});

const EARCUT_WORKGROUP_SIZE = 32;
const earcutShaderModule = device.createShaderModule({ label: 'Earcut compute module', ...earcutShader});

const dropBindGroupLayout = device.createBindGroupLayout({
  label: 'drop bind group layout',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: {}
    },
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
      buffer: { type: "storage" },
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

const dropBindGroup = device.createBindGroup({
  label: 'Drop bind group',
  layout: dropBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: { buffer: uniformBuffer }
    },
  ]
});

const earcutBindGroup = device.createBindGroup({
  label: 'earcut bind group',
  layout: earcutBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: { buffer: vertexBuffer }
    },
    {
      binding: 1,
      resource: { buffer: indexBuffer }
    }
  ]
});

const earcutPipeline = device.createComputePipeline({
  label: 'earcut pipeline',
  layout: device.createPipelineLayout({ bindGroupLayouts: [earcutBindGroupLayout ]}),
  compute: {
    module: earcutShaderModule,
    entryPoint: "computeMain",
  }
})

async function draw() {
  const encoder = device.createCommandEncoder();
  const computePass = encoder.beginComputePass();
  computePass.setPipeline(earcutPipeline);
  computePass.setBindGroup(0, earcutBindGroup);
  computePass.dispatchWorkgroups(Math.ceil(NUM_DROPS / EARCUT_WORKGROUP_SIZE));
  computePass.end();

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
  pass.setBindGroup(0, dropBindGroup);
  pass.drawIndexed(indices.length);
  pass.end();
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);  
}



