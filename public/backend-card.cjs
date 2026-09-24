const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('backend/Code.gs', 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
let count = 0;
function check(user, body, allowed) {
  assert.equal(ctx.validateCardQr_(user, body) === null, allowed); count++;
}
check({qrEnabled:true,qrVersion:2},{cardQrVersion:2},true);
check({qrEnabled:true,qrVersion:2},{cardQrVersion:1},false);
check({qrEnabled:false,qrVersion:2},{cardQrVersion:2},false);
check({qrEnabled:'false',qrVersion:2},{cardQrVersion:2},false);
check({qrEnabled:'true',qrVersion:''},{cardQrVersion:1},true);
for (const value of [0,-1,1.5,'bad',Infinity]) check({qrEnabled:true,qrVersion:2},{cardQrVersion:value},false);
check({qrEnabled:false,qrVersion:2},{},true); // legacy compatibility is intentional
let writes = 0, locked = false;
ctx.withUserLock_ = fn => { locked=true; try{return fn();}finally{locked=false;} };
ctx.getOrCreateSheet_ = () => ({});
ctx.findRowByField_ = (_s,_f,value) => value==='buyer'?2:3;
ctx.rowToObject_ = (_s,index) => ({account:index===2?'buyer':'merchant',qrEnabled:true,qrVersion:2,balance:500,hasCreditCard:true,availableCredit:500,creditSchedules:[]});
ctx.writeUserObject_ = () => {assert.equal(locked,true);writes++;};
ctx.appendTransaction_ = () => {};
ctx.currentGameDay_ = () => 1;
ctx.Utilities = {getUuid:()=> 'test'};
for (const [handler, payload] of [
 ['handleTransfer_',{fromAccount:'buyer',toAccount:'merchant',amount:100}],
 ['handleCreditPurchase_',{buyerAccount:'buyer',merchantAccount:'merchant',amount:100,days:3}],
]) {
 writes=0;
 assert.equal(ctx[handler]({...payload,cardQrVersion:1}).ok,false);
 assert.equal(writes,0);
 assert.equal(ctx[handler]({...payload,cardQrVersion:2}).ok,true);
 assert.equal(writes,2); count+=2;
}
assert.equal(ctx.handleDirectoryLookup_('buyer').user.qrVersion,2);count++;
console.log(`${count} backend card checks passed; no live API calls.`);
