export function arrayMove(arr, fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= arr.length) {
    return;
  }
  toIndex = Math.max(0, Math.min(arr.length - 1, toIndex));
  if (fromIndex === toIndex) {
    return;
  }
  const element = arr[fromIndex];
  arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, element);
}
