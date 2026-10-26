// A line-for-line port of `zend_sort` (PHP 8.5.11's `Zend/zend_sort.c`, derived from LLVM libc++'s `std::sort`, MIT),
// over a JS array: insertion sort up to 16 elements (`zend_insert_sort`, with the `zend_sort_2..5` networks), else a
// hybrid quicksort whose pivot is the median of 3 (of 5 from 1024 elements). It is not stable, and with a comparator
// that is not a total order (PHP's `==` is not transitive) it leaves the elements exactly where PHP's leaves them,
// which is what `array_unique` reads its kept keys from (action item epic-14-item-2-runtime-generators-functions).
// Internal: the package does not export this module.

/** A three-way comparator: greater than 0 when `a` sorts after `b`. */
export type Compare<T> = (a: T, b: T) => number;

function swap<T>(items: T[], a: number, b: number): void {
  const held = items[a]!;
  items[a] = items[b]!;
  items[b] = held;
}

function sort2<T>(items: T[], a: number, b: number, cmp: Compare<T>): void {
  if (cmp(items[a]!, items[b]!) > 0) {
    swap(items, a, b);
  }
}

function sort3<T>(items: T[], a: number, b: number, c: number, cmp: Compare<T>): void {
  if (!(cmp(items[a]!, items[b]!) > 0)) {
    if (!(cmp(items[b]!, items[c]!) > 0)) {
      return;
    }
    swap(items, b, c);
    if (cmp(items[a]!, items[b]!) > 0) {
      swap(items, a, b);
    }
    return;
  }
  if (!(cmp(items[c]!, items[b]!) > 0)) {
    swap(items, a, c);
    return;
  }
  swap(items, a, b);
  if (cmp(items[b]!, items[c]!) > 0) {
    swap(items, b, c);
  }
}

function sort4<T>(items: T[], a: number, b: number, c: number, d: number, cmp: Compare<T>): void {
  sort3(items, a, b, c, cmp);
  if (cmp(items[c]!, items[d]!) > 0) {
    swap(items, c, d);
    if (cmp(items[b]!, items[c]!) > 0) {
      swap(items, b, c);
      if (cmp(items[a]!, items[b]!) > 0) {
        swap(items, a, b);
      }
    }
  }
}

function sort5<T>(items: T[], a: number, b: number, c: number, d: number, e: number, cmp: Compare<T>): void {
  sort4(items, a, b, c, d, cmp);
  if (cmp(items[d]!, items[e]!) > 0) {
    swap(items, d, e);
    if (cmp(items[c]!, items[d]!) > 0) {
      swap(items, c, d);
      if (cmp(items[b]!, items[c]!) > 0) {
        swap(items, b, c);
        if (cmp(items[a]!, items[b]!) > 0) {
          swap(items, a, b);
        }
      }
    }
  }
}

/** `zend_insert_sort` over `items[start, start + count)`. */
function insertSort<T>(items: T[], start: number, count: number, cmp: Compare<T>): void {
  switch (count) {
    case 0:
    case 1:
      return;
    case 2:
      sort2(items, start, start + 1, cmp);
      return;
    case 3:
      sort3(items, start, start + 1, start + 2, cmp);
      return;
    case 4:
      sort4(items, start, start + 1, start + 2, start + 3, cmp);
      return;
    case 5:
      sort5(items, start, start + 1, start + 2, start + 3, start + 4, cmp);
      return;
    default:
      break;
  }
  const end = start + count;
  const sentry = start + 6;
  for (let i = start + 1; i < sentry; i++) {
    let j = i - 1;
    if (!(cmp(items[j]!, items[i]!) > 0)) {
      continue;
    }
    while (j !== start) {
      j--;
      if (!(cmp(items[j]!, items[i]!) > 0)) {
        j++;
        break;
      }
    }
    for (let k = i; k > j; k--) {
      swap(items, k, k - 1);
    }
  }
  for (let i = sentry; i < end; i++) {
    let j = i - 1;
    if (!(cmp(items[j]!, items[i]!) > 0)) {
      continue;
    }
    for (;;) {
      j -= 2;
      if (!(cmp(items[j]!, items[i]!) > 0)) {
        j++;
        if (!(cmp(items[j]!, items[i]!) > 0)) {
          j++;
        }
        break;
      }
      if (j === start) {
        break;
      }
      if (j === start + 1) {
        j--;
        if (cmp(items[i]!, items[j]!) > 0) {
          j++;
        }
        break;
      }
    }
    for (let k = i; k > j; k--) {
      swap(items, k, k - 1);
    }
  }
}

/** `zend_sort` over `items[start, start + count)`. */
function sortRange<T>(items: T[], start: number, count: number, cmp: Compare<T>): void {
  let base = start;
  let nmemb = count;
  for (;;) {
    if (nmemb <= 16) {
      insertSort(items, base, nmemb, cmp);
      return;
    }
    const first = base;
    const end = first + nmemb;
    const offset = nmemb >>> 1;
    let pivot = first + offset;
    if (nmemb >>> 10 !== 0) {
      const delta = offset >>> 1;
      sort5(items, first, first + delta, pivot, pivot + delta, end - 1, cmp);
    } else {
      sort3(items, first, pivot, end - 1, cmp);
    }
    swap(items, first + 1, pivot);
    pivot = first + 1;
    let i = pivot + 1;
    let j = end - 1;
    partition: for (;;) {
      while (cmp(items[pivot]!, items[i]!) > 0) {
        i++;
        if (i === j) {
          break partition;
        }
      }
      j--;
      if (j === i) {
        break;
      }
      while (cmp(items[j]!, items[pivot]!) > 0) {
        j--;
        if (j === i) {
          break partition;
        }
      }
      swap(items, i, j);
      i++;
      if (i === j) {
        break;
      }
    }
    swap(items, pivot, i - 1);
    if (i - 1 - first < end - i) {
      sortRange(items, first, i - first - 1, cmp);
      base = i;
      nmemb = end - i;
    } else {
      sortRange(items, i, end - i, cmp);
      nmemb = i - first - 1;
      base = first;
    }
  }
}

/** Sorts `items` in place as PHP's `zend_sort` does with the comparator `cmp`. */
export function zendSort<T>(items: T[], cmp: Compare<T>): void {
  sortRange(items, 0, items.length, cmp);
}
