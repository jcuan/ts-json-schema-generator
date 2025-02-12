import * as path from "node:path";
import normalize from "normalize-path";
import ts from "typescript";
import type { CompletedConfig, Config } from "../src/Config.js";
import { BuildError } from "../src/Error/Errors.js";
import { globSync } from "glob";

function loadTsConfigFile(configFile: string) {
    const raw = ts.sys.readFile(configFile);

    if (!raw) {
        throw new BuildError({
            messageText: `Cannot read config file "${configFile}"`,
        });
    }

    const config = ts.parseConfigFileTextToJson(configFile, raw);

    if (config.error) {
        throw new BuildError(config.error);
    }

    if (!config.config) {
        throw new BuildError({
            messageText: `Invalid parsed config file "${configFile}"`,
        });
    }

    const parseResult = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        path.resolve(path.dirname(configFile)),
        {},
        configFile,
    );
    parseResult.options.noEmit = true;
    delete parseResult.options.out;
    delete parseResult.options.outDir;
    delete parseResult.options.outFile;
    delete parseResult.options.declaration;
    delete parseResult.options.declarationDir;
    delete parseResult.options.declarationMap;

    return parseResult;
}

function getTsConfig(config: Config) {
    if (config.tsconfig) {
        return loadTsConfigFile(config.tsconfig);
    }

    return {
        fileNames: [],
        options: {
            noEmit: true,
            emitDecoratorMetadata: true,
            experimentalDecorators: true,
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS,
            strictNullChecks: false,
        },
    };
}

export function createProgram(config: CompletedConfig): ts.Program {
    const rootNamesFromPath = config.path
        ? globSync(normalize(path.resolve(config.path))).map((rootName) => normalize(rootName))
        : [];
    const tsconfig = getTsConfig(config);
    const rootNames = rootNamesFromPath.length ? rootNamesFromPath : tsconfig.fileNames;

    if (!rootNames.length) {
        throw new BuildError({
            messageText: "No input files",
        });
    }

    const program: ts.Program = ts.createProgram(rootNames, tsconfig.options);

    if (!config.skipTypeCheck) {
        const diagnostics = ts.getPreEmitDiagnostics(program);

        if (diagnostics.length) {
            throw new BuildError({
                messageText: "Type check error",
                relatedInformation: [...diagnostics],
            });
        }
    }

    return program;
}
