// `@xaravel/config`: Laravel's `illuminate/config` component (v13.37.0), plus the `vlucas/phpdotenv` v5.7.0 port AD-22
// gives this package, and the `phpoption/phpoption` 1.10.0 and `graham-campbell/result-type` 1.2.0 ports phpdotenv
// is built on (ESC-15.2-4), each class registered under its Upstream FQCN.
export { Repository } from "./Repository";

// PhpOption (phpoption/phpoption 1.10.0). `Option` loads first: its subclasses extend it.
export { Option } from "./PhpOption/Option";
export { None } from "./PhpOption/None";
export { Some } from "./PhpOption/Some";
export { LazyOption } from "./PhpOption/LazyOption";

// GrahamCampbell\ResultType (graham-campbell/result-type 1.2.0). `Error` is Upstream's name; import it under an
// alias where the JS global is also needed.
export { Result } from "./GrahamCampbell/ResultType/Result";
export { Success } from "./GrahamCampbell/ResultType/Success";
export { Error } from "./GrahamCampbell/ResultType/Error";

// Dotenv (vlucas/phpdotenv v5.7.0).
export { Dotenv } from "./Dotenv/Dotenv";
export { Validator } from "./Dotenv/Validator";
export { ExceptionInterface } from "./Dotenv/Exception/ExceptionInterface";
export { InvalidEncodingException } from "./Dotenv/Exception/InvalidEncodingException";
export { InvalidFileException } from "./Dotenv/Exception/InvalidFileException";
export { InvalidPathException } from "./Dotenv/Exception/InvalidPathException";
export { ValidationException } from "./Dotenv/Exception/ValidationException";
export { Loader } from "./Dotenv/Loader/Loader";
export { LoaderInterface } from "./Dotenv/Loader/LoaderInterface";
export { Resolver } from "./Dotenv/Loader/Resolver";
export { Entry } from "./Dotenv/Parser/Entry";
export { EntryParser } from "./Dotenv/Parser/EntryParser";
export { Lexer } from "./Dotenv/Parser/Lexer";
export { Lines } from "./Dotenv/Parser/Lines";
export { Parser } from "./Dotenv/Parser/Parser";
export { ParserInterface } from "./Dotenv/Parser/ParserInterface";
export { Value } from "./Dotenv/Parser/Value";
export { AdapterRepository } from "./Dotenv/Repository/AdapterRepository";
export { type AdapterClass, RepositoryBuilder } from "./Dotenv/Repository/RepositoryBuilder";
export { RepositoryInterface } from "./Dotenv/Repository/RepositoryInterface";
export { AdapterInterface, type AdapterInterfaceStatic } from "./Dotenv/Repository/Adapter/AdapterInterface";
export { ApacheAdapter } from "./Dotenv/Repository/Adapter/ApacheAdapter";
export { ArrayAdapter } from "./Dotenv/Repository/Adapter/ArrayAdapter";
export { EnvConstAdapter } from "./Dotenv/Repository/Adapter/EnvConstAdapter";
export { GuardedWriter } from "./Dotenv/Repository/Adapter/GuardedWriter";
export { ImmutableWriter } from "./Dotenv/Repository/Adapter/ImmutableWriter";
export { MultiReader } from "./Dotenv/Repository/Adapter/MultiReader";
export { MultiWriter } from "./Dotenv/Repository/Adapter/MultiWriter";
export { PutenvAdapter } from "./Dotenv/Repository/Adapter/PutenvAdapter";
export { ReaderInterface } from "./Dotenv/Repository/Adapter/ReaderInterface";
export { ReplacingWriter } from "./Dotenv/Repository/Adapter/ReplacingWriter";
export { ServerConstAdapter } from "./Dotenv/Repository/Adapter/ServerConstAdapter";
export { WriterInterface } from "./Dotenv/Repository/Adapter/WriterInterface";
export { FileStore } from "./Dotenv/Store/FileStore";
export { StoreBuilder } from "./Dotenv/Store/StoreBuilder";
export { StoreInterface } from "./Dotenv/Store/StoreInterface";
export { StringStore } from "./Dotenv/Store/StringStore";
export { Paths } from "./Dotenv/Store/File/Paths";
export { Reader } from "./Dotenv/Store/File/Reader";
export { Regex } from "./Dotenv/Util/Regex";
export { Str } from "./Dotenv/Util/Str";
