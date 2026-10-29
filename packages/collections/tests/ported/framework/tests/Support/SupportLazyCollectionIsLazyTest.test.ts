// Canonical Story 14.8 tests in Upstream order; FlatMap is pending whole in ESC-14.8-2.
// CountsEnumerations retains all source-count assertions.
// Fidelity evidence for the disputed registrations (pinned Upstream SupportLazyCollectionIsLazyTest.php):
// - testIntersectIsLazy, lines 532..540, uses intersect([1, 2, 3]) in BOTH callbacks, exactly as below.
// - testIntersectByKeysIsLazy, lines 576..584, is registered below with both assertion-helper calls.
// - testSortKeysIsLazy, lines 1264..1272, is registered below with both assertion-helper calls.
// - testSortKeysDescIsLazy, lines 1275..1283, is registered below with both assertion-helper calls.
// Each of the latter three asserts zero construction enumeration and one full all() enumeration.
// These are executable registrations, not the pending FlatMap comment or the documentary XT16 snippet.
import { portedTest } from "@xaravel/assert";
import { Collection, LazyCollection, ItemNotFoundException, MultipleItemsFoundException } from "@xaravel/collections";
import { Mockery } from "@xaravel/mockery";
import { Exception, Ref, PhpArray, looseEquals, toPhpString, fqcn, BlockedByComponentError } from "@xaravel/runtime";
import { stdClass, max as phpMax } from "@xaravel/runtime/php";
import { CountsEnumerations } from "../../../../support/CountsEnumerations";
import { SupportLazyCollectionBlockedBySupportTest } from "../../../../support/SupportClockBoundary";

const ID = "Illuminate\\Tests\\Support\\SupportLazyCollectionIsLazyTest";
class SupportLazyCollectionIsLazyTest extends CountsEnumerations {
  make(source: unknown): LazyCollection { return new LazyCollection(source); }
  rescue(callback: () => unknown): void {
    try { callback(); } catch (error) { if (!(error instanceof Exception)) throw error; }
  }
}
class ClockBlockedTest extends SupportLazyCollectionIsLazyTest {
  setUp(): void { new SupportLazyCollectionBlockedBySupportTest().setUp(); }
}
interface Clock { sub(amount: number, unit: string): Clock; getTimestamp(): number; }
interface CarbonSurface { now(): Clock; }
interface SleepSurface { fake(enabled?: boolean): void; }
interface ClockCollection extends LazyCollection {
  takeUntilTimeout(timeout: Clock): LazyCollection;
  throttle(seconds: number): LazyCollection;
  withHeartbeat(interval: number, callback: () => void): LazyCollection;
  mockery_getContainer(): unknown;
  mockery_init(container: unknown): this;
  shouldAllowMockingProtectedMethods(): this;
  expects(method: string): any;
}
// These missing dependencies always throw, matching Story 14.7's real Support boundary; they supply no clock behavior.
function support<T>(): T { throw new BlockedByComponentError("support"); }
function cloneClock(value: Clock): Clock { void value; throw new BlockedByComponentError("support"); }
function tap<T>(value: T, callback?: (value: T) => unknown): T {
  void value; void callback; throw new BlockedByComponentError("support");
}

portedTest(`${ID}::testMakeWithClosureIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const [closure, recorder] = this.makeGeneratorFunctionWithRecorder();

    LazyCollection.make(closure);

    this.assertSame([], recorder.all());

});

portedTest(`${ID}::testMakeWithLazyCollectionIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        LazyCollection.make(collection);
    });

});

portedTest(`${ID}::testEagerEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection = collection.eager();

        collection.count();
        collection.all();
    });

});

portedTest(`${ID}::testChunkIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.chunk(3);
    });

    this.assertEnumerates(15, (collection: LazyCollection) => {
        collection.chunk(5).take(3).all();
    });

});

portedTest(`${ID}::testChunkWhileIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const collection = LazyCollection.make(['A', 'A', 'B', 'B', 'C', 'C', 'C']);

    this.assertDoesNotEnumerateCollection(collection, (collection: LazyCollection) => {
        collection.chunkWhile((current: string, key: number, chunk: Collection) => {
            return current === chunk.last();
        });
    });

    this.assertEnumeratesCollection(collection, 3, (collection: LazyCollection) => {
        collection.chunkWhile((current: string, key: number, chunk: Collection) => {
            return current === chunk.last();
        }).first();
    });

    this.assertEnumeratesCollectionOnce(collection, (collection: LazyCollection) => {
        collection.chunkWhile((current: string, key: number, chunk: Collection) => {
            return current === chunk.last();
        }).all();
    });

});

portedTest(`${ID}::testChunkByIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const collection = LazyCollection.make(['A', 'A', 'B', 'B', 'C', 'C', 'C']);

    this.assertDoesNotEnumerateCollection(collection, (collection: LazyCollection) => {
        collection.chunkBy((value: string) => value);
    });

    this.assertEnumeratesCollection(collection, 3, (collection: LazyCollection) => {
        collection.chunkBy((value: string) => value).first();
    });

    this.assertEnumeratesCollectionOnce(collection, (collection: LazyCollection) => {
        collection.chunkBy((value: string) => value).all();
    });

});

portedTest(`${ID}::testCollapseIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const collection = LazyCollection.make([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
    ]);

    this.assertDoesNotEnumerateCollection(collection, (collection: LazyCollection) => {
        collection.collapse();
    });

    this.assertEnumeratesCollection(collection, 1, (collection: LazyCollection) => {
        collection.collapse().take(3).all();
    });

});

portedTest(`${ID}::testCombineIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const firstEnumerations = new Ref(0); // adapted:DIV-9.2
    const secondEnumerations = new Ref(0); // adapted:DIV-9.2
    const first = this.countEnumerations(this.make([1, 2]), firstEnumerations);
    const second = this.countEnumerations(this.make([1, 2]), secondEnumerations);

    first.combine(second);

    this.assertEnumerations(0, firstEnumerations.value); // adapted:DIV-9.2
    this.assertEnumerations(0, secondEnumerations.value); // adapted:DIV-9.2

    first.combine(second).take(1).all();

    this.assertEnumerations(1, firstEnumerations.value); // adapted:DIV-9.2
    this.assertEnumerations(1, secondEnumerations.value); // adapted:DIV-9.2

});

portedTest(`${ID}::testConcatIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const firstEnumerations = new Ref(0); // adapted:DIV-9.2
    const secondEnumerations = new Ref(0); // adapted:DIV-9.2
    const first = this.countEnumerations(this.make([1, 2]), firstEnumerations);
    const second = this.countEnumerations(this.make([1, 2]), secondEnumerations);

    first.concat(second);

    this.assertEnumerations(0, firstEnumerations.value); // adapted:DIV-9.2
    this.assertEnumerations(0, secondEnumerations.value); // adapted:DIV-9.2

    first.concat(second).take(2).all();

    this.assertEnumerations(2, firstEnumerations.value); // adapted:DIV-9.2
    this.assertEnumerations(0, secondEnumerations.value); // adapted:DIV-9.2

    firstEnumerations.value = 0; // adapted:DIV-9.2
    secondEnumerations.value = 0; // adapted:DIV-9.2

    first.concat(second).take(3).all();

    this.assertEnumerations(2, firstEnumerations.value); // adapted:DIV-9.2
    this.assertEnumerations(1, secondEnumerations.value); // adapted:DIV-9.2

});

portedTest(`${ID}::testMultiplyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.multiply(2);
    });

    this.assertEnumeratesCollectionOnce(
        this.make([1, 2, 3]),
        (collection: LazyCollection) => {
            return collection.multiply(3).all();
        }
    );

});

portedTest(`${ID}::testContainsIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection.contains(5);
    });

});

portedTest(`${ID}::testDoesntContainIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection.doesntContain(5);
    });

});

portedTest(`${ID}::testContainsStrictIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection.containsStrict(5);
    });

});

portedTest(`${ID}::testCountEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.count();
    });

});

portedTest(`${ID}::testCountByIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.countBy();
    });

    this.assertEnumeratesCollectionOnce(
        this.make([1, 2, 2, 3]),
        (collection: LazyCollection) => {
            collection.countBy().all();
        }
    );

});

portedTest(`${ID}::testCrossJoinIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.crossJoin([1]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.crossJoin([1], [2]).all();
    });

});

portedTest(`${ID}::testDiffIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.diff([1, 2]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.diff([1, 2]).all();
    });

});

portedTest(`${ID}::testDiffAssocIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.diffAssoc([1, 2]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.diffAssoc([1, 2]).all();
    });

});

portedTest(`${ID}::testDiffAssocUsingIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.diffAssocUsing([1, 2], 'strcasecmp');
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.diffAssocUsing([1, 2], 'strcasecmp').all();
    });

});

portedTest(`${ID}::testDiffKeysIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.diffKeys([1, 2]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.diffKeys([1, 2]).all();
    });

});

portedTest(`${ID}::testDiffKeysUsingIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.diffKeysUsing([1, 2], 'strcasecmp');
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.diffKeysUsing([1, 2], 'strcasecmp').all();
    });

});

portedTest(`${ID}::testDiffUsingIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.diffUsing([1, 2], 'strcasecmp');
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.diffUsing([1, 2], 'strcasecmp').all();
    });

});

portedTest(`${ID}::testDuplicatesIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.duplicates();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.duplicates().all();
    });

});

portedTest(`${ID}::testDuplicatesStrictIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.duplicatesStrict();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.duplicatesStrict().all();
    });

});

portedTest(`${ID}::testEachIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection.each((value: number, _key: number) => {
            if (looseEquals(value, 5)) {
                return false;
            }
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.each((_value: number, _key: number) => {
            // Silence is golden!
        });
    });

    this.assertEnumerates(5, (collection: LazyCollection) => {
        for (const [_key, value] of collection.entries()) {
            if (looseEquals(value, 5)) {
                return false;
            }
        }
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        for (const [_key, _value] of collection.entries()) {
            // Silence is golden!
        }
    });

});

portedTest(`${ID}::testEachSpreadIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([[1, 2], [3, 4], [5, 6], [7, 8]]);

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.eachSpread((first: number, _second: number, _key: number) => {
            if (looseEquals(first, 3)) {
                return false;
            }
        });
    });

    this.assertEnumeratesCollectionOnce(data, (collection: LazyCollection) => {
        collection.eachSpread((_first: number, _second: number, _key: number) => {
            // Silence is golden!
        });
    });

});

portedTest(`${ID}::testEveryIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.every((value: number) => {
            return looseEquals(value, 1);
        });
    });

    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }]);

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.every('a', 1);
    });

});

portedTest(`${ID}::testExceptIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.except([1, 2]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.except([1, 2]).all();
    });

});

portedTest(`${ID}::testFilterIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.filter((value: number) => {
            return value > 5;
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.filter((value: number) => {
            return value > 5;
        }).all();
    });

});

portedTest(`${ID}::testFirstIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.first();
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.first((value: number) => {
            return looseEquals(value, 2);
        });
    });

});

portedTest(`${ID}::testFirstWhereIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }]);

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.firstWhere('a', 2);
    });

});

// testFlatMapIsLazy remains unregistered pending ESC-14.8-2: runtime array_sum contract.

portedTest(`${ID}::testFlattenIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([1, [2, 3], [4, 5], [6, 7]]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.flatten();
    });

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.flatten().take(3).all();
    });

});

portedTest(`${ID}::testFlipIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.flip();
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.flip().take(2).all();
    });

});

portedTest(`${ID}::testForPageIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.forPage(2, 10);
    });

    this.assertEnumerates(20, (collection: LazyCollection) => {
        collection.forPage(2, 10).all();
    });

});

portedTest(`${ID}::testGetIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection.get(4);
    });

});

portedTest(`${ID}::testGroupByIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.groupBy((value: number) => {
            return value % 5;
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.groupBy((value: number) => {
            return value % 5;
        }).all();
    });

});

portedTest(`${ID}::testHasIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection.has(4);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.has('non-existent');
    });

});

portedTest(`${ID}::testHasAnyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection.hasAny(4);
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.hasAny([1, 4]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.hasAny(['non', 'existent']);
    });

});

portedTest(`${ID}::testImplodeEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.implode(', ');
    });

});

portedTest(`${ID}::testIntersectIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.intersect([1, 2, 3]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.intersect([1, 2, 3]).all();
    });

});

portedTest(`${ID}::testIntersectUsingIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.intersectUsing([1, 2], 'strcasecmp');
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.intersectUsing([1, 2], 'strcasecmp').all();
    });

});

portedTest(`${ID}::testIntersectAssocIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.intersectAssoc([1, 2]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.intersectAssoc([1, 2]).all();
    });

});

portedTest(`${ID}::testIntersectAssocUsingIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.intersectAssocUsing([1, 2], 'strcasecmp');
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.intersectAssocUsing([1, 2], 'strcasecmp').all();
    });

});

portedTest(`${ID}::testIntersectByKeysIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.intersectByKeys([1, 2, 3]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.intersectByKeys([1, 2, 3]).all();
    });

});

portedTest(`${ID}::testIsEmptyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.isEmpty();
    });

});

portedTest(`${ID}::testIsNotEmptyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.isNotEmpty();
    });

});

portedTest(`${ID}::testContainsOneItemIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.containsOneItem();
    });

});

portedTest(`${ID}::testHasSoleIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.hasSole();
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.hasSole((item: number) => item <= 2);
    });

    this.assertEnumeratesCollection(
        LazyCollection.times(10, (i: number) => ({ age: i })),
        2,
        (collection: LazyCollection) => collection.hasSole('age', '<=', 2),
    );

});

portedTest(`${ID}::testHasManyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.hasMany();
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.hasMany((item: number) => item <= 2);
    });

    this.assertEnumeratesCollection(
        LazyCollection.times(10, (i: number) => ({ age: i })),
        2,
        (collection: LazyCollection) => collection.hasMany('age', '<=', 2),
    );

});

portedTest(`${ID}::testJoinIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.join(', ', ' and ');
    });

});

portedTest(`${ID}::testJsonSerializeEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.jsonSerialize();
    });

});

portedTest(`${ID}::testKeyByIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.keyBy((value: number) => {
            return 'key-of-' + toPhpString(value);
        });
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.keyBy((value: number) => {
            return 'key-of-' + toPhpString(value);
        }).take(2).all();
    });

});

portedTest(`${ID}::testKeysIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.keys();
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.keys().take(2).all();
    });

});

portedTest(`${ID}::testLastEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.last();
    });

});

portedTest(`${ID}::testMapIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.map((value: number) => {
            return value + 1;
        });
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.map((value: number) => {
            return value + 1;
        }).take(2).all();
    });

});

portedTest(`${ID}::testMapIntoIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.mapInto(stdClass);
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.mapInto(stdClass).take(2).all();
    });

});

portedTest(`${ID}::testMapSpreadIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([[1, 2], [3, 4], [5, 6], [7, 8]]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.mapSpread((first: number, second: number, key: number) => {
            return first + second + key;
        });
    });

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.mapSpread((first: number, second: number, key: number) => {
            return first + second + key;
        }).take(2).all();
    });

});

portedTest(`${ID}::testMapToDictionaryIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.mapToDictionary((value: number, key: number) => {
            return new PhpArray([[value, key]]);
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.mapToDictionary((value: number, key: number) => {
            return new PhpArray([[value, key]]);
        }).all();
    });

});

portedTest(`${ID}::testMapToGroupsIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.mapToGroups((value: number, key: number) => {
            return new PhpArray([[value, key]]);
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.mapToGroups((value: number, key: number) => {
            return new PhpArray([[value, key]]);
        }).all();
    });

});

portedTest(`${ID}::testMapWithKeysIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.mapWithKeys((value: number, key: number) => {
            return new PhpArray([[value, key]]);
        });
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.mapWithKeys((value: number, key: number) => {
            return new PhpArray([[value, key]]);
        }).take(2).all();
    });

});

portedTest(`${ID}::testMaxEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.max();
    });

});

portedTest(`${ID}::testMedianEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.median();
    });

});

portedTest(`${ID}::testAvgEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.avg();
    });

});

portedTest(`${ID}::testMergeIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.merge([1, 2, 3]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.merge([1, 2, 3]).all();
    });

});

portedTest(`${ID}::testMergeRecursiveIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.mergeRecursive([1, 2, 3]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.mergeRecursive([1, 2, 3]).all();
    });

});

portedTest(`${ID}::testMinEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.min();
    });

});

portedTest(`${ID}::testModeEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.mode();
    });

});

portedTest(`${ID}::testNthIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.nth(5);
    });

    this.assertEnumerates(11, (collection: LazyCollection) => {
        collection.nth(5).take(3).all();
    });

});

portedTest(`${ID}::testOnlyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.only(5, 6, 7);
    });

    this.assertEnumerates(8, (collection: LazyCollection) => {
        collection.only(5, 6, 7).all();
    });

});

portedTest(`${ID}::testPadIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.pad(200, null);
        collection.pad(-200, null);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.pad(20, null).all();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.pad(-20, null).all();
    });

});

portedTest(`${ID}::testPartitionEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.partition((value: number) => {
            return value > 10;
        });
    });

});

portedTest(`${ID}::testPipeDoesNotEnumerate`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.pipe(() => {
            // Silence is golden!
        });
    });

});

portedTest(`${ID}::testPluckIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.pluck('a');
    });

    this.assertEnumeratesCollectionOnce(data, (collection: LazyCollection) => {
        collection.pluck('a').all();
    });

});

portedTest(`${ID}::testRandomEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.random();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.random(5);
    });

});

portedTest(`${ID}::testRangeIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = LazyCollection.range(10, 1000);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.take(50);
    });

    this.assertEnumeratesCollection(data, 5, (collection: LazyCollection) => {
        collection.take(5).all();
    });

});

portedTest(`${ID}::testReduceIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        this.rescue(() => {
            collection.reduce((_total: number, _value: number) => {
                throw new Exception('Short-circuit');
            }, 0);
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.reduce((total: number, value: number) => {
            return total + value;
        }, 0);
    });

});

portedTest(`${ID}::testReduceSpreadIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        this.rescue(() => {
            collection.reduceSpread((_one: number, _two: number, _value: number) => {
                throw new Exception('Short-circuit');
            }, 0, 0);
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.reduceSpread((total: number, max: number, value: number) => {
            return [total + value, phpMax(max, value)];
        }, 0, 0);
    });

});

portedTest(`${ID}::testRejectIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.reject((value: number) => {
            return value % 2;
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.reject((value: number) => {
            return value % 2;
        }).all();
    });

});

portedTest(`${ID}::testRememberIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.remember();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection = collection.remember();

        collection.all();
        collection.all();
    });

    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection = collection.remember();

        collection.take(5).all();
        collection.take(5).all();
    });

});

portedTest(`${ID}::testReplaceIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.replace(new PhpArray([[5, 'a'], [10, 'b']]));
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.replace(new PhpArray([[5, 'a'], [10, 'b']])).all();
    });

});

portedTest(`${ID}::testReplaceRecursiveIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.replaceRecursive(new PhpArray([[5, 'a'], [10, 'b']]));
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.replaceRecursive(new PhpArray([[5, 'a'], [10, 'b']])).all();
    });

});

portedTest(`${ID}::testReverseIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.reverse();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.reverse().all();
    });

});

portedTest(`${ID}::testSearchIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection.search(5);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.search('missing');
    });

});

portedTest(`${ID}::testShuffleIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.shuffle();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.shuffle().all();
    });

});

portedTest(`${ID}::testSlidingIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.sliding();
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.sliding().take(1).all();
    });

    this.assertEnumerates(3, (collection: LazyCollection) => {
        collection.sliding().take(2).all();
    });

    this.assertEnumerates(13, (collection: LazyCollection) => {
        collection.sliding(3, 5).take(3).all();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.sliding().all();
    });

});

portedTest(`${ID}::testSkipIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.skip(10);
    });

    this.assertEnumerates(12, (collection: LazyCollection) => {
        collection.skip(10).take(2).all();
    });

});

portedTest(`${ID}::testSkipUntilIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.skipUntil(Infinity);
    });

    this.assertEnumerates(10, (collection: LazyCollection) => {
        collection.skipUntil(10).first();
    });

    this.assertEnumerates(10, (collection: LazyCollection) => {
        collection.skipUntil((item: number) => {
            return item === 10;
        }).first();
    });

});

portedTest(`${ID}::testSkipWhileIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.skipWhile(1);
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.skipWhile(1).first();
    });

    this.assertEnumerates(10, (collection: LazyCollection) => {
        collection.skipWhile((item: number) => {
            return item < 10;
        }).first();
    });

});

portedTest(`${ID}::testSliceIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.slice(2);
        collection.slice(2, 2);
        collection.slice(-2, 2);
    });

    this.assertEnumerates(4, (collection: LazyCollection) => {
        collection.slice(2).take(2).all();
    });

    this.assertEnumerates(4, (collection: LazyCollection) => {
        collection.slice(2, 2).all();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.slice(-2, 2).all();
    });

});

portedTest(`${ID}::testFindFirstOrFailIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.firstOrFail();
    });

    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.firstOrFail((item: number) => {
            return item === 1;
        });
    });

    this.assertEnumerates(100, (collection: LazyCollection) => {
        try {
            collection.firstOrFail((item: number) => {
                return item === 101;
            });
        } catch (error) {
            if (!(error instanceof ItemNotFoundException)) throw error;
            //
        }
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.firstOrFail((item: number) => {
            return item % 2 === 0;
        });
    });

});

portedTest(`${ID}::testSomeIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(5, (collection: LazyCollection) => {
        collection.some((value: number) => {
            return looseEquals(value, 5);
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.some((_value: number) => {
            return false;
        });
    });

});

portedTest(`${ID}::testSoleIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(2, (collection: LazyCollection) => {
        try {
            collection.sole();
        } catch (error) {
            if (!(error instanceof MultipleItemsFoundException)) throw error;
            //
        }
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.sole((item: number) => {
            return item === 1;
        });
    });

    this.assertEnumerates(4, (collection: LazyCollection) => {
        try {
            collection.sole((item: number) => {
                return item % 2 === 0;
            });
        } catch (error) {
            if (!(error instanceof MultipleItemsFoundException)) throw error;
            //
        }
    });

});

portedTest(`${ID}::testSortIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.sort();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.sort().all();
    });

});

portedTest(`${ID}::testSortDescIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.sortDesc();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.sortDesc().all();
    });

});

portedTest(`${ID}::testSortByIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.sortBy((value: number) => {
            return value;
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.sortBy((value: number) => {
            return value;
        }).all();
    });

});

portedTest(`${ID}::testSortByDescIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.sortByDesc((value: number) => {
            return value;
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.sortByDesc((value: number) => {
            return value;
        }).all();
    });

});

portedTest(`${ID}::testSortKeysIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.sortKeys();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.sortKeys().all();
    });

});

portedTest(`${ID}::testSortKeysDescIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.sortKeysDesc();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.sortKeysDesc().all();
    });

});

portedTest(`${ID}::testSplitIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.split(4);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.split(4).all();
    });

});

portedTest(`${ID}::testSumEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.sum();
    });

});

portedTest(`${ID}::testTakeIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.take(10);
    });

    this.assertEnumerates(10, (collection: LazyCollection) => {
        collection.take(10).all();
    });

});

portedTest(`${ID}::testTakeUntilIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.takeUntil(Infinity);
    });

    this.assertEnumerates(10, (collection: LazyCollection) => {
        collection.takeUntil(10).all();
    });

    this.assertEnumerates(10, (collection: LazyCollection) => {
        collection.takeUntil((item: number) => {
            return item === 10;
        }).all();
    });

});

portedTest(`${ID}::testTakeUntilTimeoutIsLazy`, { case: ClockBlockedTest }, async function () {
    const Carbon = support<CarbonSurface>();
    tap((Mockery.mock(fqcn(LazyCollection) + '[now]').times(100) as ClockCollection), (mock: ClockCollection) => {
        this.assertDoesNotEnumerateCollection(mock, (mock: LazyCollection) => {
            const timeout = Carbon.now();

            const _results = (mock as ClockCollection)
                .tap((collection: LazyCollection) => {
                    tap(collection as ClockCollection)
                        .mockery_init((mock as ClockCollection).mockery_getContainer())
                        .shouldAllowMockingProtectedMethods()
                        .expects('now')
                        .times(1)
                        .andReturn(
                            timeout.getTimestamp()
                        );
                })
                .takeUntilTimeout(timeout)
                .all();
        });
    });

    tap((Mockery.mock(fqcn(LazyCollection) + '[now]').times(100) as ClockCollection), (mock: ClockCollection) => {
        this.assertEnumeratesCollection(mock, 1, (mock: LazyCollection) => {
            const timeout = Carbon.now();

            const _results = (mock as ClockCollection)
                .tap((collection: LazyCollection) => {
                    tap(collection as ClockCollection)
                        .mockery_init((mock as ClockCollection).mockery_getContainer())
                        .shouldAllowMockingProtectedMethods()
                        .expects('now')
                        .times(2)
                        .andReturn(
                            cloneClock(timeout).sub(1, 'minute').getTimestamp(),
                            timeout.getTimestamp()
                        );
                })
                .takeUntilTimeout(timeout)
                .all();
        });
    });

    tap((Mockery.mock(fqcn(LazyCollection) + '[now]').times(100) as ClockCollection), (mock: ClockCollection) => {
        this.assertEnumeratesCollectionOnce(mock, (mock: LazyCollection) => {
            const timeout = Carbon.now();

            const _results = (mock as ClockCollection)
                .tap((collection: LazyCollection) => {
                    tap(collection as ClockCollection)
                        .mockery_init((mock as ClockCollection).mockery_getContainer())
                        .shouldAllowMockingProtectedMethods()
                        .expects('now')
                        .times(100)
                        .andReturn(
                            cloneClock(timeout).sub(1, 'minute').getTimestamp()
                        );
                })
                .takeUntilTimeout(timeout)
                .all();
        });
    });

});

portedTest(`${ID}::testTakeWhileIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.takeWhile(0);
    });

    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.takeWhile(0).all();
    });

    this.assertEnumerates(10, (collection: LazyCollection) => {
        collection.takeWhile((item: number) => {
            return item < 10;
        }).all();
    });

});

portedTest(`${ID}::testTapDoesNotEnumerate`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.tap((_collection: LazyCollection) => {
            // Silence is golden!
        });
    });

});

portedTest(`${ID}::testTapEachIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.tapEach((_value: number) => {
            // Silence is golden!
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.tapEach((_value: number) => {
            // Silence is golden!
        }).all();
    });

});

portedTest(`${ID}::testThrottleIsLazy`, { case: ClockBlockedTest }, async function () {
    const Sleep = support<SleepSurface>();
    Sleep.fake();

    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        (collection as ClockCollection).throttle(10);
    });

    this.assertEnumerates(5, (collection: LazyCollection) => {
        (collection as ClockCollection).throttle(10).take(5).all();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        (collection as ClockCollection).throttle(10).all();
    });

    Sleep.fake(false);

});

portedTest(`${ID}::testTimesIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = LazyCollection.times(Infinity);

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.take(2).all();
    });

});

portedTest(`${ID}::testToArrayEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.toArray();
    });

});

portedTest(`${ID}::testToJsonEnumeratesOnce`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.toJson();
    });

});

portedTest(`${ID}::testUnionIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.union([4, 5, 6]);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.union([4, 5, 6]).all();
    });

});

portedTest(`${ID}::testUniqueIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.unique();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.unique().all();
    });

});

portedTest(`${ID}::testUniqueStrictIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.uniqueStrict();
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        collection.uniqueStrict().all();
    });

});

portedTest(`${ID}::testUnlessDoesNotEnumerate`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.unless(true, (_collection: LazyCollection) => {
            // Silence is golden!
        });

        collection.unless(false, (_collection: LazyCollection) => {
            // Silence is golden!
        });
    });

});

portedTest(`${ID}::testUnlessEmptyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.unlessEmpty((_collection: LazyCollection) => {
            // Silence is golden!
        });
    });

});

portedTest(`${ID}::testUnlessNotEmptyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.unlessNotEmpty((_collection: LazyCollection) => {
            // Silence is golden!
        });
    });

});

portedTest(`${ID}::testUnwrapEnumeratesOne`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumeratesOnce((collection: LazyCollection) => {
        LazyCollection.unwrap(collection);
    });

});

portedTest(`${ID}::testValuesIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.values();
    });

    this.assertEnumerates(2, (collection: LazyCollection) => {
        collection.values().take(2).all();
    });

});

portedTest(`${ID}::testWhenDoesNotEnumerate`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        collection.when(true, (_collection: LazyCollection) => {
            // Silence is golden!
        });

        collection.when(false, (_collection: LazyCollection) => {
            // Silence is golden!
        });
    });

});

portedTest(`${ID}::testWhenEmptyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.whenEmpty((_collection: LazyCollection) => {
            // Silence is golden!
        });
    });

});

portedTest(`${ID}::testWhenNotEmptyIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertEnumerates(1, (collection: LazyCollection) => {
        collection.whenNotEmpty((_collection: LazyCollection) => {
            // Silence is golden!
        });
    });

});

portedTest(`${ID}::testWhereIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.where('a', '<', 3);
    });

    this.assertEnumeratesCollection(data, 1, (collection: LazyCollection) => {
        collection.where('a', '<', 3).take(1).all();
    });

});

portedTest(`${ID}::testWhereBetweenIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereBetween('a', [2, 4]);
    });

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.whereBetween('a', [2, 4]).take(1).all();
    });

});

portedTest(`${ID}::testWhereInIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereIn('a', [2, 3]);
    });

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.whereIn('a', [2, 3]).take(1).all();
    });

});

portedTest(`${ID}::testWhereInstanceOfIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make({ a: 0 }).concat(
        this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }])
            .mapInto(stdClass)
    );

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereInstanceOf(stdClass);
    });

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.whereInstanceOf(stdClass).take(1).all();
    });

});

portedTest(`${ID}::testWhereInStrictIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereInStrict('a', ['2', 3]);
    });

    this.assertEnumeratesCollection(data, 3, (collection: LazyCollection) => {
        collection.whereInStrict('a', ['2', 3]).take(1).all();
    });

});

portedTest(`${ID}::testWhereNotBetweenIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereNotBetween('a', [1, 2]);
    });

    this.assertEnumeratesCollection(data, 3, (collection: LazyCollection) => {
        collection.whereNotBetween('a', [1, 2]).take(1).all();
    });

});

portedTest(`${ID}::testWhereNotInIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereNotIn('a', [1, 2]);
    });

    this.assertEnumeratesCollection(data, 3, (collection: LazyCollection) => {
        collection.whereNotIn('a', [1, 2]).take(1).all();
    });

});

portedTest(`${ID}::testWhereNotInStrictIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereNotInStrict('a', ['1', 2]);
    });

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.whereNotInStrict('a', [1, '2']).take(1).all();
    });

});

portedTest(`${ID}::testWhereNotNullIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    let data = this.make([{ a: 1 }, { a: null }, { a: 2 }, { a: 3 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereNotNull('a');
    });

    this.assertEnumeratesCollectionOnce(data, (collection: LazyCollection) => {
        collection.whereNotNull('a').all();
    });

    data = this.make([1, null, 2, null, 3]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereNotNull();
    });

    this.assertEnumeratesCollectionOnce(data, (collection: LazyCollection) => {
        collection.whereNotNull().all();
    });

});

portedTest(`${ID}::testWhereNullIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    let data = this.make([{ a: 1 }, { a: null }, { a: 2 }, { a: 3 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereNull('a');
    });

    this.assertEnumeratesCollectionOnce(data, (collection: LazyCollection) => {
        collection.whereNull('a').all();
    });

    data = this.make([1, null, 2, null, 3]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereNull();
    });

    this.assertEnumeratesCollectionOnce(data, (collection: LazyCollection) => {
        collection.whereNull().all();
    });

});

portedTest(`${ID}::testWhereStrictIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.whereStrict('a', 2);
    });

    this.assertEnumeratesCollection(data, 2, (collection: LazyCollection) => {
        collection.whereStrict('a', 2).take(1).all();
    });

});

portedTest(`${ID}::testWithHeartbeatIsLazy`, { case: ClockBlockedTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        (collection as ClockCollection).withHeartbeat(1, () => {
            // Heartbeat callback
        });
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        (collection as ClockCollection).withHeartbeat(1, () => {
            // Heartbeat callback
        }).all();
    });

});

portedTest(`${ID}::testWrapIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    this.assertDoesNotEnumerate((collection: LazyCollection) => {
        LazyCollection.wrap(collection);
    });

    this.assertEnumeratesOnce((collection: LazyCollection) => {
        LazyCollection.wrap(collection).all();
    });

});

portedTest(`${ID}::testZipIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const firstEnumerations = new Ref(0); // adapted:DIV-9.2
    const secondEnumerations = new Ref(0); // adapted:DIV-9.2
    const first = this.countEnumerations(this.make([1, 2]), firstEnumerations);
    const second = this.countEnumerations(this.make([1, 2]), secondEnumerations);

    first.zip(second);

    this.assertEnumerations(0, firstEnumerations.value); // adapted:DIV-9.2
    this.assertEnumerations(0, secondEnumerations.value); // adapted:DIV-9.2

    first.zip(second).take(1).all();

    this.assertEnumerations(1, firstEnumerations.value); // adapted:DIV-9.2
    this.assertEnumerations(1, secondEnumerations.value); // adapted:DIV-9.2

});
