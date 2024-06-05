const NUM_DROPS: u32 = #NUM_DROPS;
const NUM_DROP_VERTICES: u32 = #NUM_DROP_VERTICES;

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
}

struct DropUniforms {
  colors: array<vec3f, NUM_DROPS>,
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
  let dropIndex = vertIndex / NUM_DROP_VERTICES;
  var z = f32(dropIndex) - drops.currentDrop - 1;
  if (z < 0) {
    z += f32(NUM_DROPS);
  }
  output.pos = vec4f(pos * drops.aspectRatio, (1.0 - (z / f32(NUM_DROPS))) * 0.99, 1);
  output.color = drops.colors[vertIndex / NUM_DROP_VERTICES];
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(input.color, 1);
}