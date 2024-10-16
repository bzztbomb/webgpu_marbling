export function getResizePipeline(device: GPUDevice) {
  const resizeModule = device.createShaderModule({
    label: "resizeModule",
    code: `
      @group(0) @binding(0) var<uniform> resize: vec2f;
      @group(0) @binding(1) var s: sampler;
      @group(0) @binding(2) var texture: texture_2d<f32>;

      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f
      }

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> VertexOutput {
        let pos = array(
          vec2f(-1.0, -1.0), // upper left
          vec2f(-1.0, 1.0), // lower left
          vec2f( 1.0, 1.0), // lower right

          vec2f( 1.0,  1.0),  // lower right
          vec2f( 1.0,  -1.0), // upper right
          vec2f(-1.0,  -1.0), // upper left
        );
        let uv = array(
          vec2f(0.0, 1.0), // upper left
          vec2f(0.0, 0.0), // lower left
          vec2f(1.0, 0.0), // lower right
          vec2f(1.0, 0.0), // lower right
          vec2f(1.0, 1.0), // upper right
          vec2f(0.0, 1.0), // upper left
        );
        var output: VertexOutput;
        output.pos = vec4f(pos[vertexIndex] * resize.xy, 0.0, 1.0);
        output.uv = uv[vertexIndex];
        return output;
      }

      @fragment fn fs(input: VertexOutput) -> @location(0) vec4f {
        return textureSample(texture, s, input.uv);
      }
    `,
  });

  const resizeLayout = device.createBindGroupLayout({
    label: "resize layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
    ],
  });

  const resizePipeline = device.createRenderPipeline({
    label: "resize pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [resizeLayout] }),
    vertex: {
      entryPoint: "vs",
      module: resizeModule,
    },
    fragment: {
      entryPoint: "fs",
      module: resizeModule,
      targets: [
        {
          format: "rgba8unorm",
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
            },
          },
        },
      ],
    },
  });

  const resizeUniforms = new Float32Array(4);
  const resizeUniformBuffer = device.createBuffer({
    label: "resize  uniforms",
    size: resizeUniforms.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(resizeUniformBuffer, 0, resizeUniforms);

  return { resizeUniforms, resizeUniformBuffer, resizePipeline, resizeLayout };
}