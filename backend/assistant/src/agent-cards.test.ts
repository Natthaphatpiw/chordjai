import {describe,expect,it} from 'vitest';
import {agentCard} from './agent-cards';

const composeId='11111111-1111-4111-8111-111111111111',cancelId='22222222-2222-4222-8222-222222222222';
function contents(language:'th'|'en',options=false){
 const card=agentCard('Care diary','What would you like to record?',[
  ...(options?[{id:'33333333-3333-4333-8333-333333333333',label:language==='en'?'A planned visit':'แผนไปพบหมอ'}]:[]),
  {id:composeId,label:language==='en'?'Type details':'พิมพ์รายละเอียด',keyboard:true},
  {id:cancelId,label:language==='en'?'Cancel task':'ยกเลิกงาน'},
 ],undefined,language);
 if(card.type!=='flex')throw new Error('Expected a Flex card');
 return card.contents as {body:{contents:{text:string}[]};footer:{contents:{style:string;color?:string;action:Record<string,unknown>}[]}};
}
describe('free-text LINE clarification cards',()=>{
 for(const language of ['th','en'] as const)it(`opens the keyboard without pretending the owner answered in ${language}`,()=>{
  const card=contents(language),[compose,cancel]=card.footer.contents;
  expect(compose).toMatchObject({style:'primary',color:'#FF8A24',action:{type:'postback',data:`agent:compose:${composeId}`,inputOption:'openKeyboard'}});
  expect(compose.action).not.toHaveProperty('displayText');expect(compose.action).not.toHaveProperty('fillInText');expect(compose.action).not.toHaveProperty('text');
  expect(cancel).toMatchObject({style:'secondary',action:{type:'postback',data:`agent:choice:${cancelId}`}});
  expect(card.body.contents.at(-1)?.text).toBe(language==='en'?'Type your details or answer, then tap Send.':'พิมพ์รายละเอียดหรือคำตอบ แล้วกดส่งได้เลย');
 });
 it('keeps real answers actionable alongside the separate typing affordance',()=>{
  const card=contents('en',true),[answer,compose,cancel]=card.footer.contents;
  expect(answer.action).toMatchObject({data:'agent:choice:33333333-3333-4333-8333-333333333333',displayText:'A planned visit'});
  expect(answer.action).not.toHaveProperty('inputOption');expect(compose.action.inputOption).toBe('openKeyboard');expect(cancel.action.displayText).toBe('Cancel task');
 });
 it('preserves ordinary confirmation and result cards without the unfinished-diary hint',()=>{
  const card=agentCard('Confirm','Review the exact item',[{id:cancelId,label:'Confirm action'}],'https://liff.line.me/example','en');
  if(card.type!=='flex')throw new Error('Expected a Flex card');
  const data=card.contents as {body:{contents:{text:string}[]};footer:{contents:{action:Record<string,unknown>}[]}};
  expect(data.body.contents.at(-1)?.text).toBe('Choose an option or type your own answer.');
  expect(data.footer.contents[0].action).toMatchObject({data:`agent:choice:${cancelId}`,displayText:'Confirm action'});
  expect(data.footer.contents[1].action).toMatchObject({type:'uri',uri:'https://liff.line.me/example'});
 });
});
