export function generateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    // @ts-ignore
    return crypto.randomUUID()
  }
  return 'id-' + Math.random().toString(16).slice(2)
}
