export function debounceCollect(func, wait) {
  var timer, context, timestamp, result
  var args = []
  if (wait == null) wait = 100

  function onTimeout() {
    var elapsed = Date.now() - timestamp

    if (elapsed < wait && elapsed > 0) {
      timer = setTimeout(onTimeout, wait - elapsed)
    } else {
      timer = null
      result = call()
      if (!timer) reset()
    }
  }

  function call() {
    return func.call(context, args)
  }

  function reset() {
    context = null
    args = []
  }

  return function debounced() {
    context = this
    // @ts-ignore
    args.push([].slice.call(arguments))
    timestamp = Date.now()
    if (!timer) timer = setTimeout(onTimeout, wait)

    return result
  }
}
