const NUM_DROPS: u32 = #NUM_DROPS;
const NUM_DROP_VERTICES: u32 = #NUM_DROP_VERTICES;

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) uv: vec2f,
}

struct DropUniforms {
  colors: array<vec3f, NUM_DROPS>,
  currentDrop: f32,
  aspectRatio: vec2f,
  xyr: vec3f,
  t: f32,
}

@group(0) @binding(0) var<uniform> drops: DropUniforms;
@group(0) @binding(1) var<storage> old_vertices: array<vec2f>;
@group(0) @binding(2) var dropSampler: sampler;
@group(0) @binding(3) var dropTexture: texture_2d<f32>;

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
  let oldPos = select(old_vertices[vertIndex], pos, dropIndex == u32(drops.currentDrop)) * drops.aspectRatio;
  let targetPos = pos * drops.aspectRatio;
  let spedUp = min(drops.t * 4.0, 1.0);
  let mixAmt = 1 - pow(1 - spedUp, 3); // ease out cubic
  output.pos = vec4f(mix(oldPos, targetPos, mixAmt), (1.0 - (z / f32(NUM_DROPS))) * 0.99, 1);
  output.color = drops.colors[vertIndex / NUM_DROP_VERTICES];
  let i = f32(vertIndex % NUM_DROP_VERTICES);
  let angle = i * ((radians(180) * 2) / f32(NUM_DROP_VERTICES));
  output.uv = vec2f(cos(angle), sin(angle)) * 0.5 + 0.5;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(dropTexture, dropSampler, input.uv);
}