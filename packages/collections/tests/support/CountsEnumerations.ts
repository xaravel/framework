// Port of tests/Support/Concerns/CountsEnumerations.php, retaining its assertion counts and diagnostics.
import { TestCase } from "@xaravel/assert";
import { Collection, LazyCollection } from "@xaravel/collections";
import { Ref } from "@xaravel/runtime";

type Executor = (collection: LazyCollection) => unknown;

export class CountsEnumerations extends TestCase {
  makeGeneratorFunctionWithRecorder(numbers = 10): [() => Generator<number>, Collection] {
    const recorder = new Collection();
    const generatorFunction = function* () {
      for (let i = 1; i <= numbers; i++) {
        recorder.push(i);
        yield i;
      }
    };
    return [generatorFunction, recorder];
  }

  assertDoesNotEnumerate(executor: Executor): void { this.assertEnumerates(0, executor); }
  assertDoesNotEnumerateCollection(collection: LazyCollection, executor: Executor): void {
    this.assertEnumeratesCollection(collection, 0, executor);
  }
  assertEnumerates(count: number, executor: Executor): void {
    this.assertEnumeratesCollection(LazyCollection.times(100), count, executor);
  }
  assertEnumeratesCollection(collection: LazyCollection, count: number, executor: Executor): void {
    const enumerated = new Ref(0); // adapted:DIV-9.2
    const data = this.countEnumerations(collection, enumerated);
    executor(data);
    this.assertEnumerations(count, enumerated.value); // adapted:DIV-9.2
  }
  assertEnumeratesOnce(executor: Executor): void {
    this.assertEnumeratesCollectionOnce(LazyCollection.times(10), executor);
  }
  assertEnumeratesCollectionOnce(collection: LazyCollection, executor: Executor): void {
    const enumerated = new Ref(0); // adapted:DIV-9.2
    const count = collection.count();
    collection = this.countEnumerations(collection, enumerated);
    executor(collection);
    this.assertEquals(count, enumerated.value, count > enumerated.value ? "Failed to enumerate in full." : "Enumerated more than once."); // adapted:DIV-9.2
  }
  assertEnumerations(expected: number, actual: number): void {
    this.assertEquals(expected, actual, `Failed asserting that ${actual} items that were enumerated matches expected ${expected}.`);
  }
  countEnumerations(collection: LazyCollection, count: Ref<number>): LazyCollection {
    return collection.tapEach(() => { count.value++; });
  }
}
