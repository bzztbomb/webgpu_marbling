const NUM_DROPS: u32 = #NUM_DROPS;
const NUM_DROP_VERTICES: u32 = #NUM_DROP_VERTICES;
const TRIANGLES_GENERATED: u32 = #TRIANGLES_GENERATED;

struct DropUniforms {
  colors: array<vec3f, NUM_DROPS>,
  currentDrop: f32,
  aspectRatio: vec2f,
  xyr: vec3f,
}

@group(0) @binding(0) var<storage> vertices: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> output_vertices: array<vec2f>;
@group(0) @binding(2) var<uniform> drops: DropUniforms;

@compute
@workgroup_size(#SIMULATE_WORKGROUP_SIZE)
fn computeMain(@builtin(global_invocation_id) drop: vec3u) {
  let vertexIndex = drop.x;
  if (vertexIndex >= NUM_DROPS * NUM_DROP_VERTICES) {
    return;
  }
  let c = drops.xyr.xy;
  let r = drops.xyr.z;
  let dropIndex = vertexIndex / NUM_DROP_VERTICES;
  if (dropIndex != u32(drops.currentDrop)) {
    // // normal case
    let v = vertices[vertexIndex];
    let pMinusC = (v.x-c.x)*(v.x-c.x)+(v.y-c.y)*(v.y-c.y);
    let lastTerm = sqrt(1 + r*r / pMinusC);
    output_vertices[vertexIndex] = c + (v - c) * lastTerm;
  } else {
    // init case
    let i = f32(vertexIndex % NUM_DROP_VERTICES);
    let angle = i * ((radians(180) * 2) / f32(NUM_DROP_VERTICES));
    output_vertices[vertexIndex] = vec2f(cos(angle) * r + c.x, sin(angle) * r + c.y);
  }
}