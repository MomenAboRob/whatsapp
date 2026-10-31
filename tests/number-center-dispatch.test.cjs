const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

test('number dispatch waits between recipients and cannot repeat a completed batch', async () => {
  const project = process.cwd();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'number-dispatch-test-'));
  const libDir = path.join(sandbox, 'lib');
  fs.mkdirSync(libDir);
  for (const name of ['number-center', 'number-center-dispatch']) {
    const source = fs.readFileSync(path.join(project, 'lib', `${name}.ts`), 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    fs.writeFileSync(path.join(libDir, `${name}.js`), code);
  }
  fs.writeFileSync(path.join(sandbox, 'package.json'), '{"type":"commonjs"}');
  const center = require(path.join(libDir, 'number-center.js'));
  const dispatch = require(path.join(libDir, 'number-center-dispatch.js'));
  const previousCwd = process.cwd();
  try {
    process.chdir(sandbox);
    center.saveNumberCenter('test', {
      files: [], branches: [], dispatches: [],
      allocations: [
        { id: 'one', batchId: 'batch', fileId: 'file', personJid: '111111111@s.whatsapp.net', personName: 'الأول', numbers: ['1234567', '7654321'], createdAt: new Date().toISOString() },
        { id: 'two', batchId: 'batch', fileId: 'file', personJid: '222222222@s.whatsapp.net', personName: 'الثاني', numbers: ['3333333'], createdAt: new Date().toISOString() },
      ],
    });
    const sent = [];
    const fakeWhatsApp = {
      getStatus: () => ({ status: 'CONNECTED' }),
      forwardMessage: async (jid, text) => {
        sent.push({ jid, text, at: Date.now() });
        return { success: true, message: 'mock accepted' };
      },
    };
    dispatch.startNumberDispatch('test', 'batch');
    await dispatch.runNumberDispatch('test', 'batch', fakeWhatsApp);
    assert.equal(sent.length, 2);
    assert.equal(sent[0].text, '1234567\n7654321');
    assert.ok(sent[1].at - sent[0].at >= 14_500, 'messages must be spaced by about 15 seconds');
    assert.deepEqual(center.readNumberCenter('test').dispatches[0].items.map((item) => item.status), ['sent', 'sent']);
    assert.throws(() => dispatch.startNumberDispatch('test', 'batch'), /أُرسلت هذه الدفعة/);

    const interrupted = center.readNumberCenter('test');
    interrupted.allocations.push(
      { id: 'uncertain', batchId: 'batch-2', fileId: 'file', personJid: '333333333@s.whatsapp.net', personName: 'الثالث', numbers: ['4444444'], createdAt: new Date().toISOString() },
      { id: 'remaining', batchId: 'batch-2', fileId: 'file', personJid: '444444444@s.whatsapp.net', personName: 'الرابع', numbers: ['5555555'], createdAt: new Date().toISOString() },
    );
    interrupted.dispatches.push({ id: 'interrupted', batchId: 'batch-2', status: 'running', createdAt: new Date().toISOString(), items: [
      { allocationId: 'uncertain', status: 'sending' },
      { allocationId: 'remaining', status: 'pending' },
    ] });
    center.saveNumberCenter('test', interrupted);
    const beforeResume = sent.length;
    await dispatch.runNumberDispatch('test', 'batch-2', fakeWhatsApp);
    assert.deepEqual(sent.slice(beforeResume).map((item) => item.jid), ['444444444@s.whatsapp.net']);
    assert.deepEqual(center.readNumberCenter('test').dispatches[1].items.map((item) => item.status), ['uncertain', 'sent']);
  } finally {
    process.chdir(previousCwd);
    if (sandbox.startsWith(os.tmpdir() + path.sep)) fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
