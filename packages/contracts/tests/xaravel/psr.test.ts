// Xaravel Test for Story 10.1: the `@xaravel/contracts/psr` tokens (AD-1.1, AD-2.3, ESC-10.1-4). Every expected FQCN,
// method list and parameter list comes from the committed API surface's PSR rows. The namespace set and the interface
// count (8) are the spec's, and so are the two parent relations (Upstream's `extends`, ESC-10.1-6), which the rows
// do not carry.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Assert, TestCase, xaravelTest } from "@xaravel/assert";
import { Double } from "@xaravel/mockery";
import { fqcn } from "@xaravel/runtime/registry";
import { CLASS_FQCN, CONTRACT_METHODS, CONTRACT_PARAMETERS, CONTRACT_PARENTS } from "@xaravel/contracts";
import * as psr from "@xaravel/contracts/psr";
import { CacheException, ContainerExceptionInterface, InvalidArgumentException, LoggerInterface, NotFoundExceptionInterface } from "@xaravel/contracts/psr";
import { assertSameAbstract } from "./support/contract-namespaces";

interface Row {
  readonly fqcn: string;
  readonly kind: string;
  readonly member: string | null;
  readonly parameters?: readonly { readonly name: string }[];
}

const PSR_NAMESPACES = ["Psr\\Container\\", "Psr\\Log\\", "Psr\\SimpleCache\\"];

/** The committed API surface's rows under the PSR namespaces `@xaravel/contracts/psr` ports, in file order. */
function psrRows(): Row[] {
  const text = readFileSync(join(import.meta.dir, "..", "..", "..", "..", "conformance", "api-surface", "contracts.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Row)
    .filter((row) => PSR_NAMESPACES.some((prefix) => row.fqcn.startsWith(prefix)));
}

/** The short name of `name`, its last `\` segment. */
function shortName(name: string): string {
  return name.slice(name.lastIndexOf("\\") + 1);
}

class Logger implements LoggerInterface {
  get [LoggerInterface.brand](): true {
    return true as const;
  }

  emergency(): void {}
  alert(): void {}
  critical(): void {}
  error(): void {}
  warning(): void {}
  notice(): void {}
  info(): void {}
  debug(): void {}
  log(): void {}
}

class EntryNotFound extends Error implements NotFoundExceptionInterface {
  get [ContainerExceptionInterface.brand](): true {
    return true as const;
  }

  get [NotFoundExceptionInterface.brand](): true {
    return true as const;
  }
}

class ContainerFailure extends Error implements ContainerExceptionInterface {
  get [ContainerExceptionInterface.brand](): true {
    return true as const;
  }
}

class InvalidKey extends Error implements InvalidArgumentException {
  get [CacheException.brand](): true {
    return true as const;
  }

  get [InvalidArgumentException.brand](): true {
    return true as const;
  }
}

class CacheFailure extends Error implements CacheException {
  get [CacheException.brand](): true {
    return true as const;
  }
}

xaravelTest(
  "XT-contracts-4",
  "@xaravel/contracts/psr exports exactly the PSR container, log and simple-cache interfaces' tokens under their Upstream names (AD-2.3), each with brand Symbol.for('<FQCN>') and its committed rows' method and parameter names, and instanceof reads the brands as for every contract token (AD-1.1); NotFoundExceptionInterface and InvalidArgumentException record their Upstream parents ContainerExceptionInterface and CacheException at Symbol.for('xaravel.contract.parents') and the other six none, so a Mockery or PHPUnit double of either child is instanceof its parent too, and a double of a parent is not instanceof the child (ESC-10.1-6)",
  () => {
    const rows = psrRows();
    const interfaces = rows.filter((row) => row.kind === "interface").map((row) => row.fqcn);
    Assert.assertSame(8, interfaces.length);

    // The runtime exports are exactly the interfaces' tokens, by short name.
    const exported = psr as unknown as Record<string, unknown>;
    const expectedNames = interfaces.map(shortName).sort();
    Assert.assertSame(JSON.stringify(expectedNames), JSON.stringify(Object.keys(exported).sort()));

    for (const name of interfaces) {
      const token = exported[shortName(name)] as Record<symbol, unknown> & { readonly brand: symbol };
      Assert.assertSame(name, fqcn(token));
      Assert.assertSame(name, token[CLASS_FQCN]);
      Assert.assertSame(Symbol.for(name), token.brand);

      const methodRows = rows.filter((row) => row.fqcn === name && row.kind === "method");
      const methods = token[CONTRACT_METHODS] as readonly string[];
      const parameters = token[CONTRACT_PARAMETERS] as Readonly<Record<string, readonly string[]>>;
      Assert.assertSame(JSON.stringify(methodRows.map((row) => row.member)), JSON.stringify(methods), name);
      Assert.assertSame(methodRows.length, Object.keys(parameters).length, name);
      for (const row of methodRows) {
        const member = row.member as string;
        Assert.assertSame(JSON.stringify((row.parameters ?? []).map((parameter) => parameter.name)), JSON.stringify(parameters[member]), `${name}::${member}`);
      }
    }

    // Brands: a logger, and an Error carrying a not-found exception's brands, its parent's included.
    const logger: unknown = new Logger();
    Assert.assertTrue(logger instanceof LoggerInterface);
    Assert.assertFalse(new ContainerFailure() instanceof LoggerInterface);

    const notFound: unknown = new EntryNotFound("missing");
    Assert.assertTrue(notFound instanceof NotFoundExceptionInterface);
    Assert.assertTrue(notFound instanceof ContainerExceptionInterface);
    Assert.assertTrue(notFound instanceof Error);
    const failure: unknown = new ContainerFailure("failed");
    Assert.assertTrue(failure instanceof ContainerExceptionInterface);
    Assert.assertFalse(failure instanceof NotFoundExceptionInterface);

    const invalidKey: unknown = new InvalidKey("bad key");
    Assert.assertTrue(invalidKey instanceof InvalidArgumentException);
    Assert.assertTrue(invalidKey instanceof CacheException);
    const cacheFailure: unknown = new CacheFailure("failed");
    Assert.assertTrue(cacheFailure instanceof CacheException);
    Assert.assertFalse(cacheFailure instanceof InvalidArgumentException);

    // Parents: Upstream's `extends` for the two child exceptions, none for the other six.
    const expectedParents: Readonly<Record<string, readonly unknown[]>> = {
      NotFoundExceptionInterface: [ContainerExceptionInterface],
      InvalidArgumentException: [CacheException],
    };
    for (const name of interfaces) {
      const token = exported[shortName(name)] as Record<symbol, unknown>;
      const parents = token[CONTRACT_PARENTS] as readonly unknown[];
      const expected = expectedParents[shortName(name)] ?? [];
      Assert.assertTrue(Object.isFrozen(parents), name);
      Assert.assertSame(expected.length, parents.length, name);
      expected.forEach((parent, index) => assertSameAbstract(parent, parents[index], name));
    }

    // Doubles of a child contract are instances of its parent; a double of the parent is not one of the child.
    const pairs = [
      [NotFoundExceptionInterface, ContainerExceptionInterface],
      [InvalidArgumentException, CacheException],
    ] as const;
    for (const [child, parent] of pairs) {
      const mockeryDouble: unknown = Double.for(child as never);
      Assert.assertTrue(mockeryDouble instanceof child, child[CLASS_FQCN]);
      Assert.assertTrue(mockeryDouble instanceof parent, child[CLASS_FQCN]);
      const phpunitMock: unknown = new TestCase().createMock(child);
      Assert.assertTrue(phpunitMock instanceof child, child[CLASS_FQCN]);
      Assert.assertTrue(phpunitMock instanceof parent, child[CLASS_FQCN]);

      const parentDouble: unknown = Double.for(parent as never);
      Assert.assertTrue(parentDouble instanceof parent, parent[CLASS_FQCN]);
      Assert.assertFalse(parentDouble instanceof child, parent[CLASS_FQCN]);
      const parentMock: unknown = new TestCase().createMock(parent);
      Assert.assertTrue(parentMock instanceof parent, parent[CLASS_FQCN]);
      Assert.assertFalse(parentMock instanceof child, parent[CLASS_FQCN]);
    }
  },
);
