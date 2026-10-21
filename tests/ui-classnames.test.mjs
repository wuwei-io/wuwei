import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root=path.resolve('desktop/renderer/src');
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
const sourceFiles=files(root);
const styledClasses=new Set(sourceFiles.filter(f=>f.endsWith('.css')).flatMap(f=>[...fs.readFileSync(f,'utf8').matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map(m=>m[1])));
function possible(node){
  if(!node)return null;
  if(ts.isStringLiteralLike(node))return [node.text];
  if(ts.isJsxExpression(node)||ts.isParenthesizedExpression(node)||ts.isAsExpression(node))return possible(node.expression);
  if(ts.isConditionalExpression(node)){const a=possible(node.whenTrue),b=possible(node.whenFalse);return a||b?[...new Set([...(a||[]),...(b||[])])]:null;}
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken){
    const a=possible(node.left),b=possible(node.right);return a&&b&&a.length*b.length<=256?[...new Set(a.flatMap(x=>b.map(y=>x+y)))]:null;
  }
  return null;
}

test('conditional JSX classes retain CSS token boundaries in every resolvable state',()=>{
  const broken=[];
  for(const file of sourceFiles.filter(f=>/\.tsx$/.test(f))){
    const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node){
      if(ts.isJsxAttribute(node)&&node.name.text==='className')for(const value of possible(node.initializer)||[])for(const token of value.split(/\s+/).filter(Boolean)){
        if(styledClasses.has(token))continue;
        for(let i=1;i<token.length;i++)if(styledClasses.has(token.slice(0,i))&&styledClasses.has(token.slice(i))){
          broken.push(`${path.relative(root,file)}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1}: ${token} joins two styled classes`);break;
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(ast);
  }
  assert.deepEqual([...new Set(broken)],[]);
});
