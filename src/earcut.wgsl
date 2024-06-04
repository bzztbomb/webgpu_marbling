const MAX_DROPS: u32 = 256;
const NUM_DROP_VERTICES: u32 = 256;
const TRIANGLES_GENERATED: u32 = NUM_DROP_VERTICES - 2;

@group(0) @binding(0) var<storage> vertices: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> triangles: array<u32>;

@compute
@workgroup_size(32)
fn computeMain(@builtin(global_invocation_id) drop: vec3u) {
  if (drop.x >= MAX_DROPS) {
    return;
  }
  let vertexOffset = drop.x * NUM_DROP_VERTICES;
  
  var prevVert: array<u32, NUM_DROP_VERTICES>;
  var nextVert: array<u32, NUM_DROP_VERTICES>;

  // Build up our doubly linked list.
  for (var i: u32 = 0; i < NUM_DROP_VERTICES; i++) {
    prevVert[i] = select(NUM_DROP_VERTICES - 1, i - 1, i > 0);
    nextVert[i] = select(0, i + 1, i < NUM_DROP_VERTICES - 1);
  }

  var outIdx = TRIANGLES_GENERATED * 3 * drop.x;
  var currIdx: u32 = 0;
  var nextIdx: u32 = 1;
  var prevIdx: u32 = NUM_DROP_VERTICES - 1;
  const MAX_LOOPS = TRIANGLES_GENERATED * TRIANGLES_GENERATED;
  for (var x: u32 = 0; x < MAX_LOOPS && prevIdx != nextIdx; x++) {    
    let a = vertices[vertexOffset + prevIdx];
    let b = vertices[vertexOffset + currIdx];
    let c = vertices[vertexOffset + nextIdx];    
    var isEar = area(a, b, c) < 0;
    if (isEar) {      
      var pIdx = nextVert[nextIdx];
      while (pIdx != prevIdx && isEar) {
        let pp = vertices[vertexOffset + prevVert[pIdx] ];
        let p = vertices[vertexOffset + pIdx];
        let np = vertices[vertexOffset + nextVert[pIdx] ];
        let inTriangle = isInTriangle(a, b, c, p);
        if (inTriangle && area(pp, p, np) >= 0) {
          isEar = false;
        }
        pIdx = nextVert[pIdx];
      }
    }
    if (isEar) {
      triangles[outIdx] = prevIdx + vertexOffset;
      outIdx++;
      triangles[outIdx] = currIdx + vertexOffset;      
      outIdx++;
      triangles[outIdx] = nextIdx + vertexOffset;
      outIdx++;

      nextVert[prevIdx] = nextIdx;
      prevVert[nextIdx] = prevIdx;
    }
    currIdx = nextIdx;
    prevIdx = prevVert[currIdx];
    nextIdx = nextVert[nextIdx];
  }
}

fn isInTriangle(a: vec2f, b: vec2f, c: vec2f, p: vec2f) -> bool {
  return ( 
    (c.x - p.x) * (a.y - p.y) - (a.x - p.x) * (c.y - p.y) >= 0 &&
    (a.x - p.x) * (b.y - p.y) - (b.x - p.x) * (a.y - p.y) >= 0 &&
    (b.x - p.x) * (c.y - p.y) - (c.x - p.x) * (b.y - p.y) >= 0
  );
}

fn area(a: vec2f, b: vec2f, c: vec2f) -> f32 {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}