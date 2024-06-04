export function preprocess(target: string, defines: { [key: string]: string | number}): string {
  let ret = target;
  for (const [key, value] of Object.entries(defines)) {
    ret = ret.replaceAll('#' + key, String(value));
  }
  return ret;
}