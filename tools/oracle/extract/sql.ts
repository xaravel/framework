// The SQL grammar family (Story 3.1, decisions/ESC-3.1-1.md): `sql-grammar`
// requests from DatabaseQueryBuilderTest and the five schema grammar tests.
// Bodies are read as for php-expr (no dataset bindings: the input has none).
// In DatabaseQueryBuilderTest a segment's grammar is the one of the builder
// helpers (`$this->get<X>Builder[WithProcessor]()`) its own statements call;
// none means the previous segment's; more than one, or a builder built
// another way (`getMockQueryBuilder()`, `new …Builder(`, `new …Grammar(`),
// means no request for it and the segments after it. In a
// schema grammar test it is the file's grammar.
import type { Grammar, SqlGrammarInput } from "../request";
import { readSegments, type ExtractTest, type Family, type Segment } from "./php";

const QUERY_BUILDER_TEST = "tests/Database/DatabaseQueryBuilderTest.php";

/** The schema grammar test files and their grammar. */
export const SCHEMA_GRAMMAR_FILES: Readonly<Record<string, Grammar>> = {
  "tests/Database/DatabaseSQLiteSchemaGrammarTest.php": "sqlite",
  "tests/Database/DatabaseMySqlSchemaGrammarTest.php": "mysql",
  "tests/Database/DatabaseMariaDbSchemaGrammarTest.php": "mariadb",
  "tests/Database/DatabasePostgresSchemaGrammarTest.php": "pgsql",
  "tests/Database/DatabaseSqlServerSchemaGrammarTest.php": "sqlsrv",
};

export const SQL_FILES: readonly string[] = [QUERY_BUILDER_TEST, ...Object.keys(SCHEMA_GRAMMAR_FILES)];

/** DatabaseQueryBuilderTest's builder helpers (lowercase) and their grammar. */
export const BUILDER_HELPERS: Readonly<Record<string, Grammar>> = {
  getbuilder: "base",
  getpostgresbuilder: "pgsql",
  getpostgresbuilderwithprocessor: "pgsql",
  getmysqlbuilder: "mysql",
  getmysqlbuilderwithprocessor: "mysql",
  getmariadbbuilder: "mariadb",
  getsqlitebuilder: "sqlite",
  getsqlserverbuilder: "sqlsrv",
};

/**
 * The grammars of the builder helpers `$this->…()` that the segment's own statements call, and whether they build a
 * builder another way: another `$this->…Builder…()` helper (`getMockQueryBuilder`) or `new …Builder(`/`new …Grammar(`.
 */
function helperGrammars(segment: Segment): { found: Set<Grammar>; other: boolean } {
  const found = new Set<Grammar>();
  let other = false;
  for (const statement of segment.statements) {
    const code = statement.code;
    for (let i = 0; i + 1 < code.length; i++) {
      if (code[i]!.name === "T_NEW" && /(?:Builder|Grammar)$/.test(code[i + 1]!.text)) {
        other = true;
      }
      if (i + 3 < code.length && code[i]!.text === "$this" && code[i + 1]!.name === "T_OBJECT_OPERATOR" && code[i + 3]!.name === "(") {
        const name = code[i + 2]!.text.toLowerCase();
        const grammar = BUILDER_HELPERS[name];
        if (grammar !== undefined) {
          found.add(grammar);
        } else if (name.includes("builder")) {
          other = true;
        }
      }
    }
  }
  return { found, other };
}

export const sqlFamily: Family<SqlGrammarInput> = {
  name: "sql",
  kind: "sql-grammar",
  files: SQL_FILES,
  extract(test: ExtractTest): SqlGrammarInput[] {
    if (test.method.body === null) {
      return [];
    }
    const segments = readSegments(test.file, test.method.body, { defined: [], cls: test.cls });
    const fileGrammar = SCHEMA_GRAMMAR_FILES[test.file.path] ?? null;
    const out: SqlGrammarInput[] = [];
    let current: Grammar | null = null;
    for (const segment of segments ?? []) {
      let grammar: Grammar | null = fileGrammar;
      if (fileGrammar === null) {
        const { found, other } = helperGrammars(segment);
        if (found.size > 1 || other) {
          current = null;
          continue;
        }
        if (found.size === 1) {
          current = [...found][0]!;
        }
        grammar = current;
      }
      if (grammar !== null) {
        out.push({ grammar, setup: segment.setup, exprs: segment.exprs });
      }
    }
    return out;
  },
};
