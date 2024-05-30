let prevVert: Uint16Array;
let nextVert: Uint16Array;

export function simpleEarcut(vertices: Float32Array, vertexOffset: number, numVerts: number, target: Uint32Array, targetOffset: number): boolean {
  if (!prevVert || prevVert.length < numVerts) {
    prevVert = new Uint16Array(numVerts);
    nextVert = new Uint16Array(numVerts);
  }
  // Build up our doubly linked list.
  for (let i = 0; i < numVerts; i++) {
    prevVert[i] = i > 0 ? i-1 : numVerts - 1;
    nextVert[i] = i < numVerts - 1 ? i + 1 : 0;
  }

  // a,b,c,p are indices into vertices array
  const isInTriangle = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean => {
    return ( 
      (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
      (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
      (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0
    );
  }

  const area = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
    return (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  }

  const getVert = (i: number): [a: number, b: number] => {
    const idx = i * 2 + vertexOffset * 2;
    return [vertices[idx], vertices[idx+1]];
  }

  // an ear is a valid triangle with no other verts inside.
  const isEar = (ear: number): boolean => {
    const a = prevVert[ear];
    const b = ear;
    const c = nextVert[ear];

    const [ax, ay] = getVert(a);
    const [bx, by] = getVert(b);
    const [cx, cy] = getVert(c);

    if (area(ax, ay, bx, by, cx, cy) >= 0) {
      return false;
    }

    let p = nextVert[c];
    while (p !== a) {
      const [px, py] = getVert(p);
      const [ppx, ppy] = getVert(prevVert[p]);
      const [npx, npy] = getVert(nextVert[p]);
      const inTriangle = isInTriangle(ax, ay, bx, by, cx, cy, px, py);
      if (inTriangle && area(ppx, ppy, px, py, npx, npy) >= 0) {
        return false;
      }
      p = nextVert[p]
    }
    return true;
  }

  let outIdx = targetOffset;
  let curr = 0;
  let next = 1;
  let prev = numVerts - 1;
  let loops = 0;
  const targetTris = numVerts - 2;
  const maxLoops = targetTris * targetTris;

  while (prev !== next && loops++ < maxLoops) {
    if (isEar(curr)) {
      const prevVertex = prevVert[curr];
      const nextVertex = nextVert[curr];
      
      // Output the triangle
      target[outIdx++] = prevVertex + vertexOffset;
      target[outIdx++] = curr + vertexOffset;
      target[outIdx++] = nextVertex + vertexOffset;

      // Remove the node from the linked list
      nextVert[prevVertex] = next;
      prevVert[nextVertex] = prev;  
    }
    curr = next;
    prev = prevVert[curr];
    next = nextVert[curr];
  }
  return loops < maxLoops;
}