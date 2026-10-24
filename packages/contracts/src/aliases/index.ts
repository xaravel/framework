// `@xaravel/contracts/aliases`: Upstream's container alias table as data, and each service's canonical token
// (AD-1.4, ESC-10.4-1). Importing it validates the table.
export { aliasResolver, canonicalToken, validateAliasTable } from "./canonical";
export type { Abstract, AliasResolver, AliasTable } from "./canonical";
export { CORE_CONTAINER_ALIASES, PROVIDER_ALIASES, PROVIDER_BINDINGS } from "./table";
