/**
 * @file swan parser
 * @author mengke01(kekee000@gmail.com)
 */
import * as path from 'path';
import * as ast from '../types/ast';
import * as script from '../types/script';
import {ParserOptions} from '../types/parser';
import SwanParser from './parser';
import SwanTokenizer from './tokenizer';
import {parseScript} from './script';
import * as services from './parser-services';

export {traverseNodes} from './script/traverse';

type XDocumentFragment = ast.XDocument;
type ESLintExtendedProgram = script.ExtendedProgram;

function getFileType(options: any): string {
    const filePath = (options.filePath as string | undefined) || '.swan';
    return path.extname(filePath).slice(1)
        .toLowerCase();
}

function isInlineSjsModule(node: ast.XElement) {
    return (node.name === 'filter' || node.name === 'import-sjs')
        && node.children.length
        && node.children[0].type === 'XModule';
}

function resolveParserOptions(options: ParserOptions) {
    return Object.assign(
        {
            noOpenTag: false,
            script: {
                parser: 'espree',
                sourceType: 'module',
                ecmaVersion: 2018,
                range: true,
                loc: true,
                tokens: true,
            }
        },
        options
    );
}

export function parse(code: string, options: ParserOptions): ast.XDocument {
    const tokenizer = new SwanTokenizer(code);
    const rootAST = new SwanParser(tokenizer, resolveParserOptions(options)).parse();
    return rootAST;
}

export function parseForESLint(code: string, options: ParserOptions): ESLintExtendedProgram {
    
    const parserOptions = resolveParserOptions(options);

    // eslint-disable-next-line no-param-reassign
    let result: ESLintExtendedProgram;
    let document: XDocumentFragment | null;
    const xmlType = getFileType(parserOptions);

    // parse script
    if (xmlType === 'swan') {
        const tokenizer = new SwanTokenizer(code);
        const rootAST = new SwanParser(tokenizer, parserOptions).parse();
        result = parseScript('', parserOptions.script);
        result.ast.templateBody = rootAST;
        result.ast.range = rootAST.range;
        result.ast.tokens = rootAST.tokens;
        result.ast.comments = rootAST.comments;
        
        const sjsModules = rootAST.children
            .filter(node => node.type === 'XElement' && isInlineSjsModule(node)) as ast.XElement[];
        const moduleBody: (script.Statement | script.ModuleDeclaration)[] = [];
        for (const sjsModule of sjsModules) {
            for (const body of sjsModule.children) {
                if (body.type === 'XModule' && body.body != null) {
                    moduleBody.push(...body.body);
                }
            }
        }

        if (moduleBody.length) {
            result.ast.sourceType = 'module';
            result.ast.body = moduleBody;
        }

        document = rootAST;
    }
    else {
        result = parseScript(code, parserOptions.script);
        document = null;
    }

    result.services = Object.assign(
        result.services || {},
        services.define(result.ast, document),
    );

    return result;
}
